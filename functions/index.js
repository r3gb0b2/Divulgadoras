
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
 * Envio de E-mail via Brevo
 */
const sendVipTicketEmail = async (toEmail, toName, eventName, ticketCode, apiKey, isGreenlife = false) => {
    if (!apiKey) {
        console.warn("Pulo no envio de e-mail: BREVO_API_KEY não configurada.");
        return;
    }

    try {
        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        const brandName = isGreenlife ? "Greenlife Academias" : "Equipe Certa VIP";
        const portalUrl = isGreenlife 
            ? `https://divulgadoras.vercel.app/#/alunosgreenlife/status?email=${encodeURIComponent(toEmail)}`
            : `https://divulgadoras.vercel.app/#/clubvip/status?email=${encodeURIComponent(toEmail)}`;

        sendSmtpEmail.subject = `Seu Acesso Confirmado! 🎫 - ${eventName}`;
        sendSmtpEmail.sender = { "name": brandName, "email": "contato@equipecerta.app" };
        sendSmtpEmail.to = [{ "email": toEmail, "name": toName }];
        
        sendSmtpEmail.htmlContent = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border-radius: 30px; border: 1px solid #333;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <div style="background: ${isGreenlife ? '#22c55e' : '#7e39d5'}; width: 60px; height: 60px; border-radius: 20px; display: inline-block; line-height: 60px; font-size: 30px; margin-bottom: 15px;">🎫</div>
                    <h1 style="color: #fff; margin: 0; font-size: 26px; text-transform: uppercase; letter-spacing: -1px;">Pagamento Confirmado!</h1>
                    <p style="color: ${isGreenlife ? '#22c55e' : '#7e39d5'}; font-size: 11px; margin-top: 5px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">${brandName}</p>
                </div>
                
                <div style="background: #111; padding: 30px; border: 1px solid #222; border-radius: 25px; text-align: center; margin-bottom: 30px;">
                    <p style="font-size: 13px; color: #888; margin-bottom: 5px; text-transform: uppercase;">Evento Garantido</p>
                    <h2 style="margin: 0; font-size: 22px; color: #fff;">${eventName}</h2>
                    
                    <div style="margin: 30px 0; padding: 25px; background: ${isGreenlife ? '#22c55e' : '#7e39d5'}; border-radius: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.2);">
                        <p style="font-size: 11px; color: #eee; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Seu Código de Acesso Único</p>
                        <h3 style="font-family: 'Courier New', monospace; font-size: 34px; margin: 0; letter-spacing: 8px; color: #fff; font-weight: 900;">${ticketCode}</h3>
                    </div>

                    <p style="font-size: 12px; color: #666; line-height: 1.6;">Este código é pessoal e intransferível. Apresente-o na entrada para validar sua participação.</p>
                </div>

                <div style="text-align: center;">
                    <a href="${portalUrl}" 
                       style="display: inline-block; background: #fff; color: #000; padding: 18px 40px; border-radius: 15px; text-decoration: none; font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                        ABRIR MEU INGRESSO DIGITAL
                    </a>
                    <p style="color: #444; font-size: 10px; margin-top: 25px;">Equipe Certa © ${new Date().getFullYear()} - Sistema de Gestão de Eventos</p>
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
 * Função para Ativar ou Trocar Código de Membro VIP
 */
export const activateVipMembership = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["BREVO_API_KEY"] })
    .https.onCall(async (data, context) => {
        const { membershipId, forceNew } = data;
        try {
            const membershipRef = db.collection('vipMemberships').doc(membershipId);
            const membSnap = await membershipRef.get();
            if (!membSnap.exists) throw new functions.https.HttpsError('not-found', 'Adesão não encontrada.');
            
            const membData = membSnap.data();
            const promoterEmail = membData.promoterEmail || 'email_nao_identificado';
            
            if (membData.benefitCode && !forceNew && membData.status === 'confirmed') {
                return { success: true, code: membData.benefitCode };
            }

            const codesRef = db.collection('vipEvents').doc(membData.vipEventId).collection('availableCodes');
            const codeSnap = await codesRef.where('used', '==', false).limit(1).get();

            if (codeSnap.empty) throw new functions.https.HttpsError('resource-exhausted', 'Estoque de códigos vazio.');

            const newCodeDoc = codeSnap.docs[0];
            const newCode = newCodeDoc.data().code;
            const batch = db.batch();

            batch.update(newCodeDoc.ref, { used: true, usedBy: promoterEmail, membershipId: membershipId, usedAt: admin.firestore.FieldValue.serverTimestamp() });
            batch.update(membershipRef, { status: 'confirmed', benefitCode: newCode, isBenefitActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            await batch.commit();

            if (process.env.BREVO_API_KEY) {
                await sendVipTicketEmail(promoterEmail, membData.promoterName, membData.vipEventName, newCode, process.env.BREVO_API_KEY, false);
            }
            return { success: true, code: newCode };
        } catch (err) {
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Função para Ativar ou Trocar Código Greenlife
 */
export const activateGreenlifeMembership = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["BREVO_API_KEY"] })
    .https.onCall(async (data, context) => {
        const { membershipId, forceNew } = data;
        try {
            const membershipRef = db.collection('greenlifeMemberships').doc(membershipId);
            const membSnap = await membershipRef.get();
            if (!membSnap.exists) throw new Error('Adesão não encontrada.');
            
            const membData = membSnap.data();
            const promoterEmail = membData.promoterEmail || 'aluno_nao_identificado';

            const codesRef = db.collection('greenlifeEvents').doc(membData.vipEventId).collection('availableCodes');
            const codeSnap = await codesRef.where('used', '==', false).limit(1).get();

            if (codeSnap.empty) throw new Error('Estoque vazio.');

            const newCodeDoc = codeSnap.docs[0];
            const newCode = newCodeDoc.data().code;
            const batch = db.batch();

            batch.update(newCodeDoc.ref, { used: true, usedBy: promoterEmail, membershipId: membershipId, usedAt: admin.firestore.FieldValue.serverTimestamp() });
            batch.update(membershipRef, { status: 'confirmed', benefitCode: newCode, isBenefitActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            await batch.commit();

            if (process.env.BREVO_API_KEY) {
                await sendVipTicketEmail(promoterEmail, membData.promoterName, membData.vipEventName, newCode, process.env.BREVO_API_KEY, true);
            }
            return { success: true, code: newCode };
        } catch (err) {
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook Pagar.me - Polimórfico (VIP e Greenlife)
 */
export const pagarmeWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["BREVO_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        if (event.type !== 'order.paid') return res.status(200).send('Ignored');

        const metadata = event.data?.metadata;
        const checkoutId = metadata?.checkoutId;
        const type = metadata?.type || 'vip'; // 'vip' ou 'greenlife'
        
        if (!checkoutId) return res.status(200).send('No ID');

        try {
            const checkoutRef = db.collection('checkouts').doc(checkoutId);
            const snap = await checkoutRef.get();
            if (!snap.exists || snap.data().status === 'confirmed') return res.status(200).send('Done');

            const checkoutData = snap.data();
            const qty = checkoutData.quantity || 1;
            const batch = db.batch();

            // Configuração dinâmica baseada no tipo
            const eventColl = type === 'greenlife' ? 'greenlifeEvents' : 'vipEvents';
            const memberColl = type === 'greenlife' ? 'greenlifeMemberships' : 'vipMemberships';
            const isGreenlife = type === 'greenlife';

            const codesRef = db.collection(eventColl).doc(checkoutData.vipEventId).collection('availableCodes');
            const codesSnap = await codesRef.where('used', '==', false).limit(qty).get();
            
            for (let i = 0; i < qty; i++) {
                const membershipId = `${checkoutId}_${i}`;
                const codeDoc = codesSnap.docs[i];
                const assignedCode = codeDoc ? codeDoc.data().code : "AGUARDANDO_ESTOQUE";

                if (codeDoc) {
                    batch.update(codeDoc.ref, { 
                        used: true, 
                        usedBy: checkoutData.promoterEmail, 
                        membershipId 
                    });
                }

                batch.set(db.collection(memberColl).doc(membershipId), {
                    id: membershipId,
                    vipEventId: checkoutData.vipEventId,
                    vipEventName: checkoutData.vipEventName,
                    promoterName: checkoutData.promoterName,
                    promoterEmail: checkoutData.promoterEmail,
                    status: 'confirmed',
                    benefitCode: assignedCode,
                    isBenefitActive: !!codeDoc,
                    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                if (codeDoc && process.env.BREVO_API_KEY) {
                    await sendVipTicketEmail(checkoutData.promoterEmail, checkoutData.promoterName, checkoutData.vipEventName, assignedCode, process.env.BREVO_API_KEY, isGreenlife);
                }
            }

            batch.update(checkoutRef, { status: 'confirmed', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            await batch.commit();
            return res.status(200).send('OK');
        } catch (err) {
            return res.status(500).send(err.message);
        }
    });

/**
 * Cria Pix Pagar.me para Greenlife
 */
export const createGreenlifePagarMePix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["PAGARME_SECRET_KEY"] })
    .https.onCall(async (data) => {
        try {
            const { vipEventId, vipEventName, email, name, whatsapp, taxId, amount, quantity = 1 } = data;
            const checkoutRef = db.collection('checkouts').doc();
            const checkoutId = checkoutRef.id;

            const authHeader = `Basic ${Buffer.from(`${process.env.PAGARME_SECRET_KEY}:`).toString('base64')}`;
            
            const payload = {
                items: [{ amount: Math.round(amount * 100), description: `GREENLIFE: ${vipEventName.substring(0,40)}`, quantity: 1 }],
                customer: { 
                    name: name.trim(), email: email.toLowerCase().trim(), type: 'individual', document: taxId.replace(/\D/g, ''),
                    phones: { mobile_phone: { country_code: '55', area_code: whatsapp.replace(/\D/g, '').substring(0,2), number: whatsapp.replace(/\D/g, '').substring(2) } }
                },
                payments: [{ payment_method: 'pix', pix: { expires_in: 3600 } }],
                closed: true, 
                metadata: { checkoutId, type: 'greenlife' }
            };

            const response = await fetch('https://api.pagar.me/core/v5/orders', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'Authorization': authHeader },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Erro API PagarMe");

            const pix = result.charges?.[0]?.last_transaction;
            await checkoutRef.set({
                id: checkoutId, type: 'greenlife', vipEventId, vipEventName, promoterName: name, promoterEmail: email,
                amount, quantity, gateway: 'pagarme', status: 'pending', orderId: result.id, createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, checkoutId, qrCode: pix.qr_code, qrCodeUrl: pix.qr_code_url };
        } catch (e) {
            throw new functions.https.HttpsError('internal', e.message);
        }
    });

/**
 * Cria Pix no Pagar.me para VIP
 */
export const createVipPagarMePix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["PAGARME_SECRET_KEY"] })
    .https.onCall(async (data) => {
        try {
            const { vipEventId, vipEventName, email, name, whatsapp, taxId, amount, quantity } = data;
            const checkoutRef = db.collection('checkouts').doc();
            const checkoutId = checkoutRef.id;

            const authHeader = `Basic ${Buffer.from(`${process.env.PAGARME_SECRET_KEY}:`).toString('base64')}`;
            
            const payload = {
                items: [{ amount: Math.round(amount * 100), description: `VIP: ${vipEventName.substring(0,40)}`, quantity: 1 }],
                customer: { 
                    name: name.trim(), email: email.toLowerCase().trim(), type: 'individual', document: taxId.replace(/\D/g, ''),
                    phones: { mobile_phone: { country_code: '55', area_code: whatsapp.replace(/\D/g, '').substring(0,2), number: whatsapp.replace(/\D/g, '').substring(2) } }
                },
                payments: [{ payment_method: 'pix', pix: { expires_in: 3600 } }],
                closed: true, 
                metadata: { checkoutId, type: 'vip' }
            };

            const response = await fetch('https://api.pagar.me/core/v5/orders', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'Authorization': authHeader },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Erro API PagarMe");

            const pix = result.charges?.[0]?.last_transaction;
            await checkoutRef.set({
                id: checkoutId, type: 'vip', vipEventId, vipEventName, promoterName: name, promoterEmail: email,
                amount, quantity, gateway: 'pagarme', status: 'pending', orderId: result.id, createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, checkoutId, qrCode: pix.qr_code, qrCodeUrl: pix.qr_code_url };
        } catch (e) {
            throw new functions.https.HttpsError('internal', e.message);
        }
    });

// Stubs e auxiliares
export const createVipAsaasPix = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onCall(async () => ({ success: true }));
export const asaasWebhook = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY", "BREVO_API_KEY"] }).https.onRequest(async (req, res) => res.status(200).send('OK'));
export const checkBackendStatus = functions.region("southamerica-east1").https.onCall(async () => ({ asaasKeyConfigured: !!process.env.ASAAS_API_KEY, pagarmeKeyConfigured: !!process.env.PAGARME_SECRET_KEY, brevoKeyConfigured: !!process.env.BREVO_API_KEY }));
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createAdminRequest = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const savePromoterToken = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "IA Pausada" }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
export const sendNewsletter = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
