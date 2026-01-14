
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

        // Criar um checkout único para esta tentativa de pagamento
        const checkoutRef = db.collection('checkouts').doc();
        const checkoutId = checkoutRef.id;

        try {
            // 1. Criar ou recuperar cliente no Asaas
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''),
                cpfCnpj: taxId.replace(/\D/g, ''),
                notificationDisabled: true
            }, asaasKey);

            // 2. Criar cobrança Pix
            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `${qty}x Ingressos VIP: ${vipEventName}`,
                externalReference: checkoutId // O Checkout ID é a nossa referência principal
            }, asaasKey);

            // 3. Obter QR Code
            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            // 4. Salvar dados do checkout pendente
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
 * Webhook Unificado Asaas
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        console.log("Webhook Asaas Recebido:", event.event, "Ref:", event.payment?.externalReference);

        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('Ignored event type');
        }

        const checkoutId = event.payment.externalReference;
        if (!checkoutId) return res.status(200).send('No externalReference');

        try {
            const checkoutRef = db.collection('checkouts').doc(checkoutId);
            const checkoutSnap = await checkoutRef.get();

            if (!checkoutSnap.exists) {
                console.error("Checkout não encontrado:", checkoutId);
                return res.status(404).send('Checkout not found');
            }

            const checkoutData = checkoutSnap.data();
            if (checkoutData.status === 'confirmed') {
                return res.status(200).send('Checkout already processed');
            }

            const qty = checkoutData.quantity || 1;
            const collectionName = checkoutData.type === 'greenlife' ? 'greenlifeMemberships' : 'vipMemberships';
            const eventCollection = checkoutData.type === 'greenlife' ? 'greenlifeEvents' : 'vipEvents';

            // Gerar múltiplos ingressos (um para cada item da quantidade)
            for (let i = 0; i < qty; i++) {
                const membershipId = `${checkoutData.promoterId}_${checkoutData.vipEventId}_${i}`;
                
                // Buscar código disponível
                const codesRef = db.collection(eventCollection).doc(checkoutData.vipEventId).collection('availableCodes');
                const codeSnap = await codesRef.where('used', '==', false).limit(1).get();

                let assignedCode = "AGUARDANDO_ESTOQUE";
                let isActive = false;

                if (!codeSnap.empty) {
                    const codeDoc = codeSnap.docs[0];
                    assignedCode = codeDoc.data().code;
                    isActive = true;
                    await codeDoc.ref.update({
                        used: true,
                        usedBy: checkoutData.promoterEmail,
                        usedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                await db.collection(collectionName).doc(membershipId).set({
                    id: membershipId,
                    checkoutId: checkoutId,
                    vipEventId: checkoutData.vipEventId,
                    vipEventName: checkoutData.vipEventName,
                    promoterId: checkoutData.promoterId,
                    promoterName: checkoutData.promoterName,
                    promoterEmail: checkoutData.promoterEmail,
                    promoterWhatsapp: checkoutData.promoterWhatsapp,
                    status: 'confirmed',
                    benefitCode: assignedCode,
                    isBenefitActive: isActive,
                    amount: (checkoutData.amount / qty),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Atualizar status do checkout para o frontend detectar
            await checkoutRef.update({
                status: 'confirmed',
                paidAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Checkout ${checkoutId} concluído com sucesso. ${qty} ingressos gerados.`);
            return res.status(200).send('OK');

        } catch (err) {
            console.error("Erro no processamento do Webhook:", err);
            return res.status(500).send(err.message);
        }
    });

// Restante dos stubs
export const createAdminRequest = functions.region("southamerica-east1").https.onCall(async (data) => {
    const { name, email, phone, password } = data;
    const emailLower = email.toLowerCase().trim();
    const userRecord = await admin.auth().createUser({ email: emailLower, password, displayName: name });
    await db.collection('adminApplications').doc(userRecord.uid).set({
        id: userRecord.uid, name: name.trim(), email: emailLower, phone: phone || '', status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, uid: userRecord.uid };
});
export const createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const savePromoterToken = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const checkBackendStatus = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "Gemini is paused." }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
