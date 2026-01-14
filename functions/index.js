
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

export const createAdminRequest = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const { name, email, phone, password } = data;
        const emailLower = email.toLowerCase().trim();
        if (emailLower.endsWith('.con') || emailLower.endsWith('.co')) {
            throw new functions.https.HttpsError('invalid-argument', 'O e-mail parece estar errado (.con/.co). Use .com');
        }
        try {
            const userRecord = await admin.auth().createUser({ email: emailLower, password, displayName: name });
            await db.collection('adminApplications').doc(userRecord.uid).set({
                id: userRecord.uid, name: name.trim(), email: emailLower, phone: phone || '', status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, uid: userRecord.uid };
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') throw new functions.https.HttpsError('already-exists', 'E-mail em uso.');
            throw new functions.https.HttpsError('internal', error.message);
        }
    });

export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount, quantity } = data;
        const qty = quantity || 1;
        const membershipId = `${promoterId}_${vipEventId}`;
        const asaasKey = process.env.ASAAS_API_KEY;

        try {
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(), email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''), cpfCnpj: taxId.replace(/\D/g, ''), notificationDisabled: true
            }, asaasKey);

            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id, billingType: 'PIX', value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `${qty}x Ingressos VIP: ${vipEventName}`,
                externalReference: membershipId
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            // Salva a intenção de compra com a quantidade
            await db.collection('vipMemberships').doc(membershipId).set({
                id: membershipId, vipEventId, vipEventName, promoterId, promoterName: name,
                promoterEmail: email.toLowerCase().trim(), status: 'pending',
                amount, quantity: qty, submittedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return { success: true, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
        } catch (err) {
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') return res.status(200).send('Ignored');

        const membershipId = event.payment.externalReference;
        if (!membershipId) return res.status(200).send('No reference');

        try {
            const pendingRef = db.collection('vipMemberships').doc(membershipId);
            const pendingSnap = await pendingRef.get();
            if (!pendingSnap.exists) return res.status(404).send('Not found');

            const data = pendingSnap.data();
            const qty = data.quantity || 1;

            // Gera N ingressos independentes
            for (let i = 0; i < qty; i++) {
                const finalId = `${membershipId}_${i}`;
                const codesRef = db.collection('vipEvents').doc(data.vipEventId).collection('availableCodes');
                const codeSnap = await codesRef.where('used', '==', false).limit(1).get();

                let assignedCode = "AGUARDANDO_ESTOQUE";
                let isActive = false;

                if (!codeSnap.empty) {
                    const codeDoc = codeSnap.docs[0];
                    assignedCode = codeDoc.data().code;
                    isActive = true;
                    await codeDoc.ref.update({ used: true, usedBy: data.promoterEmail, usedAt: admin.firestore.FieldValue.serverTimestamp() });
                }

                await db.collection('vipMemberships').doc(finalId).set({
                    ...data, id: finalId, status: 'confirmed', benefitCode: assignedCode,
                    isBenefitActive: isActive, updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Remove a intenção de compra original
            await pendingRef.delete();
            return res.status(200).send('OK');
        } catch (err) {
            console.error("Webhook Error:", err);
            return res.status(500).send(err.message);
        }
    });

// Stubs permanecem iguais...
export const createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const savePromoterToken = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const activateGreenlifeMembership = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const checkBackendStatus = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "Gemini is paused." }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
