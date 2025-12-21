
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sib = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Brevo Configuration ---
const setupBrevo = () => {
    const config = functions.config().brevo;
    if (!config || !config.key) {
        console.warn("Brevo API Key não configurada. Use: firebase functions:config:set brevo.key='SUA_CHAVE'");
        return null;
    }
    const apiInstance = new sib.TransactionalEmailsApi();
    apiInstance.setApiKey(0, config.key); // 0 é o índice padrão para ApiKey na maioria das versões
    return apiInstance;
};

const brevoApi = setupBrevo();

async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!brevoApi) {
        console.error("Tentativa de envio de e-mail sem API Key configurada.");
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

// --- Cloud Messaging (Push Notifications) ---
exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token } = data;
    if (!promoterId || !token) throw new functions.https.HttpsError("invalid-argument", "Dados obrigatórios ausentes.");
    await db.collection('promoters').doc(promoterId).update({
        fcmToken: token,
        lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});

// --- Triggers de E-mail ---
exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId, data: updateData } = data;

    try {
        const promoterRef = db.collection('promoters').doc(promoterId);
        const snapshot = await promoterRef.get();
        if (!snapshot.exists) throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        const promoter = snapshot.data();

        await promoterRef.update(updateData);

        if (updateData.status === 'approved' && promoter.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(promoter.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };
            
            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #7e39d5; border-radius: 10px;">
                    <h1 style="color: #7e39d5;">Parabéns, ${promoter.name}!</h1>
                    <p>Seu perfil foi aprovado para a equipe <strong>${org.name}</strong>.</p>
                    <p>Acesse seu portal para ver suas tarefas e links de convidados.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${promoter.email}" style="background-color: #7e39d5; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">ACESSAR MEU PORTAL</a>
                    </div>
                </div>
            `;
            await sendEmail({ toEmail: promoter.email, toName: promoter.name, subject: "Seu cadastro foi aprovado! 🎉", htmlContent: html });
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
        const postRef = await db.collection('posts').add({ ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        const batch = db.batch();
        assignedPromoters.forEach(p => {
            const assignmentRef = db.collection('postAssignments').doc();
            batch.set(assignmentRef, {
                postId: postRef.id, post: postData, promoterId: p.id, promoterEmail: p.email,
                promoterName: p.name, organizationId: postData.organizationId, status: 'pending',
                confirmedAt: null, proofSubmittedAt: null
            });
        });
        await batch.commit();

        assignedPromoters.forEach(async (p) => {
            const html = `<div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #7e39d5;">Nova postagem disponível! 🚀</h2>
                <p>Olá ${p.name}, uma nova tarefa foi liberada para você.</p>
                <p>Evento: <strong>${postData.campaignName}</strong></p>
                <a href="https://divulgadoras.vercel.app/#/posts?email=${p.email}" style="color: #7e39d5; font-weight: bold;">VER NO MEU PORTAL</a>
            </div>`;
            await sendEmail({ toEmail: p.email, toName: p.name, subject: `Nova postagem: ${postData.campaignName}`, htmlContent: html });
        });

        return { success: true, postId: postRef.id };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});
