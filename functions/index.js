
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// Helper para chamadas à API Sure/Babysuri
const sureFetch = async (endpoint, method, body, config) => {
    if (!config || !config.apiUrl || !config.apiToken) {
        throw new Error("Configuração da API Sure incompleta no banco de dados.");
    }
    
    const url = `${config.apiUrl.replace(/\/$/, '')}${endpoint}`;
    
    console.log(`[SureAPI] Chamando ${method} ${url}`);
    
    const res = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    const responseData = await res.json();
    
    if (!res.ok) {
        console.error(`[SureAPI] Erro na Resposta:`, responseData);
        throw new Error(responseData.message || `Erro na API Sure: ${res.status}`);
    }
    
    return responseData;
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

// --- OMNI CHANNEL CAMPAIGN (WhatsApp & Instagram) ---
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { messageTemplate, filters, organizationId, platform = 'whatsapp' } = data;
    
    // Busca config da API
    const configSnap = await db.collection('systemConfig').doc('whatsapp').get();
    const config = configSnap.data();
    
    if (!config || !config.isActive) {
        throw new Error("O módulo de mensagens externas está desativado.");
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
                // Limpeza agressiva do Instagram
                destination = (p.instagram || "")
                    .replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
                    .replace(/@/g, '')
                    .split('/')[0]
                    .split('?')[0]
                    .trim();
            } else {
                destination = (p.whatsapp || "").replace(/\D/g, '');
            }

            if (!destination) {
                failureCount++;
                continue;
            }

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

            await sureFetch('/api/messages/sendText', 'POST', payload, config);
            successCount++;
        } catch (err) {
            console.error(`[Campaign] Falha para ${pid}:`, err.message);
            lastError = err.message;
            failureCount++;
        }
    }

    return { 
        success: successCount > 0, 
        count: successCount, 
        failures: failureCount, 
        message: `Concluído via ${platform.toUpperCase()}. Sucessos: ${successCount}, Falhas: ${failureCount}. ${lastError ? 'Último erro: ' + lastError : ''}` 
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
    const { email, name, whatsapp, taxId, amount, vipEventId, promoterId, vipEventName } = data;
    const customerRes = await asaasFetch('/customers', { method: 'POST', body: JSON.stringify({ name, email, mobilePhone: whatsapp, cpfCnpj: taxId, externalReference: promoterId }) });
    const paymentRes = await asaasFetch('/payments', { method: 'POST', body: JSON.stringify({ customer: customerRes.id, billingType: 'PIX', value: amount, dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], description: `Adesão Greenlife: ${vipEventName}`, externalReference: `greenlife_${promoterId}_${vipEventId}` }) });
    const pixRes = await asaasFetch(`/payments/${paymentRes.id}/pixQrCode`);
    await db.collection("greenlifeMemberships").doc(`${promoterId}_${vipEventId}`).set({ asaasPaymentId: paymentRes.id, status: 'pending', promoterId, promoterEmail: email.toLowerCase().trim(), promoterName: name, vipEventId, vipEventName, amount, updatedAt: admin.firestore.FieldValue.serverTimestamp(), submittedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { paymentId: paymentRes.id, payload: pixRes.payload, encodedImage: pixRes.encodedImage };
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
