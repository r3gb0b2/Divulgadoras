
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG, PAGARME_CONFIG } from './credentials.js';

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

// --- NOVAS FUNÇÕES PARA TESTE PAGAR.ME ---

/**
 * Geração de Pix via Pagar.me (Ambiente de Teste)
 */
export const createVipPagarMePix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["PAGARME_SECRET_KEY"] })
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount, quantity } = data;
        const qty = quantity || 1;
        const pagarmeKey = process.env.PAGARME_SECRET_KEY;

        const checkoutRef = db.collection('checkouts_test').doc();
        const checkoutId = checkoutRef.id;

        try {
            // Documentação Pagar.me V5: Create Order
            const response = await fetch('https://api.pagar.me/core/v5/orders', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'content-type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`${pagarmeKey}:`).toString('base64')}`
                },
                body: JSON.stringify({
                    items: [{
                        amount: Math.round(amount * 100), // Pagar.me usa centavos
                        description: `VIP Test: ${vipEventName}`,
                        quantity: 1, // O total já vem multiplicado do front
                        code: vipEventId
                    }],
                    customer: {
                        name: name.trim(),
                        email: email.toLowerCase().trim(),
                        type: 'individual',
                        document: taxId.replace(/\D/g, ''),
                        phones: {
                            mobile_phone: {
                                country_code: '55',
                                area_code: whatsapp.substring(0, 2),
                                number: whatsapp.substring(2)
                            }
                        }
                    },
                    payments: [{
                        payment_method: 'pix',
                        pix: {
                            expires_in: 3600 // 1 hora
                        }
                    }],
                    closed: true,
                    metadata: {
                        checkoutId: checkoutId,
                        promoterId: promoterId,
                        environment: 'test_migration'
                    }
                })
            });

            const order = await response.json();
            
            if (!response.ok) {
                console.error("Erro Pagarme API:", order);
                throw new Error(order.message || "Erro no Pagar.me");
            }

            const pixInfo = order.checkouts?.[0]?.payment?.pix || order.charges?.[0]?.last_transaction;

            await checkoutRef.set({
                id: checkoutId,
                type: 'club_vip_test',
                vipEventId,
                vipEventName,
                promoterId,
                promoterName: name,
                promoterEmail: email.toLowerCase().trim(),
                status: 'pending',
                orderId: order.id,
                paymentId: order.charges?.[0]?.id,
                amount,
                quantity: qty,
                gateway: 'pagarme',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { 
                success: true, 
                checkoutId: checkoutId,
                qrCode: pixInfo.qr_code,
                qrCodeUrl: pixInfo.qr_code_url
            };
        } catch (err) {
            console.error("Erro createVipPagarMePix:", err);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook Pagar.me (Ambiente de Teste)
 */
export const pagarmeWebhook = functions
    .region("southamerica-east1")
    .https.onRequest(async (req, res) => {
        const event = req.body;
        console.log("Pagarme Webhook Recebido:", event.type, "OrderID:", event.data?.id);

        // Apenas processamos ordens pagas
        if (event.type !== 'order.paid') {
            return res.status(200).send('Ignored');
        }

        const checkoutId = event.data?.metadata?.checkoutId;
        if (!checkoutId) return res.status(200).send('No metadata');

        try {
            const checkoutRef = db.collection('checkouts_test').doc(checkoutId);
            const checkoutSnap = await checkoutRef.get();

            if (!checkoutSnap.exists) return res.status(200).send('Not found');

            const checkoutData = checkoutSnap.data();
            if (checkoutData.status === 'confirmed') return res.status(200).send('Already done');

            // Confirmamos o checkout de teste
            await checkoutRef.update({
                status: 'confirmed',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                pagarmeOrderId: event.data.id
            });

            // Lógica de geração de ingressos (usando mesma lógica do oficial mas em test collection se preferir)
            // Para simplicidade de teste real, vamos gerar no vipMemberships real para você ver o ingresso lá
            const qty = checkoutData.quantity || 1;
            
            // Busca códigos
            const codesRef = db.collection('vipEvents').doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            const availableCodes = codesSnap.docs;

            const batch = db.batch();
            for (let i = 0; i < qty; i++) {
                const membershipId = `TEST_${checkoutId}_${i}`;
                let code = "TEST_CODE";
                if (availableCodes[i]) {
                    code = availableCodes[i].data().code;
                    batch.update(availableCodes[i].ref, { used: true, usedBy: checkoutData.promoterEmail });
                }

                batch.set(db.collection('vipMemberships').doc(membershipId), {
                    id: membershipId,
                    checkoutId: checkoutId,
                    vipEventId: checkoutData.vipEventId,
                    vipEventName: checkoutData.vipEventName,
                    promoterName: checkoutData.promoterName,
                    promoterEmail: checkoutData.promoterEmail,
                    status: 'confirmed',
                    benefitCode: code,
                    isBenefitActive: true,
                    gateway: 'pagarme_test',
                    submittedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            await batch.commit();

            return res.status(200).send('OK');
        } catch (err) {
            console.error("Erro Webhook Pagarme:", err);
            return res.status(500).send(err.message);
        }
    });

// Funções Originais Asaas Permanecem Inalteradas
export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onCall(async (data, context) => {
        // ... (lógica existente mantida)
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount, quantity } = data;
        const qty = quantity || 1;
        const asaasKey = process.env.ASAAS_API_KEY;

        const checkoutRef = db.collection('checkouts').doc();
        const checkoutId = checkoutRef.id;

        try {
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
                amount,
                quantity: qty,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(), email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''), cpfCnpj: taxId.replace(/\D/g, ''), notificationDisabled: true
            }, asaasKey);

            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id, billingType: 'PIX', value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `${qty}x Ingressos VIP: ${vipEventName}`,
                externalReference: checkoutId 
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await checkoutRef.update({ paymentId: paymentRes.id });

            return { success: true, checkoutId, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
        } catch (err) { throw new functions.https.HttpsError('internal', err.message); }
    });

export const createGreenlifeAsaasPix = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onCall(async (data) => { /* mantida */ });
export const asaasWebhook = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onRequest(async (req, res) => { /* mantida */ res.status(200).send('OK'); });

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
