
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from './credentials.js';

admin.initializeApp();
const db = admin.firestore();

const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

const asaasFetch = async (endpoint, method = 'GET', body = null, apiKey) => {
    const options = {
        method,
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'access_token': apiKey
        }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${ASAAS_URL}/${endpoint}`, options);
    const result = await response.json();
    if (!response.ok) {
        console.error(`Erro API Asaas (${endpoint}):`, result);
        throw new Error(result.errors?.[0]?.description || "Erro na comunicação com Asaas");
    }
    return result;
};

/**
 * Geração de Pix para Clube VIP
 */
export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount, quantity } = data;
        const qty = quantity || 1;
        const asaasKey = process.env.ASAAS_API_KEY;

        const checkoutRef = db.collection('checkouts').doc();
        const checkoutId = checkoutRef.id;

        try {
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''),
                cpfCnpj: taxId.replace(/\D/g, ''),
                notificationDisabled: true
            }, asaasKey);

            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `${qty}x Ingressos VIP: ${vipEventName}`,
                externalReference: checkoutId 
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await checkoutRef.set({
                id: checkoutId,
                type: 'club_vip',
                vipEventId,
                vipEventName,
                promoterId,
                promoterName: name,
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: whatsapp,
                status: 'pending',
                paymentId: paymentRes.id,
                amount,
                quantity: qty,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { 
                success: true, 
                checkoutId: checkoutId,
                payload: qrCodeRes.payload, 
                encodedImage: qrCodeRes.encodedImage 
            };
        } catch (err) {
            console.error("Erro createVipAsaasPix:", err);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Geração de Pix para Alunos Greenlife
 */
export const createGreenlifeAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount } = data;
        const asaasKey = process.env.ASAAS_API_KEY;
        const checkoutRef = db.collection('checkouts').doc();
        const checkoutId = checkoutRef.id;

        try {
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(), email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''), cpfCnpj: taxId.replace(/\D/g, ''), notificationDisabled: true
            }, asaasKey);

            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id, billingType: 'PIX', value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `Adesão Greenlife: ${vipEventName}`,
                externalReference: checkoutId
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await checkoutRef.set({
                id: checkoutId,
                type: 'greenlife',
                vipEventId,
                vipEventName,
                promoterId,
                promoterName: name,
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: whatsapp,
                status: 'pending',
                paymentId: paymentRes.id,
                amount,
                quantity: 1,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { 
                success: true, 
                checkoutId: checkoutId,
                payload: qrCodeRes.payload, 
                encodedImage: qrCodeRes.encodedImage 
            };
        } catch (err) {
            console.error("Erro createGreenlifeAsaasPix:", err);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook Unificado Asaas - CORREÇÃO CRÍTICA
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        console.log("Webhook Asaas Recebido:", event.event, "ExternalRef:", event.payment?.externalReference);

        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('Ignored event type');
        }

        const checkoutId = event.payment.externalReference;
        if (!checkoutId) {
            console.error("Webhook recebido sem externalReference no pagamento.");
            return res.status(200).send('No externalReference');
        }

        try {
            const checkoutRef = db.collection('checkouts').doc(checkoutId);
            const checkoutSnap = await checkoutRef.get();

            if (!checkoutSnap.exists) {
                console.error("Checkout não encontrado no banco:", checkoutId);
                return res.status(404).send('Checkout not found');
            }

            const checkoutData = checkoutSnap.data();
            if (checkoutData.status === 'confirmed') {
                console.log("Checkout já estava confirmado. Ignorando duplicidade.");
                return res.status(200).send('Checkout already processed');
            }

            const qty = checkoutData.quantity || 1;
            const type = checkoutData.type || 'club_vip';
            const collectionName = type === 'greenlife' ? 'greenlifeMemberships' : 'vipMemberships';
            const eventCollection = type === 'greenlife' ? 'greenlifeEvents' : 'vipEvents';

            // 1. Marcar checkout como confirmado imediatamente para liberar o frontend
            await checkoutRef.update({
                status: 'confirmed',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                asaasEvent: event.event
            });

            // 2. Buscar códigos disponíveis em lote para evitar colisões
            const codesRef = db.collection(eventCollection).doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            const availableCodes = codesSnap.docs;

            // 3. Gerar os ingressos
            const batch = db.batch();

            for (let i = 0; i < qty; i++) {
                // ID único do ingresso composto por checkoutId + índice
                const membershipId = `${checkoutId}_${i}`;
                
                let assignedCode = "AGUARDANDO_ESTOQUE";
                let isActive = false;

                if (availableCodes[i]) {
                    const codeDoc = availableCodes[i];
                    assignedCode = codeDoc.data().code;
                    isActive = true;
                    // Atualiza o código como usado no batch
                    batch.update(codeDoc.ref, {
                        used: true,
                        usedBy: checkoutData.promoterEmail,
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        membershipId: membershipId
                    });
                }

                const membershipRef = db.collection(collectionName).doc(membershipId);
                batch.set(membershipRef, {
                    id: membershipId,
                    checkoutId: checkoutId,
                    vipEventId: checkoutData.vipEventId,
                    vipEventName: checkoutData.vipEventName,
                    promoterId: checkoutData.promoterId,
                    promoterName: checkoutData.promoterName,
                    promoterEmail: checkoutData.promoterEmail,
                    promoterWhatsapp: checkoutData.promoterWhatsapp || '',
                    status: 'confirmed',
                    benefitCode: assignedCode,
                    isBenefitActive: isActive,
                    amount: (checkoutData.amount / qty),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    submittedAt: checkoutData.createdAt || admin.firestore.FieldValue.serverTimestamp()
                });
            }

            await batch.commit();
            console.log(`Checkout ${checkoutId} processado com sucesso. ${qty} ingressos gerados.`);
            
            return res.status(200).send('OK');

        } catch (err) {
            console.error("Erro fatal no processamento do Webhook:", err);
            return res.status(500).send(err.message);
        }
    });

// Stubs permanecem inalterados
export const createAdminRequest = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const savePromoterToken = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const checkBackendStatus = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "Gemini is paused." }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
