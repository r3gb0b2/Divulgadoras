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
        brevoEmail: config.brevo?.email || "r3gb0b@gmail.com",
        zApiToken: config.zapi?.token || null,
        zApiInstance: config.zapi?.instance || null,
        zApiClientToken: config.zapi?.client_token || ""
    };
};

const setupBrevo = (apiKey) => {
    if (!apiKey) return null;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

// --- PERSISTÊNCIA DE TOKEN PUSH ---

exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token, metadata } = data;
    if (!promoterId || !token) {
        return { success: false, message: "ID da divulgadora ou Token ausente." };
    }

    try {
        const promoterRef = db.collection("promoters").doc(promoterId);
        const doc = await promoterRef.get();
        
        if (!doc.exists) {
            return { success: false, message: "Divulgadora não encontrada." };
        }

        await promoterRef.update({
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
            pushDiagnostics: {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                platform: metadata?.platform || "unknown",
                tokenLength: token.length,
                pluginStatus: "active"
            }
        });

        console.log(`Token Push salvo para promoter: ${promoterId}`);
        return { success: true };
    } catch (error) {
        console.error("Erro ao salvar token push:", error);
        return { success: false, message: error.message };
    }
});

// --- TESTES DE INTEGRAÇÃO ---

exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    if (!config.zApiToken || !config.zApiInstance) return { success: false, message: "Configuração ausente." };

    try {
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
            body: JSON.stringify({ phone: "5585982280780", message: "🛠️ Teste de Notificação WhatsApp Equipe Certa ativo." })
        });
        const resData = await response.json();
        return { success: response.ok, message: response.ok ? "Conexão OK!" : "Erro na API", debug: resData };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// --- PUSH NOTIFICATIONS ---

exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { title, body, url, promoterIds } = data;
    if (!promoterIds || promoterIds.length === 0) return { success: false, message: "Nenhum destino." };

    try {
        const tokens = [];
        const chunkedIds = [];
        for (let i = 0; i < promoterIds.length; i += 30) chunkedIds.push(promoterIds.slice(i, i + 30));

        for (const ids of chunkedIds) {
            const snap = await db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", ids).get();
            snap.docs.forEach(doc => {
                const p = doc.data();
                if (p.fcmToken) tokens.push(p.fcmToken);
            });
        }

        if (tokens.length === 0) return { success: false, message: "Nenhum token encontrado." };

        const message = {
            notification: { title, body },
            data: { url: url || "/#/posts" },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        return { success: true, message: `Push enviado para ${response.successCount} aparelhos.` };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

exports.sendPushReminderImmediately = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { reminderId } = data;
    const ref = db.collection("pushReminders").doc(reminderId);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Lembrete não encontrado.");

    const r = snap.data();
    try {
        const message = {
            notification: { title: r.title, body: r.body },
            data: { url: r.url || "/#/posts" },
            token: r.fcmToken
        };
        await admin.messaging().send(message);
        await ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true };
    } catch (error) {
        await ref.update({ status: 'error', error: error.message });
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// --- NEWSLETTER ---

exports.sendNewsletter = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { audience, subject, body } = data;
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);

    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "Brevo não configurado.");

    try {
        let query = db.collection("promoters").where("status", "==", "approved");
        
        if (audience.type === 'org') query = query.where("organizationId", "==", audience.orgId);
        if (audience.type === 'campaign') query = query.where("campaignId", "==", audience.campaignId);

        const snap = await query.get();
        if (snap.empty) return { success: false, message: "Nenhum destinatário encontrado." };

        const emails = snap.docs.map(doc => {
            const p = doc.data();
            return { email: p.email, name: p.name };
        });

        const res = await brevo.sendTransacEmail({
            sender: { email: config.brevoEmail, name: "D&E" },
            to: emails,
            subject: subject,
            htmlContent: body
        });
        
        console.log("Newsletter Sent successfully.");
        return { success: true, message: `Newsletter enviada para ${emails.length} divulgadoras.` };
    } catch (error) {
        console.error("Newsletter Error Detail:", JSON.stringify(error));
        return { success: false, message: error.message };
    }
});

