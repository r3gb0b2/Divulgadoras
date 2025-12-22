
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

// --- WhatsApp Helper (Z-API) ---
async function sendWhatsApp(to, message, organizationId) {
    // Busca credenciais da organização ou usa padrão do sistema
    const orgSnap = await db.collection('organizations').doc(organizationId).get();
    const orgData = orgSnap.data();
    
    // Configurações da Z-API (Devem ser configuradas no Firebase Config ou Secret Manager)
    // firebase functions:config:set zapi.instance="SUA_INSTANCIA" zapi.token="SEU_TOKEN"
    const zapiConfig = functions.config().zapi || {};
    const instance = zapiConfig.instance;
    const token = zapiConfig.token;

    if (!instance || !token) {
        console.warn("WhatsApp não enviado: Credenciais Z-API não configuradas nas functions.");
        return { success: false, message: "Z-API credentials missing" };
    }

    const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: to.replace(/\D/g, ''),
                message: message
            })
        });
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error("Erro ao enviar WhatsApp:", error);
        return { success: false, error: error.message };
    }
}

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
        await promoterRef.update(updateData);

        // AÇÃO: Se o status mudou para APROVADO
        if (updateData.status === 'approved' && oldPromoterData.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(oldPromoterData.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };
            
            // 1. Enviar E-mail
            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h1 style="color: #22c55e;">Parabéns, ${oldPromoterData.name}! 🎉</h1>
                    <p>Seu cadastro na equipe <strong>${org.name}</strong> foi APROVADO!</p>
                    <p>Acesse seu portal para ver as tarefas e materiais de divulgação.</p>
                </div>
            `;
            await sendEmail({
                toEmail: oldPromoterData.email,
                toName: oldPromoterData.name,
                subject: `Seu cadastro na ${org.name} foi aprovado! 🎉`,
                htmlContent: html
            });

            // 2. Enviar WhatsApp Automático
            const waMessage = `Olá ${oldPromoterData.name.split(' ')[0]}! Seu cadastro na equipe *${org.name}* foi APROVADO! 🎉\n\nAcesse seu portal para ver suas tarefas: https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(oldPromoterData.email)}`;
            await sendWhatsApp(oldPromoterData.whatsapp, waMessage, oldPromoterData.organizationId);
        }
        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { messageTemplate, filters, organizationId } = data;
    const promoterIds = filters.promoterIds || [];

    if (promoterIds.length === 0) return { success: false, message: "Nenhum destinatário." };

    let count = 0;
    let failures = 0;

    try {
        const chunks = [];
        for (let i = 0; i < promoterIds.length; i += 10) {
            chunks.push(promoterIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const snap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
            
            const promises = snap.docs.map(doc => {
                const p = doc.data();
                const personalizedMsg = messageTemplate
                    .replace(/{{name}}/g, p.name.split(' ')[0])
                    .replace(/{{fullName}}/g, p.name)
                    .replace(/{{email}}/g, p.email)
                    .replace(/{{campaignName}}/g, p.campaignName || 'Eventos')
                    .replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);
                
                return sendWhatsApp(p.whatsapp, personalizedMsg, organizationId);
            });

            const results = await Promise.all(promises);
            results.forEach(res => res.success ? count++ : failures++);
        }

        return { success: true, count, failures, message: `Campanha processada: ${count} envios, ${failures} falhas.` };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

// ... rest of the existing functions (notifyPostPush, sendPushCampaign, etc) ...

exports.notifyPostPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    try {
        const postSnap = await db.collection('posts').doc(postId).get();
        if (!postSnap.exists) return { success: false, message: "Post não encontrado" };
        const post = postSnap.data();
        const assignmentsSnap = await db.collection('postAssignments').where('postId', '==', postId).get();
        const promoterIds = assignmentsSnap.docs.map(doc => doc.data().promoterId);
        if (promoterIds.length === 0) return { success: true, message: "Nenhuma divulgadora para notificar." };
        const tokens = [];
        const promotersSnap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds.slice(0, 10)).get();
        promotersSnap.forEach(doc => {
            const p = doc.data();
            if (p.fcmToken) tokens.push(p.fcmToken);
        });
        if (tokens.length > 0) {
            const message = {
                notification: {
                    title: `Nova Tarefa: ${post.campaignName}`,
                    body: `Uma nova postagem foi liberada. Acesse agora para baixar o material!`
                },
                data: { url: "/#/posts" },
                tokens: tokens
            };
            const response = await admin.messaging().sendEachForMulticast(message);
            return { success: true, message: `Push enviado para ${response.successCount} aparelhos.` };
        }
        return { success: true, message: "Nenhum aparelho com App vinculado encontrado." };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { title, body, url, promoterIds } = data;
    try {
        const tokens = [];
        const chunks = [];
        for (let i = 0; i < promoterIds.length; i += 30) {
            chunks.push(promoterIds.slice(i, i + 30));
        }
        for (const chunk of chunks) {
            const snap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
            snap.forEach(doc => {
                if (doc.data().fcmToken) tokens.push(doc.data().fcmToken);
            });
        }
        if (tokens.length === 0) return { success: false, message: "Nenhum token encontrado." };
        const message = {
            notification: { title, body },
            data: { url: url || "/#/posts" },
            tokens: tokens
        };
        const response = await admin.messaging().sendEachForMulticast(message);
        return { success: true, message: `Enviado com sucesso para ${response.successCount} aparelhos.` };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.manuallySendStatusEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId } = data;
    try {
        const pSnap = await db.collection('promoters').doc(promoterId).get();
        const p = pSnap.data();
        if (!p) throw new Error("Promoter not found");
        const html = `<div style="font-family: sans-serif;"><h2>Olá, ${p.name}</h2><p>Este é um lembrete de que seu cadastro foi aprovado.</p></div>`;
        await sendEmail({
            toEmail: p.email,
            toName: p.name,
            subject: "Lembrete: Seu cadastro está aprovado! 🎉",
            htmlContent: html
        });
        return { success: true, message: "E-mail reenviado." };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.acceptAllJustifications = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    try {
        const snap = await db.collection('postAssignments')
            .where('postId', '==', postId)
            .where('justificationStatus', '==', 'pending')
            .get();
        const batch = db.batch();
        snap.forEach(doc => {
            batch.update(doc.ref, { justificationStatus: 'accepted' });
        });
        await batch.commit();
        return { success: true, count: snap.size, message: `${snap.size} justificativas aceitas.` };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId, promoterIds } = data;
    try {
        const postSnap = await db.collection('posts').doc(postId).get();
        const post = postSnap.data();
        const batch = db.batch();
        const pSnaps = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds).get();
        pSnaps.forEach(pDoc => {
            const p = pDoc.data();
            const ref = db.collection('postAssignments').doc();
            batch.set(ref, {
                postId, post, promoterId: pDoc.id, promoterEmail: p.email, promoterName: p.name,
                organizationId: post.organizationId, status: 'pending', confirmedAt: null, proofSubmittedAt: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
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
        const batch = db.batch();
        assignedPromoters.forEach(p => {
            const assignmentRef = db.collection('postAssignments').doc();
            batch.set(assignmentRef, { 
                postId: postRef.id, post: postData, promoterId: p.id, promoterEmail: p.email, promoterName: p.name, 
                organizationId: postData.organizationId, status: 'pending', confirmedAt: null, proofSubmittedAt: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        return { success: true, postId: postRef.id };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.deletePostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    try {
        const assignments = await db.collection('postAssignments').where('postId', '==', postId).get();
        const batch = db.batch();
        assignments.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('posts').doc(postId));
        await batch.commit();
        return { success: true };
    } catch (e) {
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
