
import admin from "firebase-admin";
import functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper de Conexão Oficial para BabySuri/Sure (Padrão Postman Documenter)
 * Resolve problemas de 404 e 400 adaptando o JSON para o modelo Omni-channel.
 */
const sureFetch = async (endpoint, payload, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API incompleta.");
    }
    
    // 1. Limpeza rigorosa da URL
    // Remove qualquer barra no final e qualquer "/api" excedente
    let baseUrl = config.apiUrl.trim().replace(/\/+$/, '');
    if (baseUrl.endsWith('/api')) {
        baseUrl = baseUrl.substring(0, baseUrl.length - 4);
    }
    
    // 2. Montagem exata: https://dominio.azurewebsites.net/api/messages/send
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${baseUrl}/api/${cleanEndpoint}`;
    
    console.log(`[SureAPI] Request URL: ${url}`);
    console.log(`[SureAPI] Payload:`, JSON.stringify(payload));
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'EquipeCerta-Integration/1.3'
            },
            body: JSON.stringify(payload)
        });
        
        const responseText = await res.text();
        console.log(`[SureAPI] HTTP ${res.status}:`, responseText);

        if (!res.ok) {
            throw new Error(`Erro API BabySuri (${res.status}): ${responseText}`);
        }
        
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return { raw: responseText };
        }
    } catch (err) {
        console.error(`[SureAPI] Erro Crítico:`, err.message);
        throw err;
    }
};

// --- DISPARO DE CAMPANHA (Padrão Omni-channel) ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, platform = 'whatsapp' } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) throw new Error("Módulo desativado.");

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

            const text = messageTemplate
                .replace(/{{name}}/g, p.name.split(' ')[0])
                .replace(/{{fullName}}/g, p.name)
                .replace(/{{campaignName}}/g, p.campaignName || 'Evento')
                .replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);

            // ESTRUTURA IDENTICA AO POSTMAN ENVIADO
            const payload = {
                "user": {
                    "name": p.name,
                    "phone": destination,
                    "email": p.email || null,
                    "gender": 0,
                    "channelId": config.instanceId, // ID da instância/bot
                    "channelType": platform === 'instagram' ? 3 : 1, // 1=Whats, 3=Insta
                    "defaultDepartmentId": null
                },
                "message": {
                    "text": text
                }
            };

            await sureFetch('messages/send', payload, config);
            successCount++;
        } catch (err) {
            console.error(`Falha em ${pid}:`, err.message);
            failureCount++;
        }
    }

    return { success: successCount > 0, count: successCount, failures: failureCount };
});

// --- TESTE DE CONEXÃO (Padrão Omni-channel) ---
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
                "text": "Conexão Equipe Certa 2024: Padrão Omni-channel Verificado ✅"
            }
        };
        const res = await sureFetch('messages/send', payload, config);
        return { success: true, message: "Conectado!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// --- LEMBRETE SMART (Padrão Omni-channel) ---
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId } = data;
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const p = pSnap.data();
    
    const payload = {
        "user": {
            "name": p.name,
            "phone": p.whatsapp.replace(/\D/g, ''),
            "channelId": config.instanceId,
            "channelType": 1
        },
        "message": {
            "text": `Oi ${p.name.split(' ')[0]}! Passando para lembrar do seu print pendente no portal. 📸`
        }
    };
    return await sureFetch('messages/send', payload, config);
});

// Webhook para homologação (Necessário para a Sure verificar a URL)
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "verificado";
        return res.status(200).send(botId);
    }
    res.status(200).json({ success: true });
});

// Placeholders mandatórios para evitar erro de exportação
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
