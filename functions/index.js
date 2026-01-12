
import admin from "firebase-admin";
import functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper Definitivo para API BabySuri Azure (Padrão Suporte 2024)
 * @param {string} endpoint - O caminho após o /api (ex: 'messages/send')
 * @param {object} payload - O corpo da requisição formatado
 * @param {object} config - Configurações da API (url, token, instanceId)
 */
const sureFetch = async (endpoint, payload, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API incompleta no banco de dados.");
    }
    
    // Limpeza da URL: remove barras duplicadas e garante o final limpo
    const baseUrl = config.apiUrl.trim().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${baseUrl}/${cleanEndpoint}`;
    
    console.log(`[SureAPI] Enviando para: ${url}`);
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'EquipeCerta-Integration/1.1'
            },
            body: JSON.stringify(payload)
        });
        
        const responseText = await res.text();
        console.log(`[SureAPI] Resposta (${res.status}):`, responseText);

        if (!res.ok) {
            throw new Error(`Falha na API (${res.status}): ${responseText}`);
        }
        
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return { message: responseText };
        }
    } catch (err) {
        console.error(`[SureAPI] Erro Crítico:`, err.message);
        throw err;
    }
};

// --- DISPARO DE CAMPANHA (Refatorado para Novo Padrão) ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, platform = 'whatsapp' } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) throw new Error("Módulo de mensagens desativado.");

    const { promoterIds } = filters;
    let successCount = 0;
    let failureCount = 0;

    for (const pid of promoterIds) {
        try {
            const pSnap = await db.collection('promoters').doc(pid).get();
            if (!pSnap.exists) continue;
            const p = pSnap.data();

            const destination = (p.whatsapp || "").replace(/\D/g, '');
            if (!destination) { failureCount++; continue; }

            const personalizedMessage = messageTemplate
                .replace(/{{name}}/g, p.name.split(' ')[0])
                .replace(/{{fullName}}/g, p.name)
                .replace(/{{campaignName}}/g, p.campaignName || 'Evento')
                .replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);

            // ESTRUTURA EXATA DO SUPORTE
            const payload = {
                "user": {
                    "name": p.name,
                    "phone": destination,
                    "email": p.email,
                    "gender": 0,
                    "channelId": config.instanceId, // O ID do bot/canal
                    "channelType": platform === 'instagram' ? 3 : 1, // 1 para Whats, 3 costuma ser Insta
                    "defaultDepartmentId": null
                },
                "message": {
                    "text": personalizedMessage // Enviando como texto livre
                    // Se você for usar templates futuramente, o campo seria "templateId": "..."
                }
            };

            await sureFetch('messages/send', payload, config);
            successCount++;
        } catch (err) {
            console.error(`Falha no envio para ${pid}:`, err.message);
            failureCount++;
        }
    }

    return { success: successCount > 0, count: successCount, failures: failureCount };
});

// --- TESTE DE CONEXÃO (Novo Padrão) ---
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    
    try {
        const payload = {
            "user": {
                "name": "Teste Sistema",
                "phone": "5585982280780",
                "channelId": config.instanceId,
                "channelType": 1
            },
            "message": {
                "text": "Teste de Conexão: Padrão Suporte BabySuri Azure ✅"
            }
        };
        const res = await sureFetch('messages/send', payload, config);
        return { success: true, message: "Conexão estabelecida!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// --- LEMBRETE INTELIGENTE (Novo Padrão) ---
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId } = data;
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const p = pSnap.data();
    
    const text = `Oi ${p.name.split(' ')[0]}! Vi aqui que falta o seu print. Envia lá no portal? 📸\nhttps://divulgadoras.vercel.app/#/posts`;

    const payload = {
        "user": {
            "name": p.name,
            "phone": p.whatsapp.replace(/\D/g, ''),
            "channelId": config.instanceId,
            "channelType": 1
        },
        "message": {
            "text": text
        }
    };
    return await sureFetch('messages/send', payload, config);
});

// Webhook para verificação (GET)
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "ok";
        return res.status(200).send(botId);
    }
    res.status(200).json({ success: true });
});

// Placeholders obrigatórios
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => { return { success: true }; });
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => { return { success: true }; });
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => { res.status(200).send('OK'); });
