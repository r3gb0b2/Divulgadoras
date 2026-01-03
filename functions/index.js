
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
 * Lógica central para atribuir um código do estoque a uma adesão
 * Pode ser chamada pelo Webhook ou manualmente pelo Admin
 */
const internalAssignVipCode = async (membershipId) => {
    const [promoterId, vipEventId] = membershipId.split('_');
    
    return await db.runTransaction(async (transaction) => {
        const membershipRef = db.collection("vipMemberships").doc(membershipId);
        const membershipSnap = await transaction.get(membershipRef);
        
        if (!membershipSnap.exists) throw new Error("Adesão não encontrada.");
        const mData = membershipSnap.data();

        // Se já tem um código real atribuído (não o placeholder), não faz nada
        if (mData.benefitCode && mData.benefitCode !== 'AGUARDANDO_GERACAO' && mData.isBenefitActive) {
            return mData.benefitCode;
        }

        // 1. Buscar código disponível no estoque do evento
        const codesRef = db.collection("vipEvents").doc(vipEventId).collection("availableCodes");
        const unusedCodeSnap = await transaction.get(codesRef.where("used", "==", false).limit(1));
        
        if (unusedCodeSnap.empty) {
            throw new Error("ESTOQUE ESGOTADO: Não há códigos disponíveis para este evento.");
        }

        const codeDoc = unusedCodeSnap.docs[0];
        const assignedCode = codeDoc.data().code;
        
        // 2. Marcar código como usado
        transaction.update(codeDoc.ref, { 
            used: true, 
            usedBy: promoterId, 
            usedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        // 3. Atualizar adesão
        transaction.update(membershipRef, {
            status: 'confirmed',
            benefitCode: assignedCode,
            isBenefitActive: true,
            paidAt: mData.paidAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Atualizar perfil da divulgadora
        transaction.update(db.collection("promoters").doc(promoterId), {
            emocoesStatus: 'confirmed',
            emocoesBenefitCode: assignedCode,
            emocoesBenefitActive: true,
            statusChangedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return assignedCode;
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
 * Ativação Manual via Painel Admin
 * Busca código no estoque e notifica o usuário
 */
export const activateVipMembership = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId } = data;
    try {
        const code = await internalAssignVipCode(membershipId);
        // Aqui você pode adicionar lógica de envio de e-mail se desejar
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
                console.log(`Pagamento e código auto-atribuído via Webhook: ${externalRef}`);
            } catch (e) {
                console.error(`Erro ao processar webhook para ${externalRef}:`, e.message);
            }
        }
    }
    res.status(200).send('OK');
});
