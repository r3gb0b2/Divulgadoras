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
        brevoEmail: config.brevo?.email || "rafael@agenciavitrine.com",
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

// --- TESTES DE INTEGRAÇÃO (SUPER ADMIN) ---

exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    
    if (!config.zApiToken || !config.zApiInstance) {
        return { 
            success: false, 
            message: "Configuração ausente: Token ou Instância não definidos no Firebase Config." 
        };
    }

    try {
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'client-token': config.zApiClientToken 
            },
            body: JSON.stringify({ 
                phone: "5585982280780", 
                message: "🛠️ *Teste de Integração Equipe Certa*\nO sistema de notificações via WhatsApp está operando corretamente." 
            })
        });

        const resData = await response.json();
        console.log("Z-API Response:", resData);

        if (response.ok) {
            return { success: true, message: "Conexão com Z-API estabelecida!", debug: resData };
        } else {
            return { success: false, message: `Erro Z-API: ${resData.message || response.status}`, debug: resData };
        }
    } catch (error) {
        console.error("Z-API Exception:", error);
        return { success: false, message: error.message };
    }
});

exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);

    if (!brevo) return { success: false, message: "Brevo API Key não configurada nas variáveis de ambiente do Firebase." };

    try {
        console.log("Iniciando envio de e-mail de teste para:", config.brevoEmail);
        const result = await brevo.sendTransacEmail({
            sender: { email: config.brevoEmail, name: "Equipe Certa Teste" },
            to: [{ email: config.brevoEmail }],
            subject: "Teste de Sistema Equipe Certa",
            htmlContent: "<h1>Funciona!</h1><p>Se você recebeu este e-mail, a integração com Brevo via API está 100% ativa.</p>"
        });
        
        console.log("Brevo Success Response:", result.body);
        return { success: true, message: "E-mail enviado! Verifique sua caixa de entrada e SPAM de: " + config.brevoEmail, debug: result.body };
    } catch (e) {
        console.error("Brevo Error Detail:", e.response ? e.response.body : e.message);
        return { 
            success: false, 
            message: "Erro ao enviar e-mail: " + e.message, 
            debug: e.response ? e.response.body : "Erro de rede ou configuração" 
        };
    }
});

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
        return { success: false, error: error.message };
    }
});

// --- NOTIFICAÇÃO DE POST (PUSH + EMAIL) ---
exports.notifyPostPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId } = data;
    if (!postId) return { success: false, message: "ID do post obrigatório." };

    try {
        const config = getConfig();
        const postDoc = await db.collection("posts").doc(postId).get();
        if (!postDoc.exists) return { success: false, message: "Post não encontrado." };
        const postData = postDoc.data();

        const assignmentsSnap = await db.collection("postAssignments").where("postId", "==", postId).get();
        if (assignmentsSnap.empty) return { success: false, message: "Nenhuma divulgadora vinculada." };

        const promoterIds = [...new Set(assignmentsSnap.docs.map(doc => doc.data().promoterId))];
        const promotersSnap = await db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", promoterIds.slice(0, 30)).get();

        const tokens = [];
        const emails = [];

        promotersSnap.docs.forEach(doc => {
            const p = doc.data();
            if (p.fcmToken) tokens.push(p.fcmToken);
            if (p.email) emails.push({ email: p.email, name: p.name });
        });

        // 1. Enviar Push
        if (tokens.length > 0) {
            const pushMsg = {
                notification: {
                    title: "🚀 Nova Tarefa Disponível!",
                    body: `Novo post para: ${postData.campaignName}. Acesse para baixar.`
                },
                data: { url: "/#/posts", postId: postId },
                tokens: tokens
            };
            await admin.messaging().sendEachForMulticast(pushMsg);
        }

        // 2. Enviar E-mail (Apenas se tiver Brevo configurado)
        const brevo = setupBrevo(config.brevoKey);
        if (brevo && emails.length > 0) {
            try {
                await brevo.sendTransacEmail({
                    sender: { email: config.brevoEmail, name: "Equipe Certa" },
                    to: emails,
                    subject: "📢 Nova Publicação Disponível",
                    htmlContent: `<p>Olá, uma nova tarefa foi postada para <b>${postData.campaignName}</b>. Acesse seu portal para realizar a postagem.</p><br><a href="https://divulgadoras.vercel.app/#/posts">Acessar Portal da Divulgadora</a>`
                });
            } catch (e) { console.error("Erro ao enviar e-mail em massa:", e.message); }
        }

        return { success: true, message: "Notificações disparadas." };

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

    // Primeiro salvamos no banco
    await promoterRef.update({
        ...updateData,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        actionTakenByEmail: context.auth?.token?.email || "sistema"
    });

    // Se for aprovação, dispara notificações
    if (isApproving) {
        const portalUrl = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(oldData.email)}`;
        const campaignName = updateData.campaignName || oldData.campaignName || "Evento";

        // WHATSAPP
        if (config.zApiToken && config.zApiInstance) {
            try {
                const waMsg = `Olá *${oldData.name.split(' ')[0]}*! 🎉\n\nSeu perfil foi *APROVADO* para o evento: *${campaignName}*.\n\n🔗 *Acesse seu Portal:* ${portalUrl}`;
                await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
                    body: JSON.stringify({ 
                        phone: `55${oldData.whatsapp.replace(/\D/g, '')}`, 
                        message: waMsg 
                    })
                });
                console.log("WhatsApp de aprovação enviado.");
            } catch (e) { console.error("Erro WA Aprov:", e.message); }
        }

        // E-MAIL
        const brevo = setupBrevo(config.brevoKey);
        if (brevo) {
            try {
                await brevo.sendTransacEmail({
                    sender: { email: config.brevoEmail, name: "Equipe Certa" },
                    to: [{ email: oldData.email, name: oldData.name }],
                    subject: `✅ Aprovada para: ${campaignName}`,
                    htmlContent: `
                        <div style="font-family: sans-serif; color: #333;">
                            <h2>Boas-vindas à equipe, ${oldData.name}!</h2>
                            <p>Seu perfil foi analisado e <b>APROVADO</b> para o evento <b>${campaignName}</b>.</p>
                            <p>Agora você já pode acessar suas tarefas e baixar os materiais de divulgação.</p>
                            <br>
                            <a href="${portalUrl}" style="background: #7e39d5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold;">ACESSAR MEU PORTAL</a>
                            <br><br>
                            <p>Sucesso em suas postagens!</p>
                        </div>
                    `
                });
                console.log("E-mail de aprovação enviado com sucesso para:", oldData.email);
            } catch (e) { 
                console.error("Erro ao enviar e-mail de aprovação:", e.response ? e.response.body : e.message); 
            }
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