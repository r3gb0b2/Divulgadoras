
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const SibApiV3Sdk = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- CONFIGURAÇÃO BREVO (EMAIL) ---
const setupBrevo = () => {
    const apiKey = functions.config().brevo?.key;
    if (!apiKey) return null;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

// --- FUNÇÕES DE TEMPLATE DE EMAIL ---

const DEFAULT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; }
        .header { text-align: center; margin-bottom: 30px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #7e39d5; color: #ffffff !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { font-size: 12px; color: #999; margin-top: 40px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>Equipe Certa</h1></div>
        <p>Olá, <strong>{{promoterName}}</strong>!</p>
        <p>Temos uma ótima notícia: Seu perfil foi <strong>aprovado</strong> para participar da divulgação do evento <strong>{{campaignName}}</strong> na organização <strong>{{orgName}}</strong>!</p>
        <p>Agora você já pode acessar o seu portal para visualizar tarefas, baixar materiais e enviar seus comprovantes.</p>
        <div style="text-align: center;">
            <a href="{{portalLink}}" class="button">ACESSAR MEU PORTAL</a>
        </div>
        <p>Seja bem-vinda à equipe!</p>
        <div class="footer">
            <p>Este é um e-mail automático enviado por Equipe Certa em nome de {{orgName}}.</p>
        </div>
    </div>
</body>
</html>
`;

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const doc = await db.collection("settings").doc("emailTemplate").get();
    return { htmlContent: doc.exists ? doc.data().htmlContent : DEFAULT_TEMPLATE };
});

exports.getDefaultEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    return { htmlContent: DEFAULT_TEMPLATE };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'superadmin') throw new functions.https.HttpsError("permission-denied", "Apenas superadmins.");
    await db.collection("settings").doc("emailTemplate").set({ htmlContent: data.htmlContent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});

exports.resetEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (context.auth.token.role !== 'superadmin') throw new functions.https.HttpsError("permission-denied", "Apenas superadmins.");
    await db.collection("settings").doc("emailTemplate").delete();
    return { success: true };
});

// --- DISPARO DE TESTE E PRODUÇÃO ---

exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const brevo = setupBrevo();
    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "API Key da Brevo não configurada no Firebase.");

    const senderEmail = functions.config().brevo?.email || "contato@agenciavitrine.com";
    const testTarget = context.auth.token.email;
    
    let htmlContent = data.testType === 'system_check' ? "<h1>Teste de Sistema</h1><p>Se você recebeu isso, a integração Brevo/SMTP está funcionando corretamente.</p>" : data.customHtmlContent;

    // Replace placeholders for test
    htmlContent = htmlContent
        .replace(/{{promoterName}}/g, "Administrador Teste")
        .replace(/{{campaignName}}/g, "Evento Demonstração")
        .replace(/{{orgName}}/g, "Minha Produtora")
        .replace(/{{portalLink}}/g, "https://divulgadoras.vercel.app");

    try {
        await brevo.sendTransacEmail({
            sender: { email: senderEmail, name: "Equipe Certa (Teste)" },
            to: [{ email: testTarget }],
            subject: data.testType === 'system_check' ? "Teste de Conexão Brevo" : "Teste de Layout de Aprovação",
            htmlContent: htmlContent
        });
        return { success: true, message: `E-mail enviado com sucesso para ${testTarget}` };
    } catch (error) {
        console.error("Erro Brevo:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// --- SINCRONIZAÇÃO E NOTIFICAÇÃO DE APROVAÇÃO ---

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    if (!promoterId) throw new functions.https.HttpsError("invalid-argument", "ID ausente.");

    const promoterRef = db.collection("promoters").doc(promoterId);
    const promoterSnap = await promoterRef.get();
    if (!promoterSnap.exists) throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
    
    const oldData = promoterSnap.data();
    const isApproving = updateData.status === 'approved' && oldData.status !== 'approved';

    // 1. Atualiza Perfil Principal
    await promoterRef.update({
        ...updateData,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        actionTakenByEmail: context.auth.token.email
    });

    // 2. Se for APROVAÇÃO, dispara notificações
    if (isApproving) {
        const orgDoc = await db.collection("organizations").doc(oldData.organizationId).get();
        const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Produtora";
        const campaignName = updateData.campaignName || oldData.campaignName || "Evento";
        const portalUrl = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(oldData.email)}`;

        // A) Enviar Email
        try {
            const brevo = setupBrevo();
            if (brevo) {
                const templateDoc = await db.collection("settings").doc("emailTemplate").get();
                let html = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_TEMPLATE;
                
                html = html
                    .replace(/{{promoterName}}/g, oldData.name)
                    .replace(/{{campaignName}}/g, campaignName)
                    .replace(/{{orgName}}/g, orgName)
                    .replace(/{{portalLink}}/g, portalUrl);

                await brevo.sendTransacEmail({
                    sender: { email: functions.config().brevo?.email || "contato@agenciavitrine.com", name: orgName },
                    to: [{ email: oldData.email }],
                    subject: `✅ Seu perfil foi aprovado para: ${campaignName}`,
                    htmlContent: html
                });
            }
        } catch (e) { console.error("Falha ao enviar email de aprovacao:", e); }

        // B) Enviar WhatsApp (Aprovação e Postagem Nova)
        try {
            const zToken = functions.config().zapi?.token;
            const zInstance = functions.config().zapi?.instance;
            
            if (zToken && zInstance) {
                const waMessage = `Olá *${oldData.name.split(' ')[0]}*! 🎉\n\nSeu perfil foi *APROVADO* para participar da equipe do evento *${campaignName}*.\n\n🚀 *Postagem Nova:* Já temos materiais disponíveis no seu portal. Acesse agora para garantir sua participação!\n\n🔗 *Seu Portal:* ${portalUrl}\n\nSeja bem-vinda!`;
                
                const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
                await fetch(`https://api.z-api.io/instances/${zInstance}/token/${zToken}/send-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: `55${oldData.whatsapp.replace(/\D/g, '')}`, text: waMessage })
                });
            }
        } catch (e) { console.error("Falha ao enviar WA de aprovacao:", e); }
    }

    return { success: true };
});

// --- MOTOR DE PUSH (MANTIDO DO ANTERIOR) ---

const sendPushToToken = async (token, title, body, url, metadata = {}) => {
    if (!token) return { success: false, error: "Token ausente." };
    const message = {
        notification: { title, body },
        data: { url: url || "/#/posts", ...metadata },
        token: token,
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default", badge: 1 } } }
    };
    try {
        await admin.messaging().send(message);
        return { success: true };
    } catch (error) {
        console.error("Erro FCM:", error.message);
        return { success: false, error: error.message };
    }
};

exports.testSelfPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { fcmToken, name } = data;
    if (!fcmToken) throw new functions.https.HttpsError("invalid-argument", "Token não encontrado.");
    return await sendPushToToken(fcmToken, "Teste de Conexão 🚀", `Olá ${name.split(' ')[0]}, seu celular está pronto!`, "/#/posts", { type: "test_push" });
});

exports.sendPushReminderImmediately = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { reminderId } = data;
    const snap = await db.collection("pushReminders").doc(reminderId).get();
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Lembrete não encontrado.");
    const r = snap.data();
    const result = await sendPushToToken(r.fcmToken, r.title, r.body, r.url, { assignmentId: r.assignmentId });
    if (result.success) {
        await snap.ref.update({ status: "sent", sentAt: admin.firestore.Timestamp.now() });
        return { success: true };
    } else {
        throw new functions.https.HttpsError("internal", result.error);
    }
});
