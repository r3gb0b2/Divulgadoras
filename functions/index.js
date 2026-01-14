
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from './credentials.js';

admin.initializeApp();
const db = admin.firestore();

const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

/**
 * Auxiliar para chamadas Asaas com tratamento de erro detalhado
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
    
    try {
        const response = await fetch(`${ASAAS_URL}/${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            console.error(`ERRO API ASAAS [${endpoint}]:`, JSON.stringify(result));
            throw new Error(result.errors?.[0]?.description || "Erro desconhecido na API Asaas");
        }
        return result;
    } catch (err) {
        console.error(`FALHA DE CONEXÃO ASAAS [${endpoint}]:`, err.message);
        throw err;
    }
};

/**
 * Geração de Pix para Clube VIP (Suporta 1 ou mais ingressos)
 */
export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount, quantity } = data;
        const qty = quantity || 1;
        const asaasKey = process.env.ASAAS_API_KEY;

        if (!asaasKey) throw new functions.https.HttpsError('failed-precondition', 'Chave API Asaas não configurada no servidor.');

        // 1. Sanitização rigorosa
        const cleanTaxId = taxId.replace(/\D/g, '');
        const cleanPhone = whatsapp.replace(/\D/g, '');
        const cleanEmail = email.toLowerCase().trim();

        // 2. Criar referência de checkout único
        const checkoutRef = db.collection('checkouts').doc();
        const checkoutId = checkoutRef.id;

        try {
            // 3. Salvar checkout pendente ANTES para evitar erro 404 no webhook
            await checkoutRef.set({
                id: checkoutId,
                type: 'club_vip',
                vipEventId,
                vipEventName,
                promoterId,
                promoterName: name.trim(),
                promoterEmail: cleanEmail,
                promoterWhatsapp: cleanPhone,
                status: 'pending',
                amount,
                quantity: qty,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4. Criar/Recuperar Cliente no Asaas
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(),
                email: cleanEmail,
                mobilePhone: cleanPhone,
                cpfCnpj: cleanTaxId,
                notificationDisabled: true
            }, asaasKey);

            // 5. Criar Cobrança Pix
            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `${qty}x Ingressos VIP: ${vipEventName}`,
                externalReference: checkoutId 
            }, asaasKey);

            // 6. Obter QR Code
            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            // 7. Atualizar checkout com ID do pagamento
            await checkoutRef.update({ paymentId: paymentRes.id });

            return { 
                success: true, 
                checkoutId: checkoutId,
                payload: qrCodeRes.payload, 
                encodedImage: qrCodeRes.encodedImage 
            };

        } catch (err) {
            console.error("Erro em createVipAsaasPix:", err.message);
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

        const cleanTaxId = taxId.replace(/\D/g, '');
        const cleanPhone = whatsapp.replace(/\D/g, '');
        const checkoutRef = db.collection('checkouts').doc();
        const checkoutId = checkoutRef.id;

        try {
            await checkoutRef.set({
                id: checkoutId,
                type: 'greenlife',
                vipEventId,
                vipEventName,
                promoterId,
                promoterName: name.trim(),
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: cleanPhone,
                status: 'pending',
                amount,
                quantity: 1,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(), email: email.toLowerCase().trim(),
                mobilePhone: cleanPhone, cpfCnpj: cleanTaxId, notificationDisabled: true
            }, asaasKey);

            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id, billingType: 'PIX', value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `Adesão Greenlife: ${vipEventName}`,
                externalReference: checkoutId
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await checkoutRef.update({ paymentId: paymentRes.id });

            return { success: true, checkoutId, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
        } catch (err) {
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook Unificado Asaas - PROCESSAMENTO DE PAGAMENTOS
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        console.log("--- WEBHOOK RECEBIDO ---", event.event, "Ref:", event.payment?.externalReference);

        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('Event Ignored');
        }

        const checkoutId = event.payment?.externalReference;
        if (!checkoutId) return res.status(200).send('Missing ExternalRef');

        try {
            const checkoutRef = db.collection('checkouts').doc(checkoutId);
            const checkoutSnap = await checkoutRef.get();

            if (!checkoutSnap.exists) {
                console.error("ERRO: Checkout no Banco não encontrado para o ID:", checkoutId);
                return res.status(200).send('Checkout record missing');
            }

            const checkoutData = checkoutSnap.data();
            if (checkoutData.status === 'confirmed') {
                return res.status(200).send('Already processed');
            }

            const qty = checkoutData.quantity || 1;
            const collectionName = checkoutData.type === 'greenlife' ? 'greenlifeMemberships' : 'vipMemberships';
            const eventCollection = checkoutData.type === 'greenlife' ? 'greenlifeEvents' : 'vipEvents';

            const batch = db.batch();

            // 1. Atualizar Checkout
            batch.update(checkoutRef, {
                status: 'confirmed',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                asaasPaymentId: event.payment.id
            });

            // 2. Buscar Códigos em Lote
            const codesRef = db.collection(eventCollection).doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            const availableCodes = codesSnap.docs;

            // 3. Gerar Ingressos
            for (let i = 0; i < qty; i++) {
                const membershipId = `${checkoutId}_${i}`;
                let assignedCode = "AGUARDANDO_ESTOQUE";
                let isActive = false;

                if (availableCodes[i]) {
                    const codeDoc = availableCodes[i];
                    assignedCode = codeDoc.data().code;
                    isActive = true;
                    batch.update(codeDoc.ref, {
                        used: true,
                        usedBy: checkoutData.promoterEmail,
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        membershipId: membershipId
                    });
                }

                batch.set(db.collection(collectionName).doc(membershipId), {
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
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    submittedAt: checkoutData.createdAt || admin.firestore.FieldValue.serverTimestamp()
                });
            }

            await batch.commit();
            console.log(`SUCESSO: Checkout ${checkoutId} concluído. ${qty} ingressos gerados.`);
            return res.status(200).send('OK');

        } catch (err) {
            console.error("ERRO FATAL NO WEBHOOK:", err);
            return res.status(500).send(err.message);
        }
    });

// Stubs para evitar quebra do portal
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
