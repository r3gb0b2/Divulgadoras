
import admin from "firebase-admin";
import functions from "firebase-functions";
import { GoogleGenAI } from "@google/genai";
import { ASAAS_CONFIG } from './credentials.js';

admin.initializeApp();
const db = admin.firestore();

// Define a URL base baseada no ambiente configurado em credentials.js
const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

/**
 * Função principal para criar cobrança Pix no Asaas
 * O segredo ASAAS_API_KEY deve ser injetado via runWith
 */
export const createVipAsaasPix = functions
    .region("southamerica-east1")
    .runWith({ 
        secrets: ["ASAAS_API_KEY"], // CRÍTICO: Sem isso o process.env.ASAAS_API_KEY fica vazio no servidor
        timeoutSeconds: 30,
        memory: "256MB"
    })
    .https.onCall(async (data, context) => {
        const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount } = data;
        const membershipId = `${promoterId}_${vipEventId}`;
        
        // Recupera a chave do segredo configurado no Firebase
        const asaasKey = process.env.ASAAS_API_KEY;

        if (!asaasKey) {
            console.error("ERRO DE CONFIGURAÇÃO: ASAAS_API_KEY não encontrada nos segredos do Firebase.");
            throw new functions.https.HttpsError('failed-precondition', 'O servidor de pagamentos não está configurado corretamente.');
        }

        try {
            // Helper para requisições fetch ao Asaas
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
                
                const response = await fetch(`${ASAAS_URL}/${endpoint}`, options);
                const result = await response.json();
                
                if (!response.ok) {
                    console.error("Erro na API do Asaas:", result);
                    throw new Error(result.errors?.[0]?.description || "Erro na comunicação com Asaas");
                }
                return result;
            };

            // 1. Criar ou atualizar o Cliente no Asaas
            console.log(`[Asaas] Criando/Buscando cliente: ${email}`);
            const customerRes = await asaasFetch('customers', 'POST', {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                mobilePhone: whatsapp.replace(/\D/g, ''),
                cpfCnpj: taxId.replace(/\D/g, ''),
                notificationDisabled: true
            });

            // 2. Gerar a cobrança Pix
            console.log(`[Asaas] Gerando cobrança para cliente: ${customerRes.id}`);
            const paymentRes = await asaasFetch('payments', 'POST', {
                customer: customerRes.id,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date().toISOString().split('T')[0],
                description: `Adesão VIP: ${vipEventName}`,
                externalReference: membershipId // ID para rastreio no Webhook
            });

            // 3. Obter o payload do QR Code
            console.log(`[Asaas] Solicitando QR Code Pix: ${paymentRes.id}`);
            const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET');

            // 4. Registrar a intenção de adesão no Firestore
            const docData = {
                id: membershipId,
                vipEventId: vipEventId || "",
                vipEventName: vipEventName || "Evento VIP",
                promoterId: promoterId || "",
                promoterName: name || "",
                promoterEmail: email.toLowerCase().trim(),
                promoterWhatsapp: whatsapp,
                promoterTaxId: taxId,
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
                payload: qrCodeRes.payload, // Texto do Copia e Cola
                encodedImage: qrCodeRes.encodedImage, // Imagem em base64
                paymentId: paymentRes.id 
            };

        } catch (err) {
            console.error("Falha no processo Asaas VIP:", err.message);
            throw new functions.https.HttpsError('internal', err.message);
        }
    });

/**
 * Webhook para processamento de pagamentos confirmados
 */
export const asaasWebhook = functions
    .region("southamerica-east1")
    .runWith({ secrets: ["ASAAS_API_KEY"] })
    .https.onRequest(async (req, res) => {
        const event = req.body;
        
        // Só processamos recebimentos de pagamento
        if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
            return res.status(200).send('Ignored');
        }

        const payment = event.payment;
        const membershipId = payment.externalReference;
        
        if (!membershipId) {
            console.warn("[Webhook] Pagamento recebido sem referência externa.");
            return res.status(200).send('No reference');
        }

        try {
            const membRef = db.collection('vipMemberships').doc(membershipId);
            const membSnap = await membRef.get();

            if (!membSnap.exists) return res.status(404).send('Membership not found');
            
            const membData = membSnap.data();
            if (membData.status === 'confirmed') return res.status(200).send('Already processed');

            // Lógica de atribuição de código VIP (estoque)
            const codesRef = db.collection('vipEvents').doc(membData.vipEventId).collection('availableCodes');
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

            // Atualiza a adesão como confirmada
            await membRef.update({
                status: 'confirmed',
                benefitCode: assignedCode,
                isBenefitActive: isBenefitActive,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).send('OK');
        } catch (err) {
            console.error("[Webhook Error]:", err.message);
            return res.status(500).send(err.message);
        }
    });

// Funções Stubs para manter compatibilidade
export const askGemini = functions.region("southamerica-east1").https.onCall(async () => ({ text: "Gemini is paused." }));
export const checkBackendStatus = functions.region("southamerica-east1").runWith({ secrets: ["ASAAS_API_KEY"] }).https.onCall(async () => ({ asaasKeyPresent: !!process.env.ASAAS_API_KEY }));
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async () => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
