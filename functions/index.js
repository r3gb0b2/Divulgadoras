
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from './credentials.js';

admin.initializeApp();
const db = admin.firestore();

const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

/**
 * Helper para chamadas API Asaas
 */
const asaasFetch = async (endpoint, method = 'GET', body = null) => {
    const options = {
        method,
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'access_token': ASAAS_CONFIG.key
        }
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${ASAAS_URL}/${endpoint}`, options);
    return await res.json();
};

/**
 * Gera Cobrança Pix no Asaas para Club VIP
 */
export const createVipAsaasPix = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount } = data;
    const membershipId = `${promoterId}_${vipEventId}`;

    try {
        // 1. Criar ou atualizar cliente no Asaas
        const customerRes = await asaasFetch('customers', 'POST', {
            name, email, mobilePhone: whatsapp, cpfCnpj: taxId
        });
        const customerId = customerRes.id;

        // 2. Criar cobrança PIX
        const paymentRes = await asaasFetch('payments', 'POST', {
            customer: customerId,
            billingType: 'PIX',
            value: amount,
            dueDate: new Date().toISOString().split('T')[0],
            description: `Adesão VIP: ${vipEventName}`,
            externalReference: membershipId // Crucial para o webhook se localizar
        });

        // 3. Obter QR Code
        const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET');

        // 4. Salvar registro pendente no Firestore
        await db.collection('vipMemberships').doc(membershipId).set({
            id: membershipId,
            vipEventId,
            vipEventName,
            promoterId,
            promoterName: name,
            promoterEmail: email.toLowerCase().trim(),
            promoterWhatsapp: whatsapp,
            status: 'pending',
            paymentId: paymentRes.id,
            amount: amount,
            isBenefitActive: false,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { 
            success: true, 
            payload: qrCodeRes.payload, 
            encodedImage: qrCodeRes.encodedImage,
            paymentId: paymentRes.id 
        };
    } catch (err) {
        console.error("Erro ao gerar Pix Asaas:", err);
        throw new functions.https.HttpsError('internal', err.message);
    }
});

/**
 * Webhook do Asaas - Recebe confirmação de pagamento
 */
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const event = req.body;
    
    // Ignora eventos que não sejam de pagamento confirmado
    if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
        return res.status(200).send('Event ignored');
    }

    const payment = event.payment;
    const membershipId = payment.externalReference; // Recupera o ID que salvamos na criação

    if (!membershipId) return res.status(200).send('No reference');

    try {
        const membRef = db.collection('vipMemberships').doc(membershipId);
        const membSnap = await membRef.get();

        if (!membSnap.exists) return res.status(404).send('Membership not found');
        const membData = membSnap.data();

        if (membData.status === 'confirmed') return res.status(200).send('Already confirmed');

        // --- LÓGICA DE ENTREGA DE CÓDIGO ---
        // Busca um código disponível no estoque do evento
        const codesRef = db.collection('vipEvents').doc(membData.vipEventId).collection('availableCodes');
        const availableCodeSnap = await codesRef.where('used', '==', false).limit(1).get();

        let assignedCode = "AGUARDANDO_ESTOQUE";
        let isBenefitActive = false;

        if (!availableCodeSnap.empty) {
            const codeDoc = availableCodeSnap.docs[0];
            assignedCode = codeDoc.data().code;
            isBenefitActive = true;

            // Marca o código como usado
            await codeDoc.ref.update({
                used: true,
                usedBy: membData.promoterEmail,
                usedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // Atualiza a adesão para CONFIRMADO
        await membRef.update({
            status: 'confirmed',
            benefitCode: assignedCode,
            isBenefitActive: isBenefitActive,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Atualiza o status no perfil da divulgadora para facilitar busca
        await db.collection('promoters').doc(membData.promoterId).update({
            emocoesStatus: 'confirmed',
            emocoesBenefitCode: assignedCode,
            emocoesBenefitActive: isBenefitActive
        });

        console.log(`[Asaas] Pagamento confirmado e código ${assignedCode} entregue para ${membData.promoterEmail}`);
        return res.status(200).send('OK');

    } catch (err) {
        console.error("[Asaas Webhook Error]:", err);
        return res.status(500).send(err.message);
    }
});

// Outras funções existentes...
export const sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data) => ({ success: true }));
export const testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data) => ({ success: true }));
export const sendSmartWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data) => ({ success: true }));
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => res.status(200).send('OK'));
