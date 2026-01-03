
import admin from "firebase-admin";
import functions from "firebase-functions";
// Importação estática (corrige o erro ERR_REQUIRE_ASYNC_MODULE)
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// Helper para chamadas Asaas
const asaasFetch = async (endpoint, options = {}) => {
    // Busca no arquivo credentials.js primeiro, depois no config do Firebase como backup
    const config = functions.config();
    const apiKey = ASAAS_CONFIG?.key || config.asaas?.key;
    const env = ASAAS_CONFIG?.env || config.asaas?.env || 'sandbox';

    if (!apiKey || apiKey.includes('SUA_CHAVE_AQUI')) {
        console.error("ERRO: API Key não encontrada no credentials.js ou formatada incorretamente.");
        throw new Error("API Key do Asaas não configurada. Edite o arquivo functions/credentials.js");
    }

    const baseUrl = env === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

    console.log(`Iniciando chamada Asaas [${env}]: ${endpoint}`);

    const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
            'access_token': apiKey,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await res.json();
    
    if (data.errors) {
        console.error("Erro retornado pelo Asaas:", JSON.stringify(data.errors));
        throw new Error(data.errors[0].description);
    }

    return data;
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

        // 3. Obter QR Code e Copia e Cola
        const pixRes = await asaasFetch(`/payments/${paymentId}/pixQrCode`);

        // 4. Registrar no Firebase
        const membershipId = `${promoterId}_${vipEventId}`;
        await db.collection("vipMemberships").doc(membershipId).set({
            asaasPaymentId: paymentId,
            status: 'pending',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            promoterId,
            promoterEmail: email,
            promoterName: name,
            vipEventId,
            vipEventName,
            amount
        }, { merge: true });

        return {
            paymentId,
            payload: pixRes.payload,
            encodedImage: pixRes.encodedImage,
            expirationDate: pixRes.expirationDate
        };

    } catch (e) {
        console.error("FALHA NA FUNÇÃO:", e.message);
        throw new functions.https.HttpsError('internal', e.message);
    }
});

/**
 * Webhook Asaas para confirmar pagamento
 */
export const asaasWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const body = req.body;

    if (body.event === 'PAYMENT_CONFIRMED' || body.event === 'PAYMENT_RECEIVED') {
        const payment = body.payment;
        const externalRef = payment.externalReference;
        
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
            console.log(`Pagamento confirmado para: ${membershipId}`);
        }
    }

    res.status(200).send('OK');
});
