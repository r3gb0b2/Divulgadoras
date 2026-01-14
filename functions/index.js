
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from './credentials.js';
import * as SibApiV3Sdk from '@getbrevo/brevo';

admin.initializeApp();
const db = admin.firestore();

const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

/**
 * Envio de E-mail via Brevo (Transacional)
 */
const sendVipTicketEmail = async (toEmail, toName, eventName, ticketCode, apiKey) => {
    if (!apiKey) {
        console.warn("Pulo no envio de e-mail: BREVO_API_KEY não configurada.");
        return;
    }

    try {
        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = `Seu ingresso VIP está aqui! 🎫 - ${eventName}`;
        sendSmtpEmail.sender = { "name": "Equipe Certa VIP", "email": "contato@equipecerta.com.br" };
        sendSmtpEmail.to = [{ "email": toEmail, "name": toName }];
        
        sendSmtpEmail.htmlContent = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border-radius: 30px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #7e39d5; margin: 0; font-size: 28px; text-transform: uppercase;">Acesso Confirmado!</h1>
                    <p style="color: #666; font-size: 12px; margin-top: 5px;">EQUIPE CERTA • CLUB VIP</p>
                </div>
                
                <div style="background: #111; padding: 30px; border: 1px solid #333; border-radius: 20px; text-align: center;">
                    <p style="font-size: 14px; color: #aaa; margin-bottom: 10px;">EVENTO</p>
                    <h2 style="margin: 0; font-size: 24px; color: #fff;">${eventName}</h2>
                    
                    <div style="margin: 30px 0; padding: 20px; background: #7e39d5; border-radius: 15px;">
                        <p style="font-size: 12px; color: #eee; margin: 0 0 10px 0; font-weight: bold;">SEU CÓDIGO DE ACESSO</p>
                        <h3 style="font-family: monospace; font-size: 32px; margin: 0; letter-spacing: 5px; color: #fff;">${ticketCode}</h3>
                    </div>

                    <p style="font-size: 13px; color: #888;">Apresente este código ou o QR Code no seu portal na entrada do evento.</p>
                </div>

                <div style="margin-top: 30px; text-align: center;">
                    <a href="https://divulgadoras.vercel.app/#/clubvip/status?email=${encodeURIComponent(toEmail)}" 
                       style="display: inline-block; background: #fff; color: #000; padding: 15px 30px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px;">
                        ABRIR MEU PORTAL VIP
                    </a>
                </div>
            </div>
        `;

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return true;
    } catch (e) {
        console.error("Erro técnico no Brevo:", e.message);
        return false;
    }
};

/**
 * Webhook Asaas
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY", "BREVO_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('OK');
        }

        const checkoutId = event.payment?.externalReference;
        try {
            if (!checkoutId) return res.status(200).send('No Reference');
            
            const checkoutRef = db.collection('checkouts').doc(checkoutId);
            const snap = await checkoutRef.get();
            if (!snap.exists || snap.data().status === 'confirmed') return res.status(200).send('Already Processed');

            const checkoutData = snap.data();
            const qty = checkoutData.quantity || 1;
            const batch = db.batch();

            const codesRef = db.collection('vipEvents').doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            
            for (let i = 0; i < qty; i++) {
                const membershipId = `${checkoutId}_${i}`;
                const codeDoc = codesSnap.docs[i];
                const assignedCode = codeDoc ? codeDoc.data().code : "AGUARDANDO_ESTOQUE";

                if (codeDoc) {
                    batch.update(codeDoc.ref, { used: true, usedBy: checkoutData.promoterEmail, membershipId });
                }

                batch.set(db.collection('vipMemberships').doc(membershipId), {
                    ...checkoutData,
                    id: membershipId,
                    status: 'confirmed',
                    benefitCode: assignedCode,
                    isBenefitActive: !!codeDoc,
                    submittedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                if (codeDoc) {
                    await sendVipTicketEmail(checkoutData.promoterEmail, checkoutData.promoterName, checkoutData.vipEventName, assignedCode, process.env.BREVO_API_KEY);
                }
            }

            batch.update(checkoutRef, { status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            await batch.commit();

            return res.status(200).send('OK');
        } catch (err) {
            console.error("Erro Webhook Asaas:", err.message);
            return res.status(500).send(err.message);
        }
    });

/**
 * Webhook Pagar.me (Teste)
 */
export const pagarmeWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["BREVO_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        if (event.type !== 'order.paid') return res.status(200).send('Ignored');

        const checkoutId = event.data?.metadata?.checkoutId;
        try {
            if (!checkoutId) return res.status(200).send('No ID');
            const checkoutRef = db.collection('checkouts_test').doc(checkoutId);
            const snap = await checkoutRef.get();
            if (!snap.exists || snap.data().status === 'confirmed') return res.status(200).send('OK');

            const data = snap.data();
            await checkoutRef.update({ status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            
            const mId = `TEST_${checkoutId}`;
            const code = 'TESTE_PAGARME';
            
            await db.collection('vipMemberships').doc(mId).set({
                ...data,
                id: mId,
                status: 'confirmed',
                benefitCode: code,
                isBenefitActive: true,
                submittedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await sendVipTicketEmail(data.promoterEmail, data.promoterName, data.vipEventName, code, process.env.BREVO_API_KEY);
            return res.status(200).send('OK');
        } catch (e) { return res.status(500).send(e.message); }
    });

/**
 * Create Pix Pagar.me (Ambiente de Teste)
 */
export const createVipPagarMePix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["PAGARME_SECRET_KEY"] })
    .https.onCall(async (data) => {
        try {
            const { vipEventId, vipEventName, email, name, whatsapp, taxId, amount, quantity } = data;
            const checkoutRef = db.collection('checkouts_test').doc();
            const checkoutId = checkoutRef.id;

            const auth = `Basic ${Buffer.from(`${process.env.PAGARME_SECRET_KEY}:`).toString('base64')}`;
            const payload = {
                items: [{ amount: Math.round(amount * 100), description: vipEventName.substring(0,60), quantity: 1 }],
                customer: { name, email, type: 'individual', document: taxId.replace(/\D/g, ''), phones: { mobile_phone: { country_code: '55', area_code: whatsapp.substring(0,2), number: whatsapp.substring(2) } } },
                payments: [{ payment_method: 'pix', pix: { expires_in: 3600 } }],
                closed: true, metadata: { checkoutId }
            };

            const response = await fetch('https://api.pagar.me/core/v5/orders', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'Authorization': auth },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Erro API PagarMe");

            const pix = result.charges?.[0]?.last_transaction;
            await checkoutRef.set({
                id: checkoutId, vipEventId, vipEventName, promoterName: name, promoterEmail: email,
                amount, quantity, gateway: 'pagarme', status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, checkoutId, qrCode: pix.qr_code, qrCodeUrl: pix.qr_code_url };
        } catch (e) {
            throw new functions.https.HttpsError('internal', e.message);
        }
    });

/**
 * Create Pix Asaas
 */
export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onCall(async (data) => {
        try {
            const { vipEventId, vipEventName, email, name, whatsapp, taxId, amount, quantity } = data;
            const checkoutRef = db.collection('checkouts').doc();
            const checkoutId = checkoutRef.id;
            const apiKey = process.env.ASAAS_API_KEY;

            // Criar cliente
            const cRes = await fetch(`${ASAAS_URL}/customers`, {
                method: 'POST',
                headers: { 'accept': 'application/json', 'content-type': 'application/json', 'access_token': apiKey },
                body: JSON.stringify({ name, email, mobilePhone: whatsapp, cpfCnpj: taxId, notificationDisabled: true })
            });
            const customer = await cRes.json();

            // Criar cobrança
            const pRes = await fetch(`${ASAAS_URL}/payments`, {
                method: 'POST',
                headers: { 'accept': 'application/json', 'content-type': 'application/json', 'access_token': apiKey },
                body: JSON.stringify({ customer: customer.id, billingType: 'PIX', value: amount, dueDate: new Date().toISOString().split('T')[0], externalReference: checkoutId })
            });
            const payment = await pRes.json();

            // Obter QR Code
            const qrRes = await fetch(`${ASAAS_URL}/payments/${payment.id}/pixQrCode`, {
                headers: { 'access_token': apiKey }
            });
            const qrData = await qrRes.json();

            await checkoutRef.set({
                id: checkoutId, vipEventId, vipEventName, promoterName: name, promoterEmail: email,
                amount, quantity, status: 'pending', paymentId: payment.id, createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, checkoutId, payload: qrData.payload, encodedImage: qrData.encodedImage };
        } catch (e) {
            throw new functions.https.HttpsError('internal', e.message);
        }
    });

// Stubs para manter compatibilidade
export const checkBackendStatus = functions.region("southamerica-east1").https.onCall(async () => {
    return { 
        asaasKeyConfigured: !!process.env.ASAAS_API_KEY, 
        pagarmeKeyConfigured: !!process.env.PAGARME_SECRET_KEY,
        brevoKeyConfigured: !!process.env.BREVO_API_KEY 
    };
});
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createAdminRequest = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const savePromoterToken = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "IA Pausada" }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
export const sendNewsletter = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
