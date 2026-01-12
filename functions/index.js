
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
        if (!res.ok) {
            throw new Error(`Erro API BabySuri (${res.status}): ${responseText}`);
        }
        
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return { raw: responseText };
        }
    } catch (err) {
        console.error(`[SureAPI] Falha crítica:`, err.message);
        throw err;
    }
};

/**
 * Construtor de objeto de mensagem avançado conforme documentação
 */
const buildComplexMessage = (text, mediaUrl, type = 'text') => {
    // Se for texto simples
    if (!mediaUrl) return { text };

    // Se for imagem ou vídeo (Enviando via URL conforme documentação Postman)
    const mediaType = type === 'video' ? 'video' : 'image';
    return {
        "type": mediaType,
        "url": mediaUrl,
        "caption": text // A API permite legenda em imagens/vídeos
    };
};

// --- DISPARO DE CAMPANHA ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, platform = 'whatsapp', mediaUrl, mediaType } = data;
    
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
                    "email": p.email || null,
                    "channelId": channelId, 
                    "channelType": channelType
                },
                "message": buildComplexMessage(text, mediaUrl, mediaType)
            };

            await sureFetch('messages/send', payload, config);
            successCount++;
        } catch (err) {
            console.error(`Falha no envio para ${pid}:`, err.message);
            failureCount++;
        }
    }

    return { 
        success: successCount > 0, 
        count: successCount, 
        failures: failureCount, 
        message: `Campanha processada: ${successCount} enviadas, ${failureCount} falhas.` 
    };
});

// --- TESTE DE CONEXÃO ---
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    const channelId = String(config.instanceId).trim();
    
    try {
        const payload = {
            "channelId": channelId,
            "user": {
                "name": "Teste Equipe Certa",
                "phone": "5585982280780",
                "channelId": channelId,
                "channelType": 1
            },
            "message": {
                "text": "✅ Integração Equipe Certa x BabySuri: Conexão Estabelecida com Sucesso!"
            }
        };
        const res = await sureFetch('messages/send', payload, config);
        return { success: true, message: "API Conectada!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// --- LEMBRETE SMART ---
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, organizationId } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) return { success: false, message: "API Offline" };

    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const p = pSnap.data();
    const channelId = String(config.instanceId).trim();
    
    const payload = {
        "channelId": channelId,
        "user": {
            "name": p.name,
            "phone": p.whatsapp.replace(/\D/g, ''),
            "channelId": channelId,
            "channelType": 1
        },
        "message": {
            "text": `Oi ${p.name.split(' ')[0]}! Aqui é da produção. 📸 Notamos que você ainda não enviou o print da última postagem. Acesse o portal para regularizar sua presença: https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`
        }
    };
    return await sureFetch('messages/send', payload, config);
});

export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "verificado";
        return res.status(200).send(botId);
    }
    // Lógica para processar status de entrega (Entregue/Lido) pode ser adicionada aqui
    res.status(200).json({ success: true });
});

export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
