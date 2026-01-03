
import admin from "firebase-admin";
import functions from "firebase-functions";

admin.initializeApp();
const db = admin.firestore();

// Helper para chamadas Asaas
const asaasFetch = async (endpoint, options = {}) => {
    const config = functions.config();
    const apiKey = config.asaas?.key; // Setar via: firebase functions:config:set asaas.key="SUA_CHAVE"
    const baseUrl = config.asaas?.env === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

    const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
            'access_token': apiKey,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    return res.json();
};

/**
 * Gera um Pix via Asaas
 */
export const createVipAsaasPix = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { email, name, whatsapp, amount, vipEventId, promoterId, vipEventName } = data;

    try {
        // 1. Criar ou buscar cliente
        const customerRes = await asaasFetch('/customers', {
            method: 'POST',
            body: JSON.stringify({
                name,
                email,
                mobilePhone: whatsapp,
                externalReference: promoterId
            })
        });

        const customerId = customerRes.id;
        if (!customerId) throw new Error("Falha ao registrar cliente no Asaas: " + JSON.stringify(customerRes));

        // 2. Criar Cobrança Pix
        const paymentRes = await asaasFetch('/payments', {
            method: 'POST',
            body: JSON.stringify({
                customer: customerId,
                billingType: 'PIX',
                value: amount,
                dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // 1 dia
                description: `Adesão VIP: ${vipEventName}`,
                externalReference: `${promoterId}_${vipEventId}`
            })
        });

        const paymentId = paymentRes.id;
        if (!paymentId) throw new Error("Falha ao gerar cobrança: " + JSON.stringify(paymentRes));

        // 3. Obter QR Code e Copia e Cola
        const pixRes = await asaasFetch(`/payments/${paymentId}/pixQrCode`);

        // 4. Registrar no Firebase
        const membershipId = `${promoterId}_${vipEventId}`;
        await db.collection("vipMemberships").doc(membershipId).set({
            asaasPaymentId: paymentId,
            status: 'pending',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            paymentId,
            payload: pixRes.payload, // Código copia e cola
            encodedImage: pixRes.encodedImage, // QR Code em Base64
            expirationDate: pixRes.expirationDate
        };

    } catch (e) {
        console.error("ERRO ASAAS:", e);
        throw new functions.https.HttpsError('internal', e.message);
    }
});

/**
 * Webhook Asaas para confirmar pagamento
 */
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const body = req.body;
    
    // Validar token de segurança do webhook (opcional mas recomendado)
    // const authToken = req.headers['asaas-access-token'];

    if (body.event === 'PAYMENT_CONFIRMED' || body.event === 'PAYMENT_RECEIVED') {
        const payment = body.payment;
        const externalRef = payment.externalReference; // "promoterId_eventId"
        
        if (externalRef) {
            const [promoterId, vipEventId] = externalRef.split('_');
            const membershipId = externalRef;

            const batch = db.batch();
            
            batch.update(db.collection("vipMemberships").doc(membershipId), {
                status: 'confirmed',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            batch.update(db.collection("promoters").doc(promoterId), {
                emocoesStatus: 'confirmed',
                statusChangedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await batch.commit();
        }
    }

    res.json({ received: true });
});
