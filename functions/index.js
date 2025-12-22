
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
    const key = (functions.config().brevo ? functions.config().brevo.key : null) || process.env.BREVO_API_KEY;
    
    if (!key) {
        console.error("ERRO: Brevo API Key não encontrada.");
        return null;
    }

    const defaultClient = sib.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = key;

    return new sib.TransactionalEmailsApi();
};

const brevoApi = setupBrevo();

async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!brevoApi) return { success: false, message: "API Key missing" };
    try {
        const email = new sib.SendSmtpEmail();
        email.sender = { name: "Equipe Certa", email: "contato@equipecerta.com.br" };
        email.to = [{ email: toEmail, name: toName }];
        email.subject = subject;
        email.htmlContent = htmlContent;
        
        await brevoApi.sendTransacEmail(email);
        return { success: true };
    } catch (e) {
        console.error("ERRO BREVO:", e.response ? JSON.stringify(e.response.body) : e.message);
        return { success: false, error: e.message };
    }
}

// --- Cloud Functions ---

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
        
        const oldPromoterData = snapshot.data();

        // Atualiza o banco de dados
        await promoterRef.update(updateData);

        // Se o status mudou para aprovado
        if (updateData.status === 'approved' && oldPromoterData.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(oldPromoterData.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };
            
            // PRIORIDADE: Pega o nome do evento que veio no updateData, se não houver, usa o que já estava no banco
            const eventName = updateData.campaignName || oldPromoterData.campaignName || "nosso banco de talentos";

            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h1 style="color: #22c55e;">Parabéns, ${oldPromoterData.name}! 🎉</h1>
                    <p>Seu cadastro na equipe <strong>${org.name}</strong> para o evento <strong>${eventName}</strong> foi APROVADO!</p>
                    <p>Acesse seu portal para ver as regras e entrar no grupo de trabalho.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(oldPromoterData.email)}" 
                           style="background: #7e39d5; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                           ACESSAR MEU PORTAL
                        </a>
                    </div>
                </div>
            `;

            await sendEmail({
                toEmail: oldPromoterData.email,
                toName: oldPromoterData.name,
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
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return { text: response.text };
    } catch (error) {
        throw new functions.https.HttpsError("internal", "Erro ao processar IA.");
    }
});

exports.setPromoterStatusToRemoved = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId } = data;
    try {
        await db.collection('promoters').doc(promoterId).update({
            status: 'removed',
            statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
            actionTakenByEmail: context.auth.token.email
        });
        const assignments = await db.collection('postAssignments').where('promoterId', '==', promoterId).where('status', '==', 'pending').get();
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
    try {
        const updateData = { fcmToken: token, lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp() };
        if (metadata) updateData.pushDiagnostics = { ...metadata, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
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
        const postRef = await db.collection('posts').add({ ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        const postId = postRef.id;
        const batch = db.batch();
        assignedPromoters.forEach(p => {
            const assignmentRef = db.collection('postAssignments').doc();
            batch.set(assignmentRef, { postId, post: postData, promoterId: p.id, promoterEmail: p.email, promoterName: p.name, organizationId: postData.organizationId, status: 'pending', confirmedAt: null, proofSubmittedAt: null });
        });
        await batch.commit();
        return { success: true, postId };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});
