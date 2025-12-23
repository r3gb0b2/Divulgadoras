
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

// --- TEMPLATE PADRÃO ---
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

// --- CHAMADAS PARA TEMPLATES ---
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

// --- DISPARO DE TESTE DE E-MAIL ---
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const brevo = setupBrevo();
    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "API Key da Brevo não configurada no Firebase.");

    const senderEmail = functions.config().brevo?.email || "contato@agenciavitrine.com";
    const testTarget = context.auth.token.email;
    
    let html = data.testType === 'system_check' ? "<h1>Teste de Conexão</h1><p>Brevo operando corretamente.</p>" : data.customHtmlContent;
    html = html.replace(/{{promoterName}}/g, "Admin").replace(/{{campaignName}}/g, "Evento Teste").replace(/{{orgName}}/g, "Org Teste").replace(/{{portalLink}}/g, "#");

    try {
        await brevo.sendTransacEmail({
            sender: { email: senderEmail, name: "Equipe Certa (Teste)" },
            to: [{ email: testTarget }],
            subject: "Teste de E-mail Brevo",
            htmlContent: html
        });
        return { success: true, message: `E-mail enviado para ${testTarget}` };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// --- FUNÇÃO DE APROVAÇÃO (WhatsApp e E-mail) ---
exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    const promoterRef = db.collection("promoters").doc(promoterId);
    const snap = await promoterRef.get();
    
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
    const oldData = snap.data();
    const isApproving = updateData.status === 'approved' && oldData.status !== 'approved';

    await promoterRef.update({
        ...updateData,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        actionTakenByEmail: context.auth.token.email
    });

    if (isApproving) {
        const orgDoc = await db.collection("organizations").doc(oldData.organizationId).get();
        const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Produtora";
        const campaignName = updateData.campaignName || oldData.campaignName || "Evento Selecionado";
        const portalUrl = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(oldData.email)}`;

        // WhatsApp via Fetch Nativo (Node 20)
        const zToken = functions.config().zapi?.token;
        const zInstance = functions.config().zapi?.instance;
        if (zToken && zInstance) {
            const msg = `Olá *${oldData.name.split(' ')[0]}*! 🎉\n\nSeu perfil foi *APROVADO* para participar da equipe do evento: *${campaignName}*.\n\n🚀 *Postagem Nova:* Já temos materiais disponíveis para você. Acesse agora para garantir sua participação!\n\n🔗 *Seu Portal:* ${portalUrl}\n\nSeja bem-vinda!`;
            
            try {
                await fetch(`https://api.z-api.io/instances/${zInstance}/token/${zToken}/send-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: `55${oldData.whatsapp.replace(/\D/g, '')}`, text: msg })
                });
            } catch (e) { console.error("Erro WA:", e.message); }
        }

        // Email via Brevo
        const brevo = setupBrevo();
        if (brevo) {
            try {
                const templateDoc = await db.collection("settings").doc("emailTemplate").get();
                let html = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_TEMPLATE;
                html = html.replace(/{{promoterName}}/g, oldData.name).replace(/{{campaignName}}/g, campaignName).replace(/{{orgName}}/g, orgName).replace(/{{portalLink}}/g, portalUrl);
                
                await brevo.sendTransacEmail({
                    sender: { email: functions.config().brevo?.email || "contato@agenciavitrine.com", name: orgName },
                    to: [{ email: oldData.email }],
                    subject: `✅ Aprovada para o evento: ${campaignName}`,
                    htmlContent: html
                });
            } catch (e) { console.error("Erro Email:", e.message); }
        }
    }
    return { success: true };
});

// --- TESTE DE INTEGRAÇÃO WHATSAPP ---
exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const zToken = functions.config().zapi?.token;
    const zInstance = functions.config().zapi?.instance;
    const clientToken = functions.config().zapi?.client_token;

    if (!zToken || !zInstance) {
        return { result: { success: false, message: "Token ou Instância não configurados nas functions:config." } };
    }

    try {
        const response = await fetch(`https://api.z-api.io/instances/${zInstance}/token/${zToken}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'client-token': clientToken },
            body: JSON.stringify({ phone: "5585982280780", text: "Teste de conexão Super Admin - Equipe Certa" })
        });
        const resData = await response.json();
        return { 
            result: { success: response.ok, message: response.ok ? "Conexão OK! Mensagem de teste enviada para suporte." : "Erro na API: " + (resData.message || "Desconhecido") },
            instanceId: zInstance, instanceToken: "CONFIGURADO", clientToken: clientToken ? "CONFIGURADO" : "AUSENTE"
        };
    } catch (error) {
        return { result: { success: false, message: "Erro de rede: " + error.message } };
    }
});

// --- OUTRAS FUNÇÕES DE PUSH (MANTIDAS) ---
const sendPushToToken = async (token, title, body, url, metadata = {}) => {
    const message = { notification: { title, body }, data: { url: url || "/#/posts", ...metadata }, token: token };
    try { await admin.messaging().send(message); return { success: true }; }
    catch (error) { return { success: false, error: error.message }; }
};

exports.testSelfPush = functions.region("southamerica-east1").https.onCall(async (data) => {
    return await sendPushToToken(data.fcmToken, "Teste Push", "Funcionando!", "/#/posts");
});

exports.sendPushReminderImmediately = functions.region("southamerica-east1").https.onCall(async (data) => {
    const snap = await db.collection("pushReminders").doc(data.reminderId).get();
    const r = snap.data();
    return await sendPushToToken(r.fcmToken, r.title, r.body, r.url);
});
