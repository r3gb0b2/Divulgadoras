
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const SibApiV3Sdk = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();

/**
 * CONFIGURAÇÃO BREVO SDK v2.x
 * firebase functions:config:set brevo.key="SUA_API_KEY_V3"
 */
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

// REMETENTE ÚNICO E VERIFICADO PARA TODO O SISTEMA
const SENDER_EMAIL = "contato@equipecerta.app";
const SENDER_NAME = "Equipe Certa";

/**
 * Função Central de Envio
 */
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
        console.log(`[Email Sent] ${subject} -> ${toEmail}`);
        return true;
    } catch (error) {
        console.error(`[Email Error] ${toEmail}:`, JSON.stringify(error.response?.body || error.message));
        return false;
    }
}

// --- 1. NEWSLETTER (CAMPANHAS EM MASSA) ---
exports.sendNewsletter = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { audience, subject, body } = data;
    try {
        let query;
        
        // Modo Individual
        if (audience.type === 'individual' && audience.promoterIds) {
            const promises = audience.promoterIds.map(async (id) => {
                const snap = await db.collection("promoters").doc(id).get();
                if (snap.exists) {
                    const p = snap.data();
                    const personalizedBody = body.replace(/{{promoterName}}/g, p.name.split(' ')[0]);
                    return sendSystemEmail(p.email, subject, personalizedBody);
                }
            });
            await Promise.all(promises);
            return { success: true, message: `Newsletter individual enviada.` };
        }

        // Modos Coletivos
        query = db.collection("promoters");
        
        // Filtro de Status (Aprovada ou Reprovada)
        if (audience.status) {
            query = query.where("status", "==", audience.status);
        } else {
            query = query.where("status", "==", "approved"); // Padrão
        }

        if (audience.type === 'org') query = query.where("organizationId", "==", audience.orgId);
        if (audience.type === 'campaign') query = query.where("campaignName", "==", audience.campaignName);

        const snap = await query.get();
        const promises = snap.docs.map(doc => {
            const p = doc.data();
            const personalizedBody = body.replace(/{{promoterName}}/g, p.name.split(' ')[0]);
            return sendSystemEmail(p.email, subject, personalizedBody);
        });

        await Promise.all(promises);
        return { success: true, message: `Newsletter enviada para ${snap.size} pessoas.` };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- 2. NOTIFICAÇÃO DE NOVA PUBLICAÇÃO (POST) ---
exports.notifyPostEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId } = data;
    try {
        const postSnap = await db.collection("posts").doc(postId).get();
        const post = postSnap.data();
        
        const assignmentsSnap = await db.collection("postAssignments")
            .where("postId", "==", postId)
            .where("status", "==", "pending")
            .get();

        const promises = assignmentsSnap.docs.map(doc => {
            const a = doc.data();
            const html = `
                <div style="font-family:sans-serif; max-width:600px; border:1px solid #eee; padding:30px; border-radius:15px;">
                    <h2 style="color:#7e39d5;">Nova Publicação Disponível! 📢</h2>
                    <p>Olá <b>${a.promoterName.split(' ')[0]}</b>,</p>
                    <p>Uma nova tarefa foi designada para você no evento: <b>${post.campaignName}</b></p>
                    <div style="background:#f4f4f4; padding:20px; border-radius:10px; margin:20px 0;">
                        <p style="margin:0;"><b>Instruções:</b> ${post.instructions.substring(0, 100)}...</p>
                    </div>
                    <a href="https://divulgadoras.vercel.app/#/posts" style="display:inline-block; background:#7e39d5; color:#fff; padding:15px 25px; text-decoration:none; border-radius:10px; font-weight:bold;">ACESSAR MEU PORTAL</a>
                </div>
            `;
            return sendSystemEmail(a.promoterEmail, `📢 Nova Publicação: ${post.campaignName}`, html);
        });

        await Promise.all(promises);
        return { success: true, message: `Notificações enviadas.` };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- 3. BOAS-VINDAS VIP ---
exports.onVipMembershipCreated = functions.region("southamerica-east1").firestore
    .document("vipMemberships/{id}")
    .onCreate(async (snap, context) => {
        const m = snap.data();
        const html = `
            <div style="font-family:sans-serif; max-width:600px; padding:30px; border:1px solid #7e39d5; border-radius:20px;">
                <h2 style="color:#7e39d5;">Recebemos seu cadastro! 🎉</h2>
                <p>Olá <b>${m.promoterName}</b>,</p>
                <p>Sua solicitação para o <b>${m.vipEventName}</b> foi registrada.</p>
                <p>Assim que validado, você receberá um novo e-mail com seu <b>Ingresso Promocional</b>.</p>
                <div style="margin-top:30px; border-top:1px solid #eee; pt:20px; font-size:11px; color:#999;">Equipe Certa App</div>
            </div>
        `;
        return sendSystemEmail(m.promoterEmail, `✅ Recebemos seu cadastro: ${m.vipEventName}`, html);
    });

// --- 4. ATIVAÇÃO VIP ---
exports.notifyVipActivation = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId } = data;
    try {
        const snap = await db.collection("vipMemberships").doc(membershipId).get();
        const m = snap.data();
        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        const ev = eventSnap.data();
        
        const code = m.benefitCode || "VIP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!m.benefitCode) await snap.ref.update({ benefitCode: code });

        const resgateLink = `https://stingressos.com.br/eventos/${ev?.externalSlug || ""}?cupom=${code}`;

        const html = `
            <div style="font-family:sans-serif; max-width:600px; padding:40px; border:2px solid #7e39d5; border-radius:20px;">
                <h2 style="color:#7e39d5; text-align:center;">Seu Ingresso Promocional Está Liberado! 🎟️</h2>
                <p>Olá <b>${m.promoterName}</b>,</p>
                <p>Seu acesso VIP para o evento <b>${m.vipEventName}</b> foi confirmado!</p>
                <div style="background:#f9f9f9; padding:20px; text-align:center; border-radius:15px; margin:20px 0;">
                    <span style="font-size:10px; color:#999; display:block; margin-bottom:5px;">SEU CÓDIGO:</span>
                    <b style="font-size:28px; color:#7e39d5; font-family:monospace;">${code}</b>
                </div>
                <a href="${resgateLink}" style="display:block; background:#7e39d5; color:#fff; text-align:center; padding:18px; text-decoration:none; border-radius:12px; font-weight:bold;">RESGATAR AGORA</a>
                <p style="font-size:12px; color:#666; margin-top:20px;">*Este código é pessoal e dá direito a 1 ingresso promocional no setor selecionado.</p>
            </div>
        `;

        return { success: await sendSystemEmail(m.promoterEmail, `🎟️ Ingresso Promocional Liberado: ${m.vipEventName}`, html) };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
