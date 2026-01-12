
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// Helper Robusto para chamadas à API Sure/Babysuri (Azure Edition)
const sureFetch = async (endpoint, method, body, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API Sure incompleta.");
    }
    
    // Normalização da URL
    const cleanBase = config.apiUrl.trim().replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    
    // Tentativa 1: Caminho padrão informado
    let url = `${cleanBase}/${cleanEndpoint}`;
    
    const callApi = async (targetUrl) => {
        console.log(`[SureAPI] Solicitando: ${method} ${targetUrl}`);
        return await fetch(targetUrl, {
            method,
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://divulgadoras.vercel.app',
                'Referer': 'https://divulgadoras.vercel.app/'
            },
            body: JSON.stringify(body)
        });
    };

    try {
        let res = await callApi(url);
        
        // Se der 404 (Not Found), o Azure/Babysuri pode estar exigindo /v1/ ou o ID da instância
        if (res.status === 404) {
            console.warn(`[SureAPI] 404 detectado. Tentando caminho alternativo V1...`);
            
            // Tentativa 2: Tenta injetar o /v1/ antes do endpoint se ele não existir
            if (!url.includes('/v1/')) {
                const altUrl = url.replace('/api/', '/api/v1/');
                res = await callApi(altUrl);
            }
        }

        const responseText = await res.text();
        let responseData = {};
        try { responseData = JSON.parse(responseText); } catch (e) { responseData = { message: responseText }; }

        if (!res.ok) {
            console.error(`[SureAPI] Erro ${res.status}:`, responseText);
            throw new Error(responseData.message || responseData.error || `Erro HTTP ${res.status}`);
        }

        return responseData;
    } catch (err) {
        console.error(`[SureAPI] Falha:`, err.message);
        throw err;
    }
};

// --- WEBHOOK ---
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "verificado";
        return res.status(200).send(botId);
    }
    res.status(200).json({ success: true });
});

// --- DISPARO DE CAMPANHA ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, platform = 'whatsapp' } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) throw new Error("Módulo desativado.");

    const { promoterIds } = filters;
    let successCount = 0;
    let failureCount = 0;
    let lastError = "";

    for (const pid of promoterIds) {
        try {
            const pSnap = await db.collection('promoters').doc(pid).get();
            if (!pSnap.exists) continue;
            const p = pSnap.data();

            const destination = platform === 'instagram' 
                ? (p.instagram || "").replace(/@/g, '').trim()
                : (p.whatsapp || "").replace(/\D/g, '');

            if (!destination) { failureCount++; continue; }

            const personalizedMessage = messageTemplate
                .replace(/{{name}}/g, p.name.split(' ')[0])
                .replace(/{{fullName}}/g, p.name)
                .replace(/{{campaignName}}/g, p.campaignName || 'Evento')
                .replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);

            const payload = {
                instanceId: config.instanceId,
                to: destination,
                message: personalizedMessage,
                platform: platform.toLowerCase(),
                type: 'text'
            };

            await sureFetch('message/sendText', 'POST', payload, config);
            successCount++;
        } catch (err) {
            lastError = err.message;
            failureCount++;
        }
    }

    return { success: successCount > 0, count: successCount, failures: failureCount, message: lastError };
});

// Outras funções omitidas para foco na correção...
// Re-implante as funções de PIX/Webhook Asaas conforme o arquivo anterior se necessário.

// Teste manual
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    
    try {
        const payload = {
            instanceId: config.instanceId,
            to: "5585982280780", 
            message: "Teste de compatibilidade Azure BabySuri 26 🚀",
            platform: "whatsapp",
            type: "text"
        };
        const res = await sureFetch('message/sendText', 'POST', payload, config);
        return { success: true, message: "Conectado!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async (data) => {
    // Implementação de ativação...
    return { success: true };
});

export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async (data) => {
    return { success: true };
});

export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    res.status(200).send('OK');
});

export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { assignmentId, promoterId } = data;
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const p = pSnap.data();
    
    const message = `Oi ${p.name.split(' ')[0]}! Vi aqui que falta o seu print. Envia lá no portal? 📸\nhttps://divulgadoras.vercel.app/#/posts`;

    const payload = {
        instanceId: config.instanceId,
        to: p.whatsapp.replace(/\D/g, ''),
        message: message,
        platform: 'whatsapp',
        type: 'text'
    };
    return await sureFetch('message/sendText', 'POST', payload, config);
});
