
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
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Brevo Configuration ---
const setupBrevo = () => {
    // Tenta pegar do config antigo ou da nova variável de ambiente
    const key = (functions.config().brevo ? functions.config().brevo.key : null) || process.env.BREVO_API_KEY;
    
    if (!key) {
        console.error("ERRO: Brevo API Key não encontrada. Configure BREVO_API_KEY no painel ou via CLI.");
        return null;
    }

    const defaultClient = sib.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = key;

    return new sib.TransactionalEmailsApi();
};

const brevoApi = setupBrevo();

/**
 * Função genérica para envio de e-mail via Brevo
 */
async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!brevoApi) {
        console.error("Envio abortado: API não configurada.");
        return { success: false, message: "API Key missing" };
    }
    try {
        const email = new sib.SendSmtpEmail();
        // IMPORTANTE: Este e-mail deve estar validado no seu painel do Brevo em "Senders & Domains"
        email.sender = { name: "Equipe Certa", email: "contato@equipecerta.com.br" };
        email.to = [{ email: toEmail, name: toName }];
        email.subject = subject;
        email.htmlContent = htmlContent;
        
        const result = await brevoApi.sendTransacEmail(email);
        console.log(`E-mail enviado com sucesso para ${toEmail}. MessageID: ${result.messageId}`);
        return { success: true };
    } catch (e) {
        console.error("ERRO BREVO:", e.response ? JSON.stringify(e.response.body) : e.message);
        return { success: false, error: e.message };
    }
}

// --- Cloud Functions ---

/**
 * Gatilho automático: Dispara e-mail assim que um novo cadastro é criado no banco
 */
exports.onPromoterCreate = functions.region("southamerica-east1").firestore
    .document('promoters/{promoterId}')
    .onCreate(async (snap, context) => {
        const promoter = snap.data();
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #7e39d5;">Olá, ${promoter.name}!</h2>
                <p>Recebemos sua inscrição para a equipe <strong>${promoter.campaignName || 'Geral'}</strong>.</p>
                <p>Seu perfil agora passará por uma análise da nossa equipe de produção.</p>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Como acompanhar?</strong></p>
                    <p style="margin: 5px 0 0 0;">Acesse nosso site e clique em <strong>"Verificar Status"</strong> usando seu e-mail: <em>${promoter.email}</em></p>
                </div>
                <p>Boa sorte! 🚀</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 10px; color: #999;">Esta é uma mensagem automática da plataforma Equipe Certa.</p>
            </div>
        `;

        return sendEmail({
            toEmail: promoter.email,
            toName: promoter.name,
            subject: `Recebemos seu cadastro! - ${promoter.campaignName || 'Equipe Certa'}`,
            htmlContent: html
        });
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

        // Notificação de APROVAÇÃO
        if (updateData.status === 'approved' && promoter.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(promoter.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };
            const eventName = promoter.campaignName || "nosso banco de talentos";

            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h1 style="color: #22c55e;">Parabéns, ${promoter.name}! 🎉</h1>
                    <p>Seu cadastro na equipe <strong>${org.name}</strong> para o evento <strong>${eventName}</strong> foi APROVADO!</p>
                    <p>A partir de agora, você já pode acessar seu portal para ver as regras oficiais e entrar no grupo de trabalho.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoter.email)}" 
                           style="background: #7e39d5; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                           ACESSAR MEU PORTAL
                        </a>
                    </div>
                    <p>Seja bem-vinda ao time!</p>
                </div>
            `;

            await sendEmail({
                toEmail: promoter.email,
                toName: promoter.name,
                subject: `Seu cadastro na ${org.name} foi aprovado! 🎉`,
                htmlContent: html
            });
        }
        return { success: true };
    } catch (e) {
        console.error("Erro na função updatePromoterAndSync:", e.message);
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Apenas administradores podem usar a IA.");
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "O prompt é obrigatório.");

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return { text: response.text };
    } catch (error) {
        console.error("Gemini Error:", error);
        throw new functions.https.HttpsError("internal", "Erro ao processar IA.");
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
