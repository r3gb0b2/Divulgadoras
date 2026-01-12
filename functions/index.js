
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// Helper para chamadas à API Sure/Babysuri (Versão 26.1.6)
const sureFetch = async (endpoint, method, body, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API Sure incompleta no painel administrativo.");
    }
    
    // 1. Limpeza da URL Base
    // Se o usuário digitou "https://.../api/", removemos a barra final
    let baseUrl = config.apiUrl.trim().replace(/\/$/, '');
    
    // 2. Limpeza do Endpoint
    // Se o endpoint vier como "/message/sendText", garantimos que não tenha barra dupla
    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // 3. URL Final
    // Simples: Base + Caminho. Ex: https://...azurewebsites.net/api/message/sendText
    const url = `${baseUrl}${cleanEndpoint}`;
    
    console.log(`[SureAPI] Chamando: ${method} ${url}`);
    
    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
                'accept': '*/*'
            },
            body: JSON.stringify(body)
        });
        
        const responseText = await res.text();
        let responseData = {};
        
        if (responseText) {
            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                responseData = { message: responseText };
            }
        }
        
        if (!res.ok) {
            console.error(`[SureAPI] Erro ${res.status} em ${url}:`, responseText);
            
            if (res.status === 404) {
                throw new Error(`Endpoint não encontrado (404). A URL gerada foi: ${url}. Verifique se a URL no painel termina com /api. Caso o erro persista, tente alterar de /api para /api/v1.`);
            }
            
            throw new Error(responseData.message || responseData.error || `Erro HTTP ${res.status}`);
        }
        
        return responseData;
    } catch (err) {
        console.error(`[SureAPI] Falha crítica:`, err.message);
        throw err;
    }
};

// --- WEBHOOK SURE ---
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "";
        return res.status(200).send(botId);
    }
    if (req.method === 'POST') {
        return res.status(200).json({ success: true });
    }
    return res.status(405).send('Method Not Allowed');
});

// --- CAMANHA WHATSAPP ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, organizationId, platform = 'whatsapp' } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    
    if (!config || !config.isActive) {
        throw new Error("O módulo de mensagens está desativado.");
    }

    const { promoterIds } = filters;
    let successCount = 0;
    let failureCount = 0;
    let lastError = "";

    for (const pid of promoterIds) {
        try {
            const pSnap = await db.collection('promoters').doc(pid).get();
            if (!pSnap.exists) continue;
            const p = pSnap.data();

            let destination = "";
            if (platform === 'instagram') {
                destination = (p.instagram || "").replace(/@/g, '').trim();
            } else {
                destination = (p.whatsapp || "").replace(/\D/g, '');
            }

            if (!destination) {
                failureCount++;
                continue;
            }

            const firstName = p.name ? p.name.split(' ')[0] : "Divulgadora";
            const personalizedMessage = messageTemplate
                .replace(/{{name}}/g, firstName)
                .replace(/{{fullName}}/g, p.name || "")
                .replace(/{{campaignName}}/g, p.campaignName || 'Evento')
                .replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);

            const payload = {
                instanceId: config.instanceId,
                to: destination,
                message: personalizedMessage,
                platform: platform.toLowerCase(), 
                type: 'text'
            };

            // Usando SINGULAR conforme versão 26.1.6
            await sureFetch('message/sendText', 'POST', payload, config);
            successCount++;
        } catch (err) {
            console.error(`[Campaign] Falha em ${pid}:`, err.message);
            lastError = err.message;
            failureCount++;
        }
    }

    return { 
        success: successCount > 0, 
        count: successCount, 
        failures: failureCount, 
        message: successCount > 0 
            ? `Envio finalizado. Sucesso: ${successCount}, Falha: ${failureCount}.` 
            : `Erro: ${lastError}` 
    };
});

// Helper Genérica para Atribuir Código do Estoque
const assignCodeGeneric = async (membershipId, membershipCollection, eventsCollection) => {
    return await db.runTransaction(async (transaction) => {
        const membershipRef = db.collection(membershipCollection).doc(membershipId);
        const membershipSnap = await transaction.get(membershipRef);
        if (!membershipSnap.exists) throw new Error("Adesão não encontrada.");
        const mData = membershipSnap.data();
        if (mData.status === 'confirmed' && mData.benefitCode) return mData.benefitCode;
        const codesRef = db.collection(eventsCollection).doc(mData.vipEventId).collection("availableCodes");
        const unusedCodeSnap = await transaction.get(codesRef.where("used", "==", false).limit(1));
        if (unusedCodeSnap.empty) throw new Error("ESTOQUE ESGOTADO.");
        const codeDoc = unusedCodeSnap.docs[0];
        const assignedCode = codeDoc.data().code;
        transaction.update(codeDoc.ref, { used: true, usedBy: mData.promoterEmail, usedAt: admin.firestore.FieldValue.serverTimestamp() });
        transaction.update(membershipRef, { status: 'confirmed', benefitCode: assignedCode, isBenefitActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return assignedCode;
    });
};

export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async (data) => {
    return { success: true }; 
});

export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async (data) => {
    const code = await assignCodeGeneric(data.membershipId, "greenlifeMemberships", "greenlifeEvents");
    return { success: true, code };
});

export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const body = req.body;
    if (body.event === 'PAYMENT_CONFIRMED' || body.event === 'PAYMENT_RECEIVED') {
        const ref = body.payment?.externalReference;
        if (ref) {
            try {
                if (ref.startsWith('greenlife_')) {
                    const membershipId = ref.replace('greenlife_', '');
                    await assignCodeGeneric(membershipId, "greenlifeMemberships", "greenlifeEvents");
                } else {
                    await assignCodeGeneric(ref, "vipMemberships", "vipEvents");
                }
            } catch (err) { console.error("Webhook Error:", err.message); }
        }
    }
    res.status(200).send('OK');
});

// Teste de conexão manual
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    
    if (!config) throw new Error("Configuração não encontrada.");
    
    try {
        const payload = {
            instanceId: config.instanceId,
            to: "5585982280780", 
            message: "Teste de conexão - Versão 26.1.6 🚀",
            platform: "whatsapp",
            type: 'text'
        };
        
        const res = await sureFetch('message/sendText', 'POST', payload, config);
        return { success: true, message: "Conectado!", data: res };
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// Cobrança Inteligente
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { assignmentId, promoterId } = data;
    
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    if (!config || !config.isActive) throw new Error("API desativada.");

    const pSnap = await db.collection('promoters').doc(promoterId).get();
    const aSnap = await db.collection('postAssignments').doc(assignmentId).get();
    
    const p = pSnap.data();
    const a = aSnap.data();
    const destination = p.whatsapp.replace(/\D/g, '');
    
    const message = `Oi ${p.name.split(' ')[0]}! Notei que você confirmou o post de "${a.post.campaignName}", mas ainda não enviou o print no portal. 📸\n\nPode enviar agora? 👇\nhttps://divulgadoras.vercel.app/#/posts`;

    const payload = {
        instanceId: config.instanceId,
        to: destination,
        message: message,
        platform: 'whatsapp',
        type: 'text'
    };

    return await sureFetch('message/sendText', 'POST', payload, config);
});
