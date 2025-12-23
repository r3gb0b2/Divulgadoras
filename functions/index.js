
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

// Helper para garantir que o erro retornado seja um objeto plano e seguro
const sanitizeError = (error) => {
    if (!error) return "Erro desconhecido";
    if (typeof error === 'string') return error;
    
    // Tenta extrair a mensagem mais útil
    const message = error.message || error.statusText || "Falha na operação";
    const status = error.status || error.response?.status || 500;
    
    // Tenta capturar o corpo da resposta se for um erro de API
    let details = null;
    if (error.response?.body) details = error.response.body;
    else if (error.debug) details = error.debug;

    return { message, status, details };
};

// --- TESTE DE WHATSAPP COM DIAGNÓSTICO ROBUSTO ---
exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    if (!config.zApiToken || !config.zApiInstance) {
        return { success: false, message: "Configuração ausente no Firebase." };
    }

    try {
        const url = `https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
            body: JSON.stringify({ phone: "5585982280780", text: "Teste de Conexão: Equipe Certa Admin" })
        });

        // Tenta ler como texto primeiro para evitar quebra se não for JSON
        const rawText = await response.text();
        let resBody;
        try {
            resBody = JSON.parse(rawText);
        } catch (e) {
            resBody = { rawResponse: rawText };
        }
        
        return { 
            success: response.ok, 
            message: response.ok ? "Conectado com sucesso!" : `A API recusou o envio (Status ${response.status}).`,
            debug: resBody,
            status: response.status
        };
    } catch (error) {
        console.error("ZAPI Test Error:", error);
        return { 
            success: false, 
            message: "Erro de rede ao tentar contactar a Z-API.", 
            debug: error.message 
        };
    }
});

// --- TESTE DE E-MAIL COM TRATAMENTO DE ERRO ---
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);
    if (!brevo) return { success: false, message: "Chave Brevo não configurada." };

    const testTarget = context.auth?.token?.email || "suporte@equipecerta.com";
    
    try {
        const res = await brevo.sendTransacEmail({
            sender: { email: config.brevoEmail, name: "Equipe Certa" },
            to: [{ email: testTarget }],
            subject: "Teste de Entrega Brevo",
            htmlContent: "<h1>Conexão Ativa</h1><p>Se você recebeu este e-mail, a integração está correta.</p><p>Remetente: " + config.brevoEmail + "</p>"
        });
        
        // Brevo retorna objetos complexos, vamos retornar apenas o que importa
        return { 
            success: true, 
            message: `Solicitação aceita. Verifique o e-mail: ${testTarget}`,
            debug: { messageId: res.body?.messageId || "ok" }
        };
    } catch (error) {
        console.error("Erro Brevo:", error);
        const errorInfo = sanitizeError(error);
        return { 
            success: false, 
            message: "A Brevo recusou o envio.", 
            debug: errorInfo 
        };
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

        // WA
        if (config.zApiToken && config.zApiInstance) {
            const msg = `Olá *${oldData.name.split(' ')[0]}*! 🎉\n\nSeu perfil foi *APROVADO* para o evento: *${campaignName}*.\n\n🔗 *Acesse seu Portal:* ${portalUrl}`;
            fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
                body: JSON.stringify({ phone: `55${oldData.whatsapp.replace(/\D/g, '')}`, text: msg })
            }).catch(e => console.error("Erro WA Aprov:", e.message));
        }

        // Email
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
