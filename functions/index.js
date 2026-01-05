
import admin from "firebase-admin";
import functions from "firebase-functions";
// Importação estática (corrige o erro ERR_REQUIRE_ASYNC_MODULE)
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// Helper para chamadas Asaas
const asaasFetch = async (endpoint, options = {}) => {
    const config = functions.config();
    const apiKey = ASAAS_CONFIG?.key || config.asaas?.key;
    const env = ASAAS_CONFIG?.env || config.asaas?.env || 'sandbox';

    if (!apiKey || apiKey.includes('SUA_CHAVE_AQUI')) {
        console.error("ERRO: API Key não encontrada no credentials.js");
        throw new Error("API Key do Asaas não configurada.");
    }

    const baseUrl = env === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

    const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
            'access_token': apiKey,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0].description);
    return data;
};

/**
 * Lógica central para atribuir um código do estoque a uma adesão.
 * Modificada para garantir que SEMPRE use o estoque e permita substituição.
 */
const internalAssignVipCode = async (membershipId, forceNew = false) => {
    return await db.runTransaction(async (transaction) => {
        const membershipRef = db.collection("vipMemberships").doc(membershipId);
        const membershipSnap = await transaction.get(membershipRef);
        
        if (!membershipSnap.exists) throw new Error("Adesão não encontrada.");
        
        const mData = membershipSnap.data();
        const promoterId = mData.promoterId;
        const vipEventId = mData.vipEventId;

        // Se não for forçado e já tiver um código válido, apenas retorna o atual
        if (!forceNew && mData.benefitCode && mData.benefitCode !== 'AGUARDANDO_GERACAO' && mData.status === 'confirmed') {
            return mData.benefitCode;
        }

        // 1. Buscar PRÓXIMO código disponível no estoque real do evento
        const codesRef = db.collection("vipEvents").doc(vipEventId).collection("availableCodes");
        const unusedCodeSnap = await transaction.get(codesRef.where("used", "==", false).limit(1));
        
        if (unusedCodeSnap.empty) {
            throw new Error(`ESTOQUE ESGOTADO para o evento: ${mData.vipEventName}. Adicione mais códigos no painel.`);
        }

        const codeDoc = unusedCodeSnap.docs[0];
        const newAssignedCode = codeDoc.data().code;
        
        // 2. Marcar novo código como usado
        transaction.update(codeDoc.ref, { 
            used: true, 
            usedBy: promoterId, 
            usedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        // 3. Atualizar a adesão com o novo código do estoque
        transaction.update(membershipRef, {
            status: 'confirmed',
            benefitCode: newAssignedCode,
            isBenefitActive: true,
            paidAt: mData.paidAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Sincronizar com o perfil da divulgadora
        transaction.update(db.collection("promoters").doc(promoterId), {
            emocoesStatus: 'confirmed',
            emocoesBenefitCode: newAssignedCode,
            emocoesBenefitActive: true,
            statusChangedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return newAssignedCode;
    });
};

/**
 * Gera um Pix via Asaas
 */
export const createVipAsaasPix = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { email, name, whatsapp, taxId, amount, vipEventId, promoterId, vipEventName } = data;

    try {
        const customerRes = await asaasFetch('/customers', {
            method: 'POST',
            body: JSON.stringify({
                name, email, mobilePhone: whatsapp, cpfCnpj: taxId, externalReference: promoterId
            })
        });

        const paymentRes = await asaasFetch('/payments', {
            method: 'POST',
            body: JSON.stringify({
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                description: `Adesão VIP: ${vipEventName}`,
                externalReference: `${promoterId}_${vipEventId}`
            })
        });

        const pixRes = await asaasFetch(`/payments/${paymentRes.id}/pixQrCode`);

        const membershipId = `${promoterId}_${vipEventId}`;
        await db.collection("vipMemberships").doc(membershipId).set({
            asaasPaymentId: paymentRes.id,
            status: 'pending',
            benefitCode: 'AGUARDANDO_GERACAO',
            isBenefitActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            promoterId, promoterEmail: email, promoterName: name, promoterTaxId: taxId,
            vipEventId, vipEventName, amount
        }, { merge: true });

        return {
            paymentId: paymentRes.id,
            payload: pixRes.payload,
            encodedImage: pixRes.encodedImage
        };
    } catch (e) {
        throw new functions.https.HttpsError('internal', e.message);
    }
});

/**
 * Ativação Manual ou Troca de Código via Painel Admin
 */
export const activateVipMembership = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId, forceNew } = data;
    try {
        const code = await internalAssignVipCode(membershipId, forceNew || false);
        return { success: true, code };
    } catch (e) {
        throw new functions.https.HttpsError('internal', e.message);
    }
});

/**
 * Webhook Asaas para confirmar pagamento
 */
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const body = req.body;
    if (body.event === 'PAYMENT_CONFIRMED' || body.event === 'PAYMENT_RECEIVED') {
        const externalRef = body.payment?.externalReference;
        if (externalRef) {
            try {
                await internalAssignVipCode(externalRef);
                console.log(`Pagamento confirmado e código atribuído: ${externalRef}`);
            } catch (e) {
                console.error(`Erro no processamento automático: ${externalRef}:`, e.message);
            }
        }
    }
    res.status(200).send('OK');
});
