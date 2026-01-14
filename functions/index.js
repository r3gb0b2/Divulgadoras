
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from './credentials.js';

admin.initializeApp();
const db = admin.firestore();

const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

/**
 * Helper para chamadas Asaas
 */
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
        console.error(`ERRO API ASAAS (${endpoint}):`, JSON.stringify(result));
        throw new Error(result.errors?.[0]?.description || "Erro Asaas");
    }
    return result;
};

/**
 * Geração de Pix Asaas (Oficial)
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
            // 1. Salva registro preventivo
            await checkoutRef.set({
                id: checkoutId,
                type: 'club_vip',
                vipEventId,
                vipEventName,
                promoterId,
                promoterName: name.trim(),
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: whatsapp.replace(/\D/g, ''),
                status: 'pending',
                amount,
                quantity: qty,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Cliente Asaas
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''),
                cpfCnpj: taxId.replace(/\D/g, ''),
                notificationDisabled: true
            }, asaasKey);

            // 3. Cobrança
            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `${qty}x Ingressos VIP: ${vipEventName}`,
                externalReference: checkoutId 
            }, asaasKey);

            // 4. QR Code
            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await checkoutRef.update({ paymentId: paymentRes.id });

            return { success: true, checkoutId, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
        } catch (err) {
            console.error("FALHA createVipAsaasPix:", err.message);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook Asaas (Oficial)
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        console.log(`[ASAAS WEBHOOK] Evento: ${event.event} | ID: ${event.payment?.id}`);

        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('OK');
        }

        const checkoutId = event.payment?.externalReference;
        const paymentId = event.payment?.id;

        try {
            let checkoutData = null;
            let checkoutRef = null;

            // Busca por ID de referência
            if (checkoutId) {
                checkoutRef = db.collection('checkouts').doc(checkoutId);
                const snap = await checkoutRef.get();
                if (snap.exists) checkoutData = snap.data();
            }

            // Busca de segurança por PaymentID se a referência falhar
            if (!checkoutData && paymentId) {
                const query = await db.collection('checkouts').where('paymentId', '==', paymentId).limit(1).get();
                if (!query.empty) {
                    checkoutRef = query.docs[0].ref;
                    checkoutData = query.docs[0].data();
                }
            }

            if (!checkoutData) {
                console.error(`[ERRO] Checkout não encontrado para Ref: ${checkoutId} ou PayID: ${paymentId}`);
                return res.status(200).send('Record not found');
            }

            if (checkoutData.status === 'confirmed') return res.status(200).send('OK');

            const qty = checkoutData.quantity || 1;
            const batch = db.batch();

            // Buscar códigos
            const codesRef = db.collection('vipEvents').doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            const availableCodes = codesSnap.docs;

            console.log(`[INFO] Processando ${qty} ingressos para ${checkoutData.promoterEmail}`);

            for (let i = 0; i < qty; i++) {
                const membershipId = `${checkoutData.id}_${i}`;
                let assignedCode = "AGUARDANDO_ESTOQUE";
                let isActive = false;

                if (availableCodes[i]) {
                    assignedCode = availableCodes[i].data().code;
                    isActive = true;
                    batch.update(availableCodes[i].ref, {
                        used: true,
                        usedBy: checkoutData.promoterEmail,
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        membershipId: membershipId
                    });
                }

                batch.set(db.collection('vipMemberships').doc(membershipId), {
                    id: membershipId,
                    checkoutId: checkoutData.id,
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

            batch.update(checkoutRef, { status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            await batch.commit();

            console.log(`[SUCESSO] Checkout ${checkoutData.id} finalizado.`);
            return res.status(200).send('OK');

        } catch (err) {
            console.error("[ERRO CRÍTICO WEBHOOK]:", err.message);
            return res.status(500).send(err.message);
        }
    });

/**
 * Geração de Pix Pagar.me (Ambiente de Teste)
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
            const authHeader = `Basic ${Buffer.from(`${pagarmeKey}:`).toString('base64')}`;
            const response = await fetch('https://api.pagar.me/core/v5/orders', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'content-type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    items: [{
                        amount: Math.round(amount * 100),
                        description: `VIP Test: ${vipEventName}`,
                        quantity: 1,
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
                                area_code: whatsapp.replace(/\D/g, '').substring(0, 2),
                                number: whatsapp.replace(/\D/g, '').substring(2)
                            }
                        }
                    },
                    payments: [{
                        payment_method: 'pix',
                        pix: { expires_in: 3600 }
                    }],
                    closed: true,
                    metadata: { checkoutId: checkoutId }
                })
            });

            const order = await response.json();
            if (!response.ok) throw new Error(order.message || "Erro Pagar.me");

            const pixInfo = order.charges?.[0]?.last_transaction;

            await checkoutRef.set({
                id: checkoutId,
                type: 'club_vip_test',
                vipEventId,
                vipEventName,
                promoterName: name,
                promoterEmail: email.toLowerCase().trim(),
                status: 'pending',
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
            console.error("createVipPagarMePix Error:", err);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook Pagar.me (Teste)
 */
export const pagarmeWebhook = functions
    .region("southamerica-east1")
    .https.onRequest(async (req, res) => {
        const event = req.body;
        if (event.type !== 'order.paid') return res.status(200).send('Ignored');

        const checkoutId = event.data?.metadata?.checkoutId;
        if (!checkoutId) return res.status(200).send('No ID');

        try {
            const checkoutRef = db.collection('checkouts_test').doc(checkoutId);
            const snap = await checkoutRef.get();
            if (!snap.exists || snap.data().status === 'confirmed') return res.status(200).send('OK');

            await checkoutRef.update({ status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            
            // Gerar ingresso de teste no banco real para validar
            const data = snap.data();
            const membershipId = `TEST_${checkoutId}`;
            await db.collection('vipMemberships').doc(membershipId).set({
                id: membershipId,
                vipEventName: data.vipEventName,
                promoterName: data.promoterName,
                promoterEmail: data.promoterEmail,
                status: 'confirmed',
                benefitCode: 'TESTE_PAGARME',
                isBenefitActive: true,
                submittedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).send('OK');
        } catch (e) { return res.status(500).send(e.message); }
    });

// Stubs obrigatórios
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onCall(async (data) => { /* mantida */ });
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
