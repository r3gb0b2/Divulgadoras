
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const SibApiV3Sdk = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();

// CONFIGURAÇÃO BREVO (API KEY deve estar configurada no Firebase Config)
// Comando: firebase functions:config:set brevo.key="SUA_API_V3_KEY"
const getBrevoApi = () => {
    const config = functions.config();
    const apiKey = config.brevo?.key;
    if (!apiKey) {
        console.error("ERRO: API Key do Brevo não configurada no Firebase Functions.");
        return null;
    }
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKeyAuth = defaultClient.authentications['api-key'];
    apiKeyAuth.apiKey = apiKey;
    return new SibApiV3Sdk.TransactionalEmailsApi();
};

// REMETENTE VERIFICADO (Deve estar idêntico ao cadastrado no Brevo)
const SENDER_EMAIL = "contato@equipecerta.app";
const SENDER_NAME = "Equipe Certa";

function generateAlphanumericCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Envio direto via Brevo SDK (Substitui a fila 'mail' do Firebase)
 */
async function sendSystemEmail(toEmail, subject, htmlContent) {
    const apiInstance = getBrevoApi();
    if (!apiInstance) return false;

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { "name": SENDER_NAME, "email": SENDER_EMAIL };
    sendSmtpEmail.to = [{ "email": toEmail }];

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`[Brevo] E-mail enviado para ${toEmail}. MessageId: ${data.messageId}`);
        return true;
    } catch (error) {
        console.error(`[Brevo] Erro ao enviar para ${toEmail}:`, error.response?.body || error.message);
        return false;
    }
}

// --- FUNÇÃO DE TESTE PARA O SUPER ADMIN ---
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const testHtml = `<h1>Teste de Conexão</h1><p>Se você recebeu isso, o Brevo está configurado corretamente com o remetente ${SENDER_EMAIL}.</p>`;
    const success = await sendSystemEmail(SENDER_EMAIL, "Teste de Sistema Equipe Certa", testHtml);
    return { success, message: success ? "E-mail de teste enviado com sucesso!" : "Falha ao enviar e-mail de teste. Verifique os logs e a API Key." };
});

// --- NOTIFICAÇÃO VIP ---
exports.notifyVipActivation = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId } = data;
    console.log(`[VIP] Iniciando notificação para Membership: ${membershipId}`);
    
    try {
        const snap = await db.collection("vipMemberships").doc(membershipId).get();
        if (!snap.exists) {
            console.error(`[VIP] Erro: Documento ${membershipId} não existe.`);
            return { success: false, message: "Membresia não encontrada." };
        }
        
        const m = snap.data();
        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        const ev = eventSnap.data();
        
        // Se não tiver código, gera um agora para não travar o e-mail
        const code = m.benefitCode || generateAlphanumericCode(6);
        if (!m.benefitCode) {
            await db.collection("vipMemberships").doc(membershipId).update({ benefitCode: code });
        }

        const resgateLink = `https://stingressos.com.br/eventos/${ev?.externalSlug || ""}?cupom=${code}`;

        const html = `
            <div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #7e39d5;border-radius:20px;padding:40px;">
                <h2 style="color:#7e39d5;text-align:center;">Sua Cortesia VIP Chegou! 🎉</h2>
                <p>Olá <b>${m.promoterName.split(' ')[0]}</b>,</p>
                <p>Seu código exclusivo para o <b>${m.vipEventName}</b> já está ativo:</p>
                <div style="background:#f9f9f9;padding:30px;border-radius:20px;text-align:center;margin:30px 0;border:2px dashed #7e39d5;">
                    <p style="margin:10px 0;font-size:32px;font-weight:900;color:#7e39d5;font-family:monospace;">${code}</p>
                </div>
                <a href="${resgateLink}" style="display:block;background:#7e39d5;color:#fff;text-decoration:none;padding:20px;text-align:center;border-radius:15px;font-weight:bold;font-size:18px;">RESGATAR MINHA CORTESIA</a>
                <p style="font-size:11px; color:#999; margin-top:20px; text-align:center;">Equipe Certa - Gestão de Eventos</p>
            </div>
        `;

        const sent = await sendSystemEmail(m.promoterEmail, `🎟️ Sua Cortesia VIP para ${m.vipEventName}`, html);
        
        return { success: sent, message: sent ? "E-mail enviado!" : "Erro ao disparar e-mail via Brevo." };
    } catch (e) {
        console.error(`[VIP] Erro técnico: ${e.message}`);
        return { success: false, error: e.message };
    }
});

// Mantemos as outras funções (mpWebhook, etc) apenas atualizando para usar sendSystemEmail
