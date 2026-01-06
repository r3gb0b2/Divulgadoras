
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

// Função Genérica para Atribuir Código do Estoque
const assignCodeGeneric = async (membershipId, membershipCollection, eventsCollection) => {
    return await db.runTransaction(async (transaction) => {
        const membershipRef = db.collection(membershipCollection).doc(membershipId);
        const membershipSnap = await transaction.get(membershipRef);
        
        if (!membershipSnap.exists) throw new Error("Adesão não encontrada no sistema.");
        const mData = membershipSnap.data();
        
        // Se já tiver código, não faz nada (evita gasto duplo de estoque)
        if (mData.status === 'confirmed' && mData.benefitCode) return mData.benefitCode;

        const codesRef = db.collection(eventsCollection).doc(mData.vipEventId).collection("availableCodes");
        const unusedCodeSnap = await transaction.get(codesRef.where("used", "==", false).limit(1));
        
        if (unusedCodeSnap.empty) throw new Error("ESTOQUE ESGOTADO PARA ESTE EVENTO.");
        
        const codeDoc = unusedCodeSnap.docs[0];
        const assignedCode = codeDoc.data().code;

        // Atualiza o código como usado
        transaction.update(codeDoc.ref, { 
            used: true, 
            usedBy: mData.promoterEmail, 
            usedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        // Atualiza a adesão do aluno
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
    
    // Registra a intenção de adesão
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

// --- WEBHOOK UNIFICADO ---

export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const body = req.body;
    console.log("Asaas Webhook Received:", body.event, body.payment?.externalReference);

    if (body.event === 'PAYMENT_CONFIRMED' || body.event === 'PAYMENT_RECEIVED') {
        const ref = body.payment?.externalReference;
        
        if (ref) {
            try {
                if (ref.startsWith('greenlife_')) {
                    const membershipId = ref.replace('greenlife_', '');
                    await assignCodeGeneric(membershipId, "greenlifeMemberships", "greenlifeEvents");
                    console.log("Greenlife payment processed:", membershipId);
                } else {
                    // Fallback para o Club VIP original (que não usa prefixo)
                    await assignCodeGeneric(ref, "vipMemberships", "vipEvents");
                    console.log("VIP payment processed:", ref);
                }
            } catch (err) {
                console.error("Webhook Error:", err.message);
                // Retornamos 200 mesmo com erro interno para o Asaas não ficar repetindo o erro se for regra de negócio (estoque vazio)
            }
        }
    }
    res.status(200).send('OK');
});
