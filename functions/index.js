
import admin from "firebase-admin";
import functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper de Conexão Oficial para BabySuri/Sure (Padrão Omni-channel)
 */
const sureFetch = async (endpoint, payload, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API incompleta.");
    }
    
    const cleanToken = config.apiToken.trim();
    let baseUrl = config.apiUrl.trim().replace(/\/+$/, '');
    if (baseUrl.endsWith('/api')) {
        baseUrl = baseUrl.substring(0, baseUrl.length - 4);
    }
    
    const url = `${baseUrl}/api/${endpoint.replace(/^\/+/, '')}`;
    
    console.log(`[SureAPI] Request para: ${url}`);
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cleanToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const responseText = await res.text();
        console.log(`[SureAPI] Resposta HTTP ${res.status}:`, responseText);

        if (!res.ok) {
            throw new Error(`Erro API BabySuri (${res.status}): ${responseText}`);
        }
        
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return { raw: responseText };
        }
    } catch (err) {
        console.error(`[SureAPI] Falha:`, err.message);
        throw err;
    }
};

/**
 * Constrói o objeto de mensagem respeitando se é Template ou Texto Puro
 */
const buildMessagePayload = (text, config, promoterName = "Divulgadora") => {
    // Se houver um nome de template configurado, enviamos no formato oficial da Meta
    if (config.templateName && config.templateName.trim() !== "") {
        return {
            "template": {
                "name": config.templateName.trim(),
                "language": {
                    "code": "pt_BR"
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {
                                "type": "text",
                                "text": promoterName.split(' ')[0]
                            }
                        ]
                    }
                ]
            }
        };
    }
    
    // Fallback para texto puro (APIs não-oficiais ou janelas abertas)
    return {
        "text": text
    };
};

// --- DISPARO DE CAMPANHA ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, platform = 'whatsapp' } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) throw new Error("Módulo WhatsApp desativado.");

    const { promoterIds } = filters;
    const channelId = String(config.instanceId).trim();
    const channelType = platform === 'instagram' ? 3 : 1;

    let successCount = 0;
    let failureCount = 0;

    for (const pid of promoterIds) {
        try {
            const pSnap = await db.collection('promoters').doc(pid).get();
            if (!pSnap.exists) continue;
            const p = pSnap.data();

            const destination = (p.whatsapp || "").replace(/\D/g, '');
            if (!destination && platform === 'whatsapp') { failureCount++; continue; }

            const text = messageTemplate
                .replace(/{{name}}/g, p.name.split(' ')[0])
                .replace(/{{fullName}}/g, p.name)
                .replace(/{{email}}/g, p.email)
                .replace(/{{campaignName}}/g, p.campaignName || 'Evento')
                .replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);

            const payload = {
                "channelId": channelId,
                "user": {
                    "name": p.name,
                    "phone": platform === 'whatsapp' ? destination : p.instagram,
                    "channelId": channelId, 
                    "channelType": channelType
                },
                "message": buildMessagePayload(text, config, p.name)
            };

            await sureFetch('messages/send', payload, config);
            successCount++;
        } catch (err) {
            console.error(`Erro no envio individual (${pid}):`, err.message);
            failureCount++;
        }
    }

    return { success: successCount > 0, count: successCount, failures: failureCount };
});

// --- TESTE DE CONEXÃO ---
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config) throw new Error("Configuração não encontrada.");
    
    const channelId = String(config.instanceId).trim();
    
    try {
        const payload = {
            "channelId": channelId,
            "user": {
                "name": "Teste Sistema",
                "phone": "5585982280780",
                "channelId": channelId,
                "channelType": 1
            },
            "message": buildMessagePayload("Teste de Conexão Equipe Certa ✅", config, "Admin")
        };
        const res = await sureFetch('messages/send', payload, config);
        return { success: true, message: "Conectado!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// --- LEMBRETE SMART ---
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId } = data;
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const p = pSnap.data();
    const channelId = String(config.instanceId).trim();
    
    const text = `Oi ${p.name.split(' ')[0]}! Notamos que seu print ainda não foi enviado. Acesse o portal para regularizar.`;

    const payload = {
        "channelId": channelId,
        "user": {
            "name": p.name,
            "phone": p.whatsapp.replace(/\D/g, ''),
            "channelId": channelId,
            "channelType": 1
        },
        "message": buildMessagePayload(text, config, p.name)
    };
    return await sureFetch('messages/send', payload, config);
});

export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "verificado";
        return res.status(200).send(botId);
    }
    res.status(200).json({ success: true });
});

export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
