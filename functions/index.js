
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
 * Função de Diagnóstico de Segredos (Super Admin)
 */
export const checkBackendStatus = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["API_KEY", "ASAAS_API_KEY"] }) // Habilita acesso aos segredos
    .https.onCall(async (data, context) => {
        return {
            geminiKeyConfigured: !!process.env.API_KEY,
            asaasKeyConfigured: !!process.env.ASAAS_API_KEY,
            timestamp: new Date().toISOString()
        };
    });

/**
 * Função de Inteligência Artificial (Gemini)
 */
export const askGemini = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["API_KEY"] }) // Habilita acesso ao segredo
    .https.onCall(async (data, context) => {
        const { prompt } = data;
        if (!prompt) throw new functions.https.HttpsError('invalid-argument', 'O prompt é obrigatório.');

        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new functions.https.HttpsError('failed-precondition', 'Chave API_KEY não vinculada à função.');
        }

        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            });

            return { text: response.text };
        } catch (err) {
            console.error("Gemini Failure:", err.message);
            throw new functions.https.HttpsError('internal', `Erro na IA: ${err.message}`);
        }
    });

/**
 * Gera Cobrança Pix para Club VIP (Asaas)
 */
export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] }) // Habilita acesso ao segredo
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount } = data;
        const membershipId = `${promoterId}_${vipEventId}`;
        const asaasKey = process.env.ASAAS_API_KEY;

        if (!asaasKey) {
            throw new functions.https.HttpsError('failed-precondition', 'Chave ASAAS_API_KEY não vinculada.');
        }

        try {
            const asaasFetch = async (endpoint, method = 'GET', body = null) => {
                const options = {
                    method,
                    headers: {
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'access_token': asaasKey
                    }
                };
                if (body) options.body = JSON.stringify(body);
                const res = await fetch(`${ASAAS_URL}/${endpoint}`, options);
                const result = await res.json();
                if (!res.ok) throw new Error(result.errors?.[0]?.description || "Erro Asaas");
                return result;
            };

            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''),
                cpfCnpj: taxId.replace(/\D/g, '')
            });

            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `Adesão VIP: ${vipEventName}`,
                externalReference: membershipId 
            });

            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET');

            const docData = {
                id: membershipId,
                vipEventId: vipEventId || "",
                vipEventName: vipEventName || "Evento",
                promoterId: promoterId || "",
                promoterName: name || "",
                promoterEmail: email.toLowerCase().trim(),
                status: 'pending',
                paymentId: paymentRes.id,
                amount: amount || 0,
                isBenefitActive: false,
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('vipMemberships').doc(membershipId).set(docData, { merge: true });

            return { 
                success: true, 
                payload: qrCodeRes.payload, 
                encodedImage: qrCodeRes.encodedImage,
                paymentId: paymentRes.id 
            };
        } catch (err) {
            console.error("Erro createVipAsaasPix:", err.message);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook do Asaas
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
            let collectionName = 'vipMemberships';
            let membRef = db.collection(collectionName).doc(membershipId);
            let membSnap = await membRef.get();

            if (!membSnap.exists) {
                collectionName = 'greenlifeMemberships';
                membRef = db.collection(collectionName).doc(membershipId);
                membSnap = await membRef.get();
            }

            if (!membSnap.exists) return res.status(404).send('Not found');
            const membData = membSnap.data();
            if (membData.status === 'confirmed') return res.status(200).send('Processed');

            const eventCollection = collectionName === 'vipMemberships' ? 'vipEvents' : 'greenlifeEvents';
            const codesRef = db.collection(eventCollection).doc(membData.vipEventId).collection('availableCodes');
            const availableCodeSnap = await codesRef.where('used', '==', false).limit(1).get();

            let assignedCode = "AGUARDANDO_ESTOQUE";
            let isBenefitActive = false;

            if (!availableCodeSnap.empty) {
                const codeDoc = availableCodeSnap.docs[0];
                assignedCode = codeDoc.data().code;
                isBenefitActive = true;
                await codeDoc.ref.update({
                    used: true,
                    usedBy: membData.promoterEmail,
                    usedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            await membRef.update({
                status: 'confirmed',
                benefitCode: assignedCode,
                isBenefitActive: isBenefitActive,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).send('OK');
        } catch (err) {
            console.error("Webhook Error:", err.message);
            return res.status(500).send(err.message);
        }
    });

// Stubs
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
