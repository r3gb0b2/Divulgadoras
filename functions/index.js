
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const SibApiV3Sdk = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();

/**
 * CONFIGURAÇÃO BREVO SDK v2.x
 * Certifique-se de ter rodado: 
 * firebase functions:config:set brevo.key="SUA_API_KEY_V3"
 */
const getBrevoApi = () => {
    const config = functions.config();
    const apiKey = config.brevo?.key;
    
    if (!apiKey) {
        console.error("ERRO: API Key do Brevo (brevo.key) não encontrada nas configurações do Firebase.");
        return null;
    }

    try {
        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        // Novo método de autenticação para @getbrevo/brevo v2.x
        apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
        return apiInstance;
    } catch (e) {
        console.error("Erro ao inicializar API do Brevo:", e.message);
        return null;
    }
};

// REMETENTE: Deve estar EXATAMENTE igual ao configurado em 'Senders' no painel do Brevo
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
 * Envio de e-mail transacional via Brevo API v3
 */
async function sendSystemEmail(toEmail, subject, htmlContent) {
    const apiInstance = getBrevoApi();
    if (!apiInstance) {
        console.error("Falha no envio: API do Brevo não disponível.");
        return false;
    }

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: SENDER_NAME, email: SENDER_EMAIL };
    sendSmtpEmail.to = [{ email: toEmail }];

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`[Brevo Success] ID: ${data.body?.messageId || 'enviado'} para ${toEmail}`);
        return true;
    } catch (error) {
        // Log detalhado para depuração no Firebase Console
        const errorDetail = error.response?.body || error.message;
        console.error(`[Brevo Error] Falha ao enviar para ${toEmail}:`, JSON.stringify(errorDetail));
        return false;
    }
}

// --- FUNÇÃO DE TESTE PARA O SUPER ADMIN ---
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const testHtml = `
        <div style="font-family:sans-serif; padding:20px; border:1px solid #eee;">
            <h1 style="color:#7e39d5;">Teste de Conexão Brevo</h1>
            <p>Se você recebeu isso, a integração via SDK está <b>correta</b>.</p>
            <p>Remetente configurado: ${SENDER_EMAIL}</p>
        </div>
    `;
    const success = await sendSystemEmail(SENDER_EMAIL, "Teste de Sistema - Equipe Certa", testHtml);
    return { 
        success, 
        message: success ? "E-mail de teste enviado com sucesso!" : "Falha ao enviar e-mail. Verifique os logs do Firebase Functions para o erro detalhado." 
    };
});

// --- NOTIFICAÇÃO VIP ---
exports.notifyVipActivation = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId } = data;
    console.log(`[VIP Notification] Iniciando para: ${membershipId}`);
    
    try {
        const snap = await db.collection("vipMemberships").doc(membershipId).get();
        if (!snap.exists) {
            return { success: false, message: "Cadastro VIP não encontrado no banco." };
        }
        
        const m = snap.data();
        
        // Gera código caso não exista
        let code = m.benefitCode;
        if (!code) {
            code = generateAlphanumericCode(6);
            await db.collection("vipMemberships").doc(membershipId).update({ benefitCode: code });
        }

        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        const ev = eventSnap.data();
        const slug = ev?.externalSlug || "";
        const resgateLink = `https://stingressos.com.br/eventos/${slug}?cupom=${code}`;

        const html = `
            <div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #7e39d5;border-radius:20px;padding:40px;">
                <h2 style="color:#7e39d5;text-align:center;">Sua Cortesia VIP Chegou! 🎉</h2>
                <p>Olá <b>${m.promoterName.split(' ')[0]}</b>,</p>
                <p>Seu código exclusivo para o <b>${m.vipEventName}</b> já está ativo:</p>
                <div style="background:#f9f9f9;padding:30px;border-radius:20px;text-align:center;margin:30px 0;border:2px dashed #7e39d5;">
                    <p style="margin:10px 0;font-size:32px;font-weight:900;color:#7e39d5;font-family:monospace;">${code}</p>
                </div>
                <a href="${resgateLink}" style="display:block;background:#7e39d5;color:#fff;text-decoration:none;padding:20px;text-align:center;border-radius:15px;font-weight:bold;font-size:18px;">RESGATAR MINHA CORTESIA</a>
                <p style="font-size:11px; color:#999; margin-top:20px; text-align:center;">Este é um e-mail automático. Equipe Certa.</p>
            </div>
        `;

        const sent = await sendSystemEmail(m.promoterEmail, `🎟️ Sua Cortesia VIP: ${m.vipEventName}`, html);
        
        return { 
            success: sent, 
            message: sent ? "E-mail enviado!" : "Erro ao disparar via Brevo. Verifique os logs." 
        };
    } catch (e) {
        console.error(`[VIP technical error]`, e);
        return { success: false, message: e.message };
    }
});
