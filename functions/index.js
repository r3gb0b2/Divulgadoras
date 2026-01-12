
import admin from "firebase-admin";
import functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper de Conexão Oficial BabySuri/Sure
 * Baseado no Manual de Integração: https://sejasuri.gitbook.io/manual-de-integracao/api
 */
const sureFetch = async (endpoint, payload, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API WhatsApp/Suri incompleta.");
    }
    
    const cleanToken = config.apiToken.trim();
    let baseUrl = config.apiUrl.trim().replace(/\/+$/, '');
    if (baseUrl.endsWith('/api')) {
        baseUrl = baseUrl.substring(0, baseUrl.length - 4);
    }
    
    const url = `${baseUrl}/api/${endpoint.replace(/^\/+/, '')}`;
    
    console.log(`[SuriAPI] Enviando para: ${url} (Canal: ${payload.user?.channelType})`);
    
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
        console.log(`[SuriAPI] Resposta (${res.status}):`, responseText);

        if (!res.ok) {
            throw new Error(`Erro na API Suri (${res.status}): ${responseText}`);
        }
        
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return { raw: responseText };
        }
    } catch (err) {
        console.error(`[SuriAPI] Falha crítica no envio:`, err.message);
        throw err;
    }
};

/**
 * Construtor Inteligente de Mensagens
 * Suporta: Texto, Imagem, Vídeo e Templates Meta
 */
const buildSuriMessage = (text, config, mediaUrl = null, mediaType = 'text', promoterName = "") => {
    // 1. Prioridade para Mídia Nativa (Se houver URL de mídia)
    if (mediaUrl && (mediaType === 'image' || mediaType === 'video')) {
        return {
            "type": mediaType,
            "url": mediaUrl,
            "caption": text || ""
        };
    }

    // 2. Fallback para Template Meta (Evita banimento em conversas ativas)
    if (config.templateName && config.templateName.trim() !== "") {
        return {
            "template": {
                "name": config.templateName.trim(),
                "language": { "code": "pt_BR" },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            { "type": "text", "text": promoterName.split(' ')[0] || "Divulgadora" }
                        ]
                    }
                ]
            }
        };
    }
    
    // 3. Texto Simples (Apenas para janelas de 24h abertas)
    return { "text": text };
};

// --- DISPARO DE CAMPANHA MASSIVA ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, platform = 'whatsapp', mediaUrl, mediaType = 'text' } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) throw new Error("Módulo de comunicação desativado.");

    const { promoterIds } = filters;
    const channelId = String(config.instanceId).trim();
    
    // Padrão do Manual: 1 = WhatsApp, 3 = Instagram, 4 = Messenger
    const channelType = platform === 'instagram' ? 3 : 1;

    let successCount = 0;
    let failureCount = 0;

    for (const pid of promoterIds) {
        try {
            const pSnap = await db.collection('promoters').doc(pid).get();
            if (!pSnap.exists) continue;
            const p = pSnap.data();

            // Determina o destino baseado na plataforma
            const destination = platform === 'instagram' 
                ? (p.instagram || "").replace('@', '') 
                : (p.whatsapp || "").replace(/\D/g, '');

            if (!destination) { failureCount++; continue; }

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
                    "phone": platform === 'instagram' ? null : destination,
                    "username": platform === 'instagram' ? destination : null,
                    "email": p.email || null,
                    "channelId": channelId, 
                    "channelType": channelType
                },
                "message": buildSuriMessage(text, config, mediaUrl, mediaType, p.name)
            };

            await sureFetch('messages/send', payload, config);
            successCount++;
        } catch (err) {
            console.error(`Falha individual (${pid}):`, err.message);
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
            "message": buildSuriMessage("✅ Teste de Integração Equipe Certa: Tudo pronto!", config, null, 'text', "Admin")
        };
        const res = await sureFetch('messages/send', payload, config);
        return { success: true, message: "Conexão OK!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// --- COBRANÇA SMART WHATSAPP ---
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, assignmentId } = data;
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const p = pSnap.data();
    const channelId = String(config.instanceId).trim();
    
    const text = `Oi ${p.name.split(' ')[0]}! Notamos que o seu print para o evento "${p.campaignName}" ainda não foi enviado no portal. 📸\n\nAcesse agora para regularizar: https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`;

    const payload = {
        "channelId": channelId,
        "user": {
            "name": p.name,
            "phone": p.whatsapp.replace(/\D/g, ''),
            "channelId": channelId,
            "channelType": 1
        },
        "message": buildSuriMessage(text, config, null, 'text', p.name)
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
