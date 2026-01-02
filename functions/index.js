
import admin from "firebase-admin";
import functions from "firebase-functions";
import SibApiV3Sdk from "@getbrevo/brevo";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

const getBrevoApi = () => {
    const config = functions.config();
    const apiKey = config.brevo?.key;
    if (!apiKey) {
        console.error("ERRO: API Key do Brevo não configurada.");
        return null;
    }
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

// REMETENTE OFICIAL
const SENDER_EMAIL = "contato@equipecerta.app";
const SENDER_NAME = "Equipe Certa";

async function sendSystemEmail(toEmail, subject, htmlContent) {
    const apiInstance = getBrevoApi();
    if (!apiInstance) return false;

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: SENDER_NAME, email: SENDER_EMAIL };
    sendSmtpEmail.to = [{ email: toEmail }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return true;
    } catch (error) {
        console.error(`[Email Error] ${toEmail}:`, JSON.stringify(error.response?.body || error.message));
        return false;
    }
}

// FUNÇÃO DE INTELIGÊNCIA ARTIFICIAL (GEMINI)
export const askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    try {
        const { prompt } = data;
        const apiKey = process.env.API_KEY;

        if (!prompt) {
            throw new functions.https.HttpsError('invalid-argument', 'O prompt é obrigatório.');
        }

        if (!apiKey) {
            throw new functions.https.HttpsError('failed-precondition', 'A chave de IA não foi configurada.');
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        return { text: response.text };
    } catch (e) {
        throw new functions.https.HttpsError('internal', e.message || 'Erro ao processar IA');
    }
});

// TRIGGER: Enviar e-mail de recebimento
export const onPromoterCreated = functions.region("southamerica-east1").firestore
    .document("promoters/{id}")
    .onCreate(async (snap, context) => {
        const p = snap.data();
        if (p.organizationId === 'club-vip-global' || p.campaignName === 'Membro Clube VIP') return;

        const html = `
            <div style="font-family:sans-serif; max-width:600px; padding:30px; border:1px solid #eee; border-radius:20px;">
                <h2 style="color:#7e39d5;">Recebemos seu cadastro! 📝</h2>
                <p>Olá <b>${p.name.split(' ')[0]}</b>, confirmamos o recebimento da sua inscrição para a equipe: <b>${p.campaignName || "Produção"}</b>.</p>
                <p>Seu perfil agora passará por uma análise. Você pode acompanhar o resultado no nosso site.</p>
                <div style="margin:30px 0; text-align:center;">
                    <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="background:#7e39d5; color:#fff; padding:15px 30px; text-decoration:none; border-radius:12px; font-weight:bold; display:inline-block;">VER MEU STATUS</a>
                </div>
                <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                <p style="font-size:11px; color:#999;">Equipe Certa - Gestão Profissional de Eventos</p>
            </div>`;
        
        return sendSystemEmail(p.email, "Cadastro Recebido: " + (p.campaignName || "Equipe"), html);
    });

// Notificação de Aprovação
export const notifyApprovalBulk = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterIds } = data;
    try {
        const promises = promoterIds.map(async (id) => {
            const snap = await db.collection("promoters").doc(id).get();
            if (!snap.exists) return;
            const p = snap.data();
            
            const html = `
                <div style="font-family:sans-serif; max-width:600px; padding:30px; border:1px solid #eee; border-radius:20px;">
                    <h2 style="color:#7e39d5;">Seu cadastro foi Aprovado! 🎉</h2>
                    <p>Olá <b>${p.name.split(' ')[0]}</b>, seu perfil foi aprovado para a equipe do evento: <b>${p.campaignName || "Produção"}</b>.</p>
                    <p>Acesse seu portal para visualizar tarefas e enviar seus prints.</p>
                    <div style="margin:30px 0; text-align:center;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="background:#7e39d5; color:#fff; padding:15px 30px; text-decoration:none; border-radius:12px; font-weight:bold; display:inline-block;">ACESSAR MEU PORTAL</a>
                    </div>
                    <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                    <p style="font-size:11px; color:#999;">Equipe Certa - Gestão Profissional de Eventos</p>
                </div>`;
            
            return sendSystemEmail(p.email, `🎉 Cadastro Aprovado: ${p.campaignName || "Equipe"}`, html);
        });

        await Promise.all(promises);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * Recuperação de Vendas VIP via E-mail
 * Gera novo pagamento Pix e envia por e-mail com corpo dinâmico
 */
export const sendVipRecoveryEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId, pixData, customMessage } = data;
    try {
        const snap = await db.collection("vipMemberships").doc(membershipId).get();
        if (!snap.exists) throw new Error("Adesão não encontrada.");
        
        const m = snap.data();
        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        if (!eventSnap.exists) throw new Error("Evento VIP não encontrado.");
        const ev = eventSnap.data();

        // Template de e-mail flexível
        const html = `
            <div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:40px; border:1px solid #e2e8f0; border-radius:24px; text-align:center; background-color:#ffffff;">
                <h1 style="color:#7e39d5; font-size:24px; margin-bottom:10px;">Aviso Importante 🎟️</h1>
                <div style="color:#64748b; font-size:16px; line-height:1.6; text-align:left; margin-bottom:30px;">
                    ${customMessage.replace(/\n/g, '<br>')}
                </div>
                
                <div style="background-color:#f8fafc; padding:30px; border-radius:20px; margin-bottom:30px;">
                    <img src="data:image/jpeg;base64,${pixData.qr_code_base64}" style="width:200px; height:200px; margin-bottom:20px;" alt="QR Code Pix">
                    <p style="font-size:10px; color:#94a3b8; text-transform:uppercase; font-weight:bold; margin-bottom:10px;">Código Copia e Cola:</p>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; padding:12px; border-radius:8px; font-family:monospace; font-size:11px; word-break:break-all; color:#1e293b;">
                        ${pixData.qr_code}
                    </div>
                </div>

                <p style="color:#64748b; font-size:14px; margin-bottom:30px;">Após o pagamento, seu acesso será liberado <b>automaticamente</b>.</p>
                
                <div style="text-align:center;">
                    <a href="https://divulgadoras.vercel.app/#/clubvip/status?email=${encodeURIComponent(m.promoterEmail)}" style="background-color:#7e39d5; color:#ffffff; padding:16px 32px; text-decoration:none; border-radius:12px; font-weight:bold; display:inline-block; font-size:14px;">VER MEU STATUS VIP</a>
                </div>
                
                <hr style="border:0; border-top:1px solid #f1f5f9; margin:40px 0;">
                <p style="font-size:11px; color:#94a3b8;">Equipe Certa - Gestão Oficial de Equipes e Benefícios</p>
            </div>`;

        const subject = data.subject || `🎟️ Complete seu acesso VIP: ${ev.name}`;
        const emailSent = await sendSystemEmail(m.promoterEmail, subject, html);

        if (emailSent) {
            await snap.ref.update({
                lastRecoverySentAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, message: "E-mail de recuperação enviado!" };
        } else {
            throw new Error("Falha ao disparar e-mail.");
        }

    } catch (e) {
        console.error("Erro na recuperação VIP:", e);
        return { success: false, error: e.message };
    }
});
