
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// Helper Asaas
const asaasFetch = async (endpoint, options = {}) => {
    const config = functions.config();
    const apiKey = ASAAS_CONFIG?.key || config.asaas?.key;
    const env = ASAAS_CONFIG?.env || config.asaas?.env || 'sandbox';
    if (!apiKey || apiKey.includes('SUA_CHAVE_AQUI')) throw new Error("API Key Asaas não configurada.");
    const baseUrl = env === 'production' ? 'https://www.asaas.com/api/v3' : 'https://sandbox.asaas.com/api/v3';
    const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: { 'access_token': apiKey, 'Content-Type': 'application/json', ...options.headers }
    });
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0].description);
    return data;
};

// --- WEBHOOK SURE (WhatsApp/Instagram) ---
// Esta função atende ao requisito GET para verificação e POST para eventos
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    // 1. Verificação do Webhook (Requisito GET solicitado pelo usuário)
    if (req.method === 'GET') {
        // A ferramenta Sure geralmente envia o ID do bot via query string (?id=...) 
        // ou espera que o servidor responda com o ID configurado.
        const botId = req.query.id || req.query.botId || "";
        console.log("Sure Webhook Verification (GET) received for ID:", botId);
        
        // Retornamos apenas o ID em texto puro conforme exigido
        return res.status(200).send(botId);
    }

    // 2. Recebimento de Eventos (POST)
    if (req.method === 'POST') {
        const body = req.body;
        console.log("Sure Webhook Event (POST):", JSON.stringify(body));

        // Aqui futuramente processaremos mensagens recebidas
        // Ex: Se a divulgadora mandar uma foto, podemos tentar identificar se é um print
        
        return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');
});

// Função Genérica para Atribuir Código do Estoque
const assignCodeGeneric = async (membershipId, membershipCollection, eventsCollection) => {
    return await db.runTransaction(async (transaction) => {
        const membershipRef = db.collection(membershipCollection).doc(membershipId);
        const membershipSnap = await transaction.get(membershipRef);
        
        if (!membershipSnap.exists) throw new Error("Adesão não encontrada no sistema.");
        const mData = membershipSnap.data();
        
        if (mData.status === 'confirmed' && mData.benefitCode) return mData.benefitCode;

        const codesRef = db.collection(eventsCollection).doc(mData.vipEventId).collection("availableCodes");
        const unusedCodeSnap = await transaction.get(codesRef.where("used", "==", false).limit(1));
        
        if (unusedCodeSnap.empty) throw new Error("ESTOQUE ESGOTADO PARA ESTE EVENTO.");
        
        const codeDoc = unusedCodeSnap.docs[0];
        const assignedCode = codeDoc.data().code;

        transaction.update(codeDoc.ref, { 
            used: true, 
            usedBy: mData.promoterEmail, 
            usedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        transaction.update(membershipRef, { 
            status: 'confirmed', 
            benefitCode: assignedCode, 
            isBenefitActive: true, 
            updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        return assignedCode;
    });
};

// --- GREENLIFE FUNCTIONS ---
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async (data) => {
    const { email, name, whatsapp, taxId, amount, vipEventId, promoterId, vipEventName } = data;
    const customerRes = await asaasFetch('/customers', { 
        method: 'POST', 
        body: JSON.stringify({ name, email, mobilePhone: whatsapp, cpfCnpj: taxId, externalReference: promoterId }) 
    });
    const paymentRes = await asaasFetch('/payments', { 
        method: 'POST', 
        body: JSON.stringify({ 
            customer: customerRes.id, 
            billingType: 'PIX', 
            value: amount, 
            dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], 
            description: `Adesão Greenlife: ${vipEventName}`, 
            externalReference: `greenlife_${promoterId}_${vipEventId}` 
        }) 
    });
    const pixRes = await asaasFetch(`/payments/${paymentRes.id}/pixQrCode`);
    await db.collection("greenlifeMemberships").doc(`${promoterId}_${vipEventId}`).set({ 
        asaasPaymentId: paymentRes.id, 
        status: 'pending', 
        promoterId, 
        promoterEmail: email.toLowerCase().trim(), 
        promoterName: name, 
        vipEventId, 
        vipEventName, 
        amount, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { paymentId: paymentRes.id, payload: pixRes.payload, encodedImage: pixRes.encodedImage };
});

export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async (data) => {
    const code = await assignCodeGeneric(data.membershipId, "greenlifeMemberships", "greenlifeEvents");
    return { success: true, code };
});

// --- WEBHOOK ASAAS ---
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
