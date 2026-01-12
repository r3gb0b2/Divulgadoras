
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from './credentials.js';

admin.initializeApp();
const db = admin.firestore();

const ASAAS_URL = ASAAS_CONFIG.env === 'production' 
    ? 'https://www.asaas.com/api/v3' 
    : 'https://sandbox.asaas.com/api/v3';

/**
 * Helper para chamadas API Asaas com tratamento de erro robusto
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
    
    try {
        const res = await fetch(`${ASAAS_URL}/${endpoint}`, options);
        const data = await res.json();

        if (!res.ok) {
            console.error(`[Asaas API Error] ${method} ${endpoint}:`, JSON.stringify(data));
            const errorMsg = data.errors?.[0]?.description || "Erro na comunicação com Asaas";
            throw new Error(errorMsg);
        }

        return data;
    } catch (err) {
        console.error(`[Asaas Fetch Exception] ${endpoint}:`, err.message);
        throw err;
    }
};

/**
 * Lógica Central de Criação de Cobrança Pix (Reutilizável)
 */
const processAsaasPixRequest = async (data, collectionName) => {
    const { vipEventId, vipEventName, promoterId, email, name, whatsapp, taxId, amount } = data;
    
    // membershipId format: [promoterId]_[eventId]
    const membershipId = `${promoterId}_${vipEventId}`;

    console.log(`[Asaas] Iniciando Pix para ${email} no evento ${vipEventName}`);

    // 1. Criar ou atualizar cliente no Asaas
    const customerRes = await asaasFetch('customers', 'POST', {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        mobilePhone: whatsapp.replace(/\D/g, ''),
        cpfCnpj: taxId.replace(/\D/g, '')
    });

    if (!customerRes.id) throw new Error("Falha ao criar cliente no Asaas.");

    // 2. Criar cobrança PIX
    const paymentRes = await asaasFetch('payments', 'POST', {
        customer: customerRes.id,
        billingType: 'PIX',
        value: amount,
        dueDate: new Date().toISOString().split('T')[0],
        description: `Adesão VIP: ${vipEventName}`,
        externalReference: membershipId 
    });

    if (!paymentRes.id) throw new Error("Falha ao gerar cobrança no Asaas.");

    // 3. Obter QR Code e Imagem
    const qrCodeRes = await asaasFetch(`payments/${paymentRes.id}/pixQrCode`, 'GET');

    // 4. Salvar registro pendente no Firestore (Limpando undefineds)
    const docData = {
        id: membershipId,
        vipEventId: vipEventId || "",
        vipEventName: vipEventName || "Evento",
        promoterId: promoterId || "",
        promoterName: name || "",
        promoterEmail: email.toLowerCase().trim(),
        promoterWhatsapp: whatsapp || "",
        status: 'pending',
        paymentId: paymentRes.id, // Garantido pelo check acima
        amount: amount || 0,
        isBenefitActive: false,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection(collectionName).doc(membershipId).set(docData, { merge: true });

    return { 
        success: true, 
        payload: qrCodeRes.payload, 
        encodedImage: qrCodeRes.encodedImage,
        paymentId: paymentRes.id 
    };
};

/**
 * Gera Cobrança Pix para Club VIP
 */
export const createVipAsaasPix = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    try {
        return await processAsaasPixRequest(data, 'vipMemberships');
    } catch (err) {
        throw new functions.https.HttpsError('internal', err.message);
    }
});

/**
 * Gera Cobrança Pix para Greenlife
 */
export const createGreenlifeAsaasPix = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    try {
        return await processAsaasPixRequest(data, 'greenlifeMemberships');
    } catch (err) {
        throw new functions.https.HttpsError('internal', err.message);
    }
});

/**
 * Webhook do Asaas - Recebe confirmação de pagamento (Unificado)
 */
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const event = req.body;
    
    console.log(`[Asaas Webhook] Evento recebido: ${event.event}`);

    if (event.event !== 'PAYMENT_RECEIVED' && event.event !== 'PAYMENT_CONFIRMED') {
        return res.status(200).send('Ignored');
    }

    const payment = event.payment;
    const membershipId = payment.externalReference;

    if (!membershipId) return res.status(200).send('No reference');

    try {
        // Tenta encontrar em VIP ou Greenlife
        let collectionName = 'vipMemberships';
        let membRef = db.collection(collectionName).doc(membershipId);
        let membSnap = await membRef.get();

        if (!membSnap.exists) {
            collectionName = 'greenlifeMemberships';
            membRef = db.collection(collectionName).doc(membershipId);
            membSnap = await membRef.get();
        }

        if (!membSnap.exists) {
            console.error(`[Asaas Webhook] Referência ${membershipId} não encontrada em nenhuma coleção.`);
            return res.status(404).send('Not found');
        }

        const membData = membSnap.data();
        if (membData.status === 'confirmed') return res.status(200).send('Already processed');

        // --- LÓGICA DE ENTREGA DE CÓDIGO ---
        // Define qual coleção de eventos usar
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

        // Atualiza a adesão
        await membRef.update({
            status: 'confirmed',
            benefitCode: assignedCode,
            isBenefitActive: isBenefitActive,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Se for VIP, atualiza também o perfil da divulgadora (opcional, dependendo do seu modelo)
        if (collectionName === 'vipMemberships') {
            await db.collection('promoters').doc(membData.promoterId).update({
                emocoesStatus: 'confirmed',
                emocoesBenefitCode: assignedCode,
                emocoesBenefitActive: isBenefitActive
            }).catch(() => console.log("Perfil não encontrado para atualização de status VIP"));
        }

        console.log(`[Asaas Webhook] Pagamento OK! Código ${assignedCode} entregue para ${membData.promoterEmail}`);
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
