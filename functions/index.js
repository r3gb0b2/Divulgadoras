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

const setupBrevo = (apiKey) => {
    if (!apiKey) return null;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

// --- GESTÃO DE TOKENS PUSH ---
exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token, metadata } = data;
    if (!promoterId || !token) return { success: false, message: "Dados incompletos." };

    try {
        await db.collection("promoters").doc(promoterId).update({
            fcmToken: token,
            pushDiagnostics: {
                ...metadata,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error("Error saving token:", error);
        return { success: false, error: error.message };
    }
});

// --- NOTIFICAÇÃO AUTOMÁTICA DE POST ---
exports.notifyPostPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId } = data;
    if (!postId) return { success: false, message: "ID do post obrigatório." };

    try {
        // 1. Busca os dados do post e as atribuições
        const postDoc = await db.collection("posts").doc(postId).get();
        if (!postDoc.exists) return { success: false, message: "Post não encontrado." };
        const postData = postDoc.data();

        const assignmentsSnap = await db.collection("postAssignments")
            .where("postId", "==", postId)
            .get();

        if (assignmentsSnap.empty) return { success: false, message: "Nenhuma divulgadora vinculada." };

        // 2. Coleta IDs de promotoras
        const promoterIds = [...new Set(assignmentsSnap.docs.map(doc => doc.data().promoterId))];
        
        // 3. Busca tokens das promotoras
        const promotersSnap = await db.collection("promoters")
            .where(admin.firestore.FieldPath.documentId(), "in", promoterIds.slice(0, 30)) // Limite do 'in' query
            .get();

        const tokens = promotersSnap.docs
            .map(doc => doc.data().fcmToken)
            .filter(t => !!t && typeof t === 'string' && t.length > 10);

        if (tokens.length === 0) return { success: true, message: "Nenhum dispositivo com App instalado encontrado." };

        // 4. Envia via FCM
        const message = {
            notification: {
                title: "🚀 Nova Tarefa Disponível!",
                body: `Novo post para: ${postData.campaignName}. Clique para ver os detalhes e baixar as artes.`
            },
            data: {
                url: "/#/posts",
                postId: postId
            },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        return { 
            success: true, 
            message: `Notificações enviadas: ${response.successCount} sucesso, ${response.failureCount} falhas.`,
            details: response 
        };

    } catch (error) {
        console.error("Push Notification Error:", error);
        return { success: false, error: error.message };
    }
});

// --- FUNÇÃO CORE DE APROVAÇÃO ---
exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    const promoterRef = db.collection("promoters").doc(promoterId);
    const snap = await promoterRef.get();
    if (!snap.exists) return { success: false, message: "Promoter não encontrada." };
    
    const oldData = snap.data();
    const config = getConfig();
    const isApproving = updateData.status === 'approved' && oldData.status !== 'approved';

    await promoterRef.update({
        ...updateData,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        actionTakenByEmail: context.auth?.token?.email || "sistema"
    });

    if (isApproving) {
        const portalUrl = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(oldData.email)}`;
        const campaignName = updateData.campaignName || oldData.campaignName || "Evento";

        if (config.zApiToken && config.zApiInstance) {
            const msg = `Olá *${oldData.name.split(' ')[0]}*! 🎉\n\nSeu perfil foi *APROVADO* para o evento: *${campaignName}*.\n\n🔗 *Acesse seu Portal:* ${portalUrl}`;
            fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
                body: JSON.stringify({ phone: `55${oldData.whatsapp.replace(/\D/g, '')}`, text: msg })
            }).catch(e => console.error("Erro WA Aprov:", e.message));
        }

        const brevo = setupBrevo(config.brevoKey);
        if (brevo) {
            brevo.sendTransacEmail({
                sender: { email: config.brevoEmail, name: "Equipe Certa" },
                to: [{ email: oldData.email }],
                subject: `✅ Aprovada: ${campaignName}`,
                htmlContent: `<p>Olá ${oldData.name}, você foi aprovada! <a href="${portalUrl}">Clique aqui para acessar o portal.</a></p>`
            }).catch(e => console.error("Erro Email Aprov:", e.message));
        }
    }
    return { success: true };
});

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data) => {
    try {
        const doc = await db.collection("settings").doc("emailTemplate").get();
        return { htmlContent: doc.exists ? doc.data().htmlContent : "<h1>Padrão</h1>" };
    } catch (e) {
        return { htmlContent: "<h1>Padrão</h1>" };
    }
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'superadmin') throw new functions.https.HttpsError("permission-denied", "Apenas superadmins.");
    await db.collection("settings").doc("emailTemplate").set({ htmlContent: data.htmlContent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true };
});