// --- GERENCIAMENTO DE STATUS ---

exports.setPromoterStatusToRemoved = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId } = data;
    const ref = db.collection("promoters").doc(promoterId);
    
    await ref.update({
        status: 'removed',
        hasJoinedGroup: false,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        removedBy: context.auth?.token.email || "sistema"
    });

    const assignments = await db.collection("postAssignments")
        .where("promoterId", "==", promoterId)
        .where("status", "==", "pending")
        .get();
    
    const batch = db.batch();
    assignments.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return { success: true };
});

exports.removePromoterFromAllAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId } = data;
    const assignments = await db.collection("postAssignments")
        .where("promoterId", "==", promoterId)
        .get();
    
    const batch = db.batch();
    assignments.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return { success: true };
});

// --- CORE SYNC ---

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    const promoterRef = db.collection("promoters").doc(promoterId);
    const snap = await promoterRef.get();
    if (!snap.exists) return { success: false, message: "Não encontrada." };
    
    const oldData = snap.data();
    const config = getConfig();
    const isApproving = updateData.status === 'approved' && oldData.status !== 'approved';

    await promoterRef.update({
        ...updateData,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (isApproving) {
        // 1. Envio de E-mail (Brevo)
        const brevo = setupBrevo(config.brevoKey);
        if (brevo) {
            try {
                const mailData = {
                    sender: { email: config.brevoEmail, name: "D&E" },
                    to: [{ email: oldData.email, name: oldData.name }],
                    subject: "✅ Cadastro Aprovado!",
                    htmlContent: `
                        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto;">
                            <h2 style="color: #7e39d5;">Olá ${oldData.name}, seu perfil foi aprovado!</h2>
                            <p>Parabéns! Agora você faz parte oficialmente da equipe para o evento: <strong>${oldData.campaignName || "Equipe Geral"}</strong>.</p>
                            <p>Acesse seu portal agora para ver suas tarefas e entrar no grupo do WhatsApp:</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(oldData.email)}" 
                                   style="display: inline-block; padding: 16px 32px; background: #7e39d5; color: white; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(126,57,213,0.3);">
                                   ACESSAR MEU PORTAL
                                </a>
                            </div>
                            <p style="font-size: 12px; color: #666; border-top: 1px solid #eee; pt: 20px;">Este é um e-mail automático. Não responda diretamente.</p>
                        </div>
                    `
                };
                const res = await brevo.sendTransacEmail(mailData);
                console.log(`Email Approval Sent to ${oldData.email}. Brevo ID:`, res.messageId);
            } catch (e) { 
                console.error("Critical Brevo Rejection:", JSON.stringify(e)); 
            }
        } else {
            console.warn("Brevo API Key is missing in Cloud Functions config.");
        }

        // 2. Envio de WhatsApp (Z-API)
        if (config.zApiToken && config.zApiInstance && oldData.whatsapp) {
            try {
                const cleanPhone = oldData.whatsapp.replace(/\D/g, "");
                const waMessage = `✅ *Olá ${oldData.name}!* Seu perfil foi aprovado para a equipe do evento: *${oldData.campaignName || "Equipe Geral"}*.\n\n🚀 *Acesse seu portal para ver suas tarefas e o link do grupo:* https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(oldData.email)}`;

                await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'client-token': config.zApiClientToken 
                    },
                    body: JSON.stringify({ 
                        phone: `55${cleanPhone}`, 
                        message: waMessage 
                    })
                });
            } catch (waErr) {
                console.error("WhatsApp Approval Notification Error:", waErr);
            }
        }
    }
    
    return { success: true };
});

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async () => {
    const doc = await db.collection("settings").doc("emailTemplate").get();
    return { htmlContent: doc.exists ? doc.data().htmlContent : "<h1>Padrão</h1>" };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await db.collection("settings").doc("emailTemplate").set({ htmlContent: data.htmlContent });
    return { success: true };
});