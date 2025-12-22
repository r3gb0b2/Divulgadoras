
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sib = require("@getbrevo/brevo");
const { GoogleGenAI } = require("@google/genai");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Gemini API Setup ---
const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Brevo Configuration ---
const setupBrevo = () => {
    const config = functions.config().brevo;
    const key = config ? config.key : null;
    
    if (!key) {
        console.warn("Brevo API Key não configurada no Firebase Config.");
        return null;
    }

    const defaultClient = sib.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = key;

    return new sib.TransactionalEmailsApi();
};

const brevoApi = setupBrevo();

async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!brevoApi) {
        console.error("Tentativa de envio de e-mail falhou: Brevo API não inicializada.");
        return { success: false, message: "API Key missing" };
    }
    try {
        const email = new sib.SendSmtpEmail();
        email.sender = { name: "Equipe Certa", email: "contato@equipecerta.com.br" };
        email.to = [{ email: toEmail, name: toName }];
        email.subject = subject;
        email.htmlContent = htmlContent;
        await brevoApi.sendTransacEmail(email);
        return { success: true };
    } catch (e) {
        console.error("Erro ao enviar e-mail via Brevo:", e.response ? e.response.body : e.message);
        return { success: false, error: e.message };
    }
}

// --- Cloud Functions ---

exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Apenas administradores podem usar a IA.");
    
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "O prompt é obrigatório.");

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return { text: response.text };
    } catch (error) {
        console.error("Gemini Error:", error);
        throw new functions.https.HttpsError("internal", "Erro ao processar solicitação na IA.");
    }
});

exports.setPromoterStatusToRemoved = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId } = data;

    try {
        const promoterRef = db.collection('promoters').doc(promoterId);
        await promoterRef.update({
            status: 'removed',
            statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
            actionTakenByEmail: context.auth.token.email
        });

        const assignments = await db.collection('postAssignments')
            .where('promoterId', '==', promoterId)
            .where('status', '==', 'pending')
            .get();

        const batch = db.batch();
        assignments.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token, metadata } = data;
    if (!promoterId || !token) throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");

    try {
        const updateData = {
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp()
        };

        // Se houver metadados (plataforma), salva para facilitar o filtro no Admin
        if (metadata) {
            updateData.pushDiagnostics = {
                ...metadata,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
        }

        await db.collection('promoters').doc(promoterId).update(updateData);
        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId, data: updateData } = data;

    try {
        const promoterRef = db.collection('promoters').doc(promoterId);
        const snapshot = await promoterRef.get();
        if (!snapshot.exists) throw new functions.https.HttpsError("not-found", "Promoter not found");
        const promoter = snapshot.data();

        await promoterRef.update(updateData);

        if (updateData.status === 'approved' && promoter.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(promoter.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };
            const eventName = promoter.campaignName || "nosso banco de talentos";

            const html = `<div style="font-family: sans-serif; padding: 20px;"><h1>Parabéns, ${promoter.name}!</h1><p>Você foi aprovada na equipe ${org.name} para o evento ${eventName}!</p></div>`;

            await sendEmail({
                toEmail: promoter.email,
                toName: promoter.name,
                subject: `Seu cadastro na ${org.name} foi aprovado! 🎉`,
                htmlContent: html
            });
        }
        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postData, assignedPromoters } = data;

    try {
        const postRef = await db.collection('posts').add({
            ...postData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const postId = postRef.id;

        const batch = db.batch();
        assignedPromoters.forEach(p => {
            const assignmentRef = db.collection('postAssignments').doc();
            batch.set(assignmentRef, {
                postId,
                post: postData,
                promoterId: p.id,
                promoterEmail: p.email,
                promoterName: p.name,
                organizationId: postData.organizationId,
                status: 'pending',
                confirmedAt: null,
                proofSubmittedAt: null
            });
        });
        await batch.commit();
        return { success: true, postId };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});
