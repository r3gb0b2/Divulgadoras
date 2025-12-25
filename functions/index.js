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
        console.error("Tentativa de salvar token inválida:", { promoterId, hasToken: !!token });
        return { success: false, message: "Dados incompletos." };
    }

    try {
        const promoterRef = db.collection("promoters").doc(promoterId);
        
        // Atualiza o token e metadados de diagnóstico para ajudar no suporte
        await promoterRef.update({
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
            pushDiagnostics: {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                platform: metadata?.platform || "unknown",
                tokenPrefix: token.substring(0, 10),
                syncMethod: metadata?.method || "standard"
            }
        });

        console.log(`[Push] Token atualizado para promoter ${promoterId} (${metadata?.platform})`);
        return { success: true };
    } catch (error) {
        console.error("[Push] Erro ao atualizar Firestore:", error);
        return { success: false, message: error.message };
    }
});

// --- RESTO DAS FUNÇÕES ---
// (Mantidas conforme o código original fornecido para não quebrar integrações existentes)

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

exports.sendNewsletter = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { audience, subject, body } = data;
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);

    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "Brevo não configurado.");

    try {
        let query = db.collection("promoters").where("status", "==", "approved");
        const snap = await query.get();
        if (snap.empty) return { success: false, message: "Nenhum destinatário." };

        const emails = snap.docs.map(doc => ({ email: doc.data().email, name: doc.data().name }));

        await brevo.sendTransacEmail({
            sender: { email: config.brevoEmail, name: "D&E" },
            to: emails,
            subject: subject,
            htmlContent: body
        });
        
        return { success: true, message: `E-mails enviados.` };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    const promoterRef = db.collection("promoters").doc(promoterId);
    await promoterRef.update({ ...updateData, statusChangedAt: admin.firestore.FieldValue.serverTimestamp() });
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