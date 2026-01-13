
import admin from "firebase-admin";
import functions from "firebase-functions";
import { GoogleGenAI } from "@google/genai";
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
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount } = data;
        const membershipId = `${promoterId}_${vipEventId}`;
        const asaasKey = process.env.ASAAS_API_KEY;

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
                description: `Adesão VIP: ${vipEventName}`,
                externalReference: membershipId
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await db.collection('vipMemberships').doc(membershipId).set({
                id: membershipId,
                vipEventId, vipEventName, promoterId, promoterName: name,
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: whatsapp,
                status: 'pending',
                paymentId: paymentRes.id,
                amount,
                isBenefitActive: false,
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return { success: true, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
        } catch (err) {
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
        const membershipId = `${promoterId}_${vipEventId}`;
        const asaasKey = process.env.ASAAS_API_KEY;

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
                description: `Adesão Greenlife: ${vipEventName}`,
                externalReference: membershipId
            }, asaasKey);

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET', null, asaasKey);

            await db.collection('greenlifeMemberships').doc(membershipId).set({
                id: membershipId,
                vipEventId, vipEventName, promoterId, promoterName: name,
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: whatsapp,
                status: 'pending',
                paymentId: paymentRes.id,
                amount,
                isBenefitActive: false,
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return { success: true, payload: qrCodeRes.payload, encodedImage: qrCodeRes.encodedImage };
        } catch (err) {
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Ativação Manual de Adesão Greenlife
 */
export const activateGreenlifeMembership = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const { membershipId, forceNew } = data;
        const docRef = db.collection('greenlifeMemberships').doc(membershipId);
        const snap = await docRef.get();

        if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Adesão não encontrada.');
        const membership = snap.data();

        // Se forceNew, o código atual não é invalidado na origem (é apenas sobreposto), 
        // mas idealmente marcamos o novo como usado.
        const codesRef = db.collection('greenlifeEvents').doc(membership.vipEventId).collection('availableCodes');
        const codeSnap = await codesRef.where('used', '==', false).limit(1).get();

        if (codeSnap.empty) throw new functions.https.HttpsError('failed-precondition', 'Estoque de códigos vazio.');

        const codeDoc = codeSnap.docs[0];
        const newCode = codeDoc.data().code;

        await codeDoc.ref.update({
            used: true,
            usedBy: membership.promoterEmail,
            usedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await docRef.update({
            status: 'confirmed',
            benefitCode: newCode,
            isBenefitActive: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, code: newCode };
    });

/**
 * Webhook Unificado para Pagamentos Asaas
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('Ignored');
        }

        const payment = event.payment;
        const membershipId = payment.externalReference;
        if (!membershipId) return res.status(200).send('No reference');

        try {
            // Tenta localizar em VIP ou Greenlife
            let collection = 'vipMemberships';
            let eventCollection = 'vipEvents';
            let docRef = db.collection(collection).doc(membershipId);
            let snap = await docRef.get();

            if (!snap.exists) {
                collection = 'greenlifeMemberships';
                eventCollection = 'greenlifeEvents';
                docRef = db.collection(collection).doc(membershipId);
                snap = await docRef.get();
            }

            if (!snap.exists) return res.status(404).send('Not found');
            const data = snap.data();
            if (data.status === 'confirmed') return res.status(200).send('Already done');

            // Atribuição de Código
            const codesRef = db.collection(eventCollection).doc(data.vipEventId).collection('availableCodes');
            const codeSnap = await codesRef.where('used', '==', false).limit(1).get();

            let assignedCode = "AGUARDANDO_ESTOQUE";
            let isActive = false;

            if (!codeSnap.empty) {
                const codeDoc = codeSnap.docs[0];
                assignedCode = codeDoc.data().code;
                isActive = true;
                await codeDoc.ref.update({
                    used: true,
                    usedBy: data.promoterEmail,
                    usedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            await docRef.update({
                status: 'confirmed',
                benefitCode: assignedCode,
                isBenefitActive: isActive,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).send('OK');
        } catch (err) {
            console.error("Webhook Error:", err);
            return res.status(500).send(err.message);
        }
    });

// Stubs
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "Gemini is paused." }));
export const checkBackendStatus = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onCall(async () => ({ asaasKeyPresent: !!process.env.ASAAS_API_KEY }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
