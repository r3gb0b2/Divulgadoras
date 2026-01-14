
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
 * Helper para envio de e-mail via Brevo
 */
const sendVipTicketEmail = async (toEmail, toName, eventName, ticketCode, apiKey) => {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `Seu ingresso VIP está aqui! 🎫 - ${eventName}`;
    sendSmtpEmail.sender = { "name": "Equipe Certa VIP", "email": "contato@equipecerta.com.br" };
    sendSmtpEmail.to = [{ "email": toEmail, "name": toName }];
    
    // Layout do E-mail de Ingresso
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

            <p style="font-size: 11px; color: #444; text-align: center; margin-top: 40px;">
                Este é um e-mail automático. Em caso de dúvidas, procure o organizador do seu evento.
            </p>
        </div>
    `;

    return apiInstance.sendTransacEmail(sendSmtpEmail);
};

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
    if (!response.ok) throw new Error(result.errors?.[0]?.description || "Erro Asaas");
    return result;
};

/**
 * Webhook Asaas (Oficial)
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
        const paymentId = event.payment?.id;

        try {
            let checkoutData = null;
            let checkoutRef = null;

            if (checkoutId) {
                checkoutRef = db.collection('checkouts').doc(checkoutId);
                const snap = await checkoutRef.get();
                if (snap.exists) checkoutData = snap.data();
            }

            if (!checkoutData && paymentId) {
                const query = await db.collection('checkouts').where('paymentId', '==', paymentId).limit(1).get();
                if (!query.empty) {
                    checkoutRef = query.docs[0].ref;
                    checkoutData = query.docs[0].data();
                }
            }

            if (!checkoutData || checkoutData.status === 'confirmed') return res.status(200).send('OK');

            const qty = checkoutData.quantity || 1;
            const batch = db.batch();

            const codesRef = db.collection('vipEvents').doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            const availableCodes = codesSnap.docs;

            const membershipsToEmail = [];

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

                const mData = {
                    id: membershipId,
                    checkoutId: checkoutData.id,
                    vipEventId: checkoutData.vipEventId,
                    vipEventName: checkoutData.vipEventName,
                    promoterName: checkoutData.promoterName,
                    promoterEmail: checkoutData.promoterEmail,
                    promoterWhatsapp: checkoutData.promoterWhatsapp || '',
                    status: 'confirmed',
                    benefitCode: assignedCode,
                    isBenefitActive: isActive,
                    amount: (checkoutData.amount / qty),
                    submittedAt: checkoutData.createdAt || admin.firestore.FieldValue.serverTimestamp()
                };

                batch.set(db.collection('vipMemberships').doc(membershipId), mData);
                
                if (isActive) {
                    membershipsToEmail.push({ 
                        email: mData.promoterEmail, 
                        name: mData.promoterName, 
                        event: mData.vipEventName, 
                        code: mData.benefitCode 
                    });
                }
            }

            batch.update(checkoutRef, { status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            await batch.commit();

            // Disparo de E-mails após commit bem sucedido
            if (process.env.BREVO_API_KEY) {
                for (const m of membershipsToEmail) {
                    try {
                        await sendVipTicketEmail(m.email, m.name, m.event, m.code, process.env.BREVO_API_KEY);
                    } catch (e) { console.error("Erro envio email:", e.message); }
                }
            }

            return res.status(200).send('OK');
        } catch (err) {
            console.error("[ASAAS WEBHOOK ERROR]:", err.message);
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
        if (!checkoutId) return res.status(200).send('No ID');

        try {
            const checkoutRef = db.collection('checkouts_test').doc(checkoutId);
            const snap = await checkoutRef.get();
            if (!snap.exists || snap.data().status === 'confirmed') return res.status(200).send('OK');

            const data = snap.data();
            await checkoutRef.update({ status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            
            const membershipId = `TEST_${checkoutId}`;
            const code = 'TESTE_PAGARME';
            
            await db.collection('vipMemberships').doc(membershipId).set({
                id: membershipId,
                vipEventName: data.vipEventName,
                promoterName: data.promoterName,
                promoterEmail: data.promoterEmail,
                status: 'confirmed',
                benefitCode: code,
                isBenefitActive: true,
                submittedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            if (process.env.BREVO_API_KEY) {
                await sendVipTicketEmail(data.promoterEmail, data.promoterName, data.vipEventName, code, process.env.BREVO_API_KEY);
            }

            return res.status(200).send('OK');
        } catch (e) { return res.status(500).send(e.message); }
    });

// Stubs obrigatórios mantidos para não quebrar o deploy
export const createVipAsaasPix = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onCall(async (data) => {
    const { vipEventId, vipEventName, email, name, whatsapp, taxId, amount, quantity } = data;
    const checkoutRef = db.collection('checkouts').doc();
    const checkoutId = checkoutRef.id;
    const asaasKey = process.env.ASAAS_API_KEY;
    const customerRes = await asaasFetch('customers', 'POST', { name, email, mobilePhone: whatsapp, cpfCnpj: taxId, notificationDisabled: true }, asaasKey);
    const paymentRes = await asaasFetch('payments', 'POST', { customer: customerRes.id, billingType: 'PIX', value: amount, dueDate: new Date().toISOString().split('T')[0], externalReference: checkoutId }, asaasKey);
    const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);
    await checkoutRef.set({ id: checkoutId, type: 'club_vip', vipEventId, vipEventName, promoterName: name, promoterEmail: email, status: 'pending', amount, quantity, paymentId: paymentRes.id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, checkoutId, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
});
export const createVipPagarMePix = functions.region("southamerica-east1").runWith({ secrets: ["PAGARME_SECRET_KEY"] }).https.onCall(async (data) => {
    const { vipEventId, vipEventName, email, name, whatsapp, taxId, amount, quantity } = data;
    const checkoutRef = db.collection('checkouts_test').doc();
    const checkoutId = checkoutRef.id;
    const auth = `Basic ${Buffer.from(`${process.env.PAGARME_SECRET_KEY}:`).toString('base64')}`;
    const response = await fetch('https://api.pagar.me/core/v5/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'Authorization': auth }, body: JSON.stringify({ items: [{ amount: Math.round(amount * 100), description: vipEventName, quantity: 1 }], customer: { name, email, type: 'individual', document: taxId, phones: { mobile_phone: { country_code: '55', area_code: whatsapp.substring(0,2), number: whatsapp.substring(2) } } }, payments: [{ payment_method: 'pix', pix: { expires_in: 3600 } }], closed: true, metadata: { checkoutId } }) });
    const order = await response.json();
    const pixInfo = order.charges[0].last_transaction;
    await checkoutRef.set({ id: checkoutId, vipEventName, promoterName: name, promoterEmail: email, status: 'pending', amount, quantity, gateway: 'pagarme', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, checkoutId, qrCode: pixInfo.qr_code, qrCodeUrl: pixInfo.qr_code_url };
});
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createAdminRequest = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const savePromoterToken = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const checkBackendStatus = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "IA Pausada" }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
export const sendNewsletter = functions.region("southamerica-east1").runWith({ secrets: ["BREVO_API_KEY"] }).https.onCall(async (data) => {
    if (!process.env.BREVO_API_KEY) return { success: false, message: "Brevo Key missing" };
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = data.subject;
    sendSmtpEmail.sender = { "name": "Equipe Certa", "email": "contato@equipecerta.com.br" };
    sendSmtpEmail.to = [{ "email": "test@test.com" }]; // Implementação real requer loop na audiência
    sendSmtpEmail.htmlContent = data.body;
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, message: "Enviado!" };
});
