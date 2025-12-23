
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const SibApiV3Sdk = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- UTILITÁRIO DE CONFIGURAÇÃO ---
const getConfig = () => {
    const config = functions.config();
    return {
        brevoKey: config.brevo?.key || null,
        brevoEmail: config.brevo?.email || "contato@agenciavitrine.com",
        zApiToken: config.zapi?.token || null,
        zApiInstance: config.zapi?.instance || null,
        zApiClientToken: config.zapi?.client_token || ""
    };
};

// --- CONFIGURAÇÃO BREVO ---
const setupBrevo = (apiKey) => {
    if (!apiKey) return null;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

const DEFAULT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; }
        .header { text-align: center; margin-bottom: 30px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #7e39d5; color: #ffffff !important; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>Equipe Certa</h1></div>
        <p>Olá, <strong>{{promoterName}}</strong>!</p>
        <p>Seu perfil foi <strong>aprovado</strong> para o evento <strong>{{campaignName}}</strong> em <strong>{{orgName}}</strong>!</p>
        <div style="text-align: center;">
            <a href="{{portalLink}}" class="button">ACESSAR MEU PORTAL</a>
        </div>
        <p>Seja bem-vinda!</p>
    </div>
</body>
</html>
`;

// --- FUNÇÕES DE TEMPLATE ---
exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    try {
        const doc = await db.collection("settings").doc("emailTemplate").get();
        return { htmlContent: doc.exists ? doc.data().htmlContent : DEFAULT_TEMPLATE };
    } catch (e) { return { htmlContent: DEFAULT_TEMPLATE }; }
});

exports.getDefaultEmailTemplate = functions.region("southamerica-east1").https.onCall(async () => {
    return { htmlContent: DEFAULT_TEMPLATE };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'superadmin') {
        throw new functions.https.HttpsError("permission-denied", "Acesso restrito.");
    }
    await db.collection("settings").doc("emailTemplate").set({ 
        htmlContent: data.htmlContent, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    });
    return { success: true };
});

exports.resetEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'superadmin') throw new functions.https.HttpsError("permission-denied", "Acesso restrito.");
    await db.collection("settings").doc("emailTemplate").delete();
    return { success: true };
});

// --- DISPAROS DE TESTE ---
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);
    
    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "Chave Brevo não configurada.");

    const testTarget = context.auth?.token?.email || "suporte@equipecerta.com";
    let html = data.testType === 'system_check' ? "<h1>Teste OK</h1><p>Sistema Brevo funcionando.</p>" : data.customHtmlContent || DEFAULT_TEMPLATE;
    
    // Simplificando placeholders para teste
    html = html.replace(/{{promoterName}}/g, "Administrador")
               .replace(/{{campaignName}}/g, "Evento Teste")
               .replace(/{{orgName}}/g, "Equipe Certa")
               .replace(/{{portalLink}}/g, "#");

    try {
        await brevo.sendTransacEmail({
            sender: { email: config.brevoEmail, name: "Equipe Certa" },
            to: [{ email: testTarget }],
            subject: "Teste de E-mail Transacional",
            htmlContent: html
        });
        return { success: true, message: `E-mail enviado para ${testTarget}` };
    } catch (error) {
        console.error("Erro Brevo Test:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    if (!config.zApiToken || !config.zApiInstance) {
        return { result: { success: false, message: "Z-API não configurada nas variáveis do Firebase." } };
    }

    try {
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
            body: JSON.stringify({ phone: "5585982280780", text: "Teste de Conexão: Super Admin Dashboard" })
        });
        const resData = await response.json();
        return { 
            result: { success: response.ok, message: response.ok ? "WhatsApp Conectado!" : "Erro na Z-API: " + (resData.message || "Desconhecido") },
            status: response.status
        };
    } catch (error) {
        return { result: { success: false, message: "Erro de Rede: " + error.message } };
    }
});

// --- FUNÇÃO CORE: APROVAÇÃO E SINCRONIZAÇÃO ---
exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    if (!promoterId) throw new functions.https.HttpsError("invalid-argument", "ID ausente.");

    const promoterRef = db.collection("promoters").doc(promoterId);
    const snap = await promoterRef.get();
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Promoter não encontrada.");
    
    const oldData = snap.data();
    const config = getConfig();
    const isApproving = updateData.status === 'approved' && oldData.status !== 'approved';

    // 1. Atualizar no Banco
    await promoterRef.update({
        ...updateData,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        actionTakenByEmail: context.auth?.token?.email || "sistema"
    });

    if (isApproving) {
        console.log(`Iniciando notificações para aprovação de: ${oldData.email}`);
        
        const orgDoc = await db.collection("organizations").doc(oldData.organizationId).get();
        const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Produtora";
        const campaignName = updateData.campaignName || oldData.campaignName || "Evento Selecionado";
        const portalUrl = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(oldData.email)}`;

        // A) WHATSAPP
        if (config.zApiToken && config.zApiInstance) {
            const waMsg = `Olá *${oldData.name.split(' ')[0]}*! 🎉\n\nSeu perfil foi *APROVADO* para participar da equipe do evento: *${campaignName}*.\n\n🚀 *Postagem Nova:* Já temos materiais disponíveis para você no portal.\n\n🔗 *Acesse aqui:* ${portalUrl}\n\nSeja bem-vinda!`;
            try {
                await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
                    body: JSON.stringify({ phone: `55${oldData.whatsapp.replace(/\D/g, '')}`, text: waMsg })
                });
                console.log("WA Enviado com sucesso.");
            } catch (e) { console.error("Falha WA Aprovacao:", e.message); }
        }

        // B) E-MAIL (BREVO)
        const brevo = setupBrevo(config.brevoKey);
        if (brevo) {
            try {
                const templateDoc = await db.collection("settings").doc("emailTemplate").get();
                let html = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_TEMPLATE;
                
                html = html.replace(/{{promoterName}}/g, oldData.name)
                           .replace(/{{campaignName}}/g, campaignName)
                           .replace(/{{orgName}}/g, orgName)
                           .replace(/{{portalLink}}/g, portalUrl);

                await brevo.sendTransacEmail({
                    sender: { email: config.brevoEmail, name: orgName },
                    to: [{ email: oldData.email }],
                    subject: `✅ Você foi aprovada para o evento: ${campaignName}`,
                    htmlContent: html
                });
                console.log("Email Enviado com sucesso.");
            } catch (e) { console.error("Falha Email Aprovacao:", e.message); }
        }
    }

    return { success: true };
});

// --- PUSH NOTIFICATIONS ---
const sendPushToToken = async (token, title, body, url, metadata = {}) => {
    if (!token) return { success: false, error: "Token ausente." };
    const message = {
        notification: { title, body },
        data: { url: url || "/#/posts", ...metadata },
        token: token
    };
    try {
        await admin.messaging().send(message);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

exports.testSelfPush = functions.region("southamerica-east1").https.onCall(async (data) => {
    return await sendPushToToken(data.fcmToken, "Teste Push", "Funcionando!", "/#/posts");
});

exports.sendPushReminderImmediately = functions.region("southamerica-east1").https.onCall(async (data) => {
    const snap = await db.collection("pushReminders").doc(data.reminderId).get();
    if (!snap.exists) return { success: false };
    const r = snap.data();
    return await sendPushToToken(r.fcmToken, r.title, r.body, r.url);
});
