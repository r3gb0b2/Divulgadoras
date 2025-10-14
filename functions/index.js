const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

const plans = {
    basic: { name: "Plano Básico", price: 4900 }, // Em centavos
    professional: { name: "Plano Profissional", price: 9900 }, // Em centavos
};

// Helper para buscar as credenciais do PagSeguro
const getPagSeguroConfig = async () => {
    const credsDoc = await db.collection('settings').doc('pagseguro_credentials').get();
    if (!credsDoc.exists || !credsDoc.data().accessToken) {
        throw new HttpsError('failed-precondition', 'O Access Token do PagSeguro não está configurado no sistema.');
    }
    return credsDoc.data();
};

const PAGSEGURO_API_URL = "https://api.pagseguro.com";

/**
 * Inicia o processo de checkout, criando um pedido no PagSeguro e retornando o link de pagamento.
 */
exports.initiatePagSeguroCheckout = onCall(async (request) => {
    const { planId, orgName, email, passwordB64 } = request.data;
    const plan = plans[planId];

    if (!plan || !orgName || !email || !passwordB64) {
        throw new HttpsError('invalid-argument', 'Faltam parâmetros obrigatórios (planId, orgName, email, passwordB64).');
    }

    const config = await getPagSeguroConfig();
    const referenceId = `ORG_${Date.now()}_${orgName.replace(/\s+/g, '_')}`;

    // Armazena os dados do usuário/org pendente para criação posterior
    await db.collection('pendingOrganizations').doc(referenceId).set({
        orgName,
        email,
        passwordB64,
        planId,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // IMPORTANTE: Configure esta URL no seu painel do PagSeguro para receber as notificações!
    const notificationUrl = `https://${functions.config().firebase.projectId}.web.app/handlePagSeguroNotification`;

    const orderPayload = {
        reference_id: referenceId,
        customer: {
            name: orgName,
            email: email,
        },
        items: [{
            name: plan.name,
            quantity: 1,
            unit_amount: plan.price,
        }],
        notification_urls: [functions.config().project.base_url + "/handlePagSeguroNotification"],
        charges: [{
            reference_id: referenceId,
            amount: {
                value: plan.price,
                currency: 'BRL',
            },
            payment_method: {
                type: 'CREDIT_CARD',
                capture: true,
            },
        }],
    };

    try {
        const response = await axios.post(`${PAGSEGURO_API_URL}/orders`, orderPayload, {
            headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const paymentLink = response.data.links.find(link => link.rel === 'PAY');

        if (!paymentLink) {
            throw new Error('Link de pagamento não encontrado na resposta do PagSeguro.');
        }

        return { checkoutUrl: paymentLink.href };

    } catch (error) {
        logger.error("Erro ao criar pedido no PagSeguro:", error.response ? error.response.data : error.message);
        throw new HttpsError('internal', 'Falha ao comunicar com o PagSeguro para iniciar o pagamento.');
    }
});

/**
 * Webhook para receber notificações de pagamento do PagSeguro.
 */
exports.handlePagSeguroNotification = functions.https.onRequest(async (req, res) => {
    // Apenas requisições POST são esperadas
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const notification = req.body;
    logger.info("Notificação PagSeguro Recebida:", notification);

    const { reference_id, charges } = notification;

    if (!reference_id || !charges || charges.length === 0) {
        logger.warn("Notificação inválida, sem reference_id ou charges.");
        return res.status(400).send('Invalid Notification');
    }

    // Pega o status do primeiro 'charge' que é o que importa
    const paymentStatus = charges[0].status;

    if (paymentStatus === 'PAID') {
        const pendingOrgRef = db.collection('pendingOrganizations').doc(reference_id);
        const pendingOrgDoc = await pendingOrgRef.get();

        if (pendingOrgDoc.exists && pendingOrgDoc.data().status === 'pending') {
            const { orgName, email, passwordB64, planId } = pendingOrgDoc.data();
            const password = Buffer.from(passwordB64, 'base64').toString('utf-8');

            try {
                // Cria o usuário e a organização (mesma lógica da função antiga)
                const userRecord = await admin.auth().createUser({ email, password });
                const { uid } = userRecord;

                const orgRef = await db.collection('organizations').add({
                    ownerUid: uid,
                    ownerEmail: email,
                    name: orgName,
                    planId: planId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                    isPublic: true,
                    assignedStates: [],
                });

                await db.collection('admins').doc(uid).set({
                    uid, email, role: 'admin', organizationId: orgRef.id,
                    assignedStates: [], assignedCampaigns: {},
                });

                // Atualiza o status para 'completed' para evitar reprocessamento
                await pendingOrgRef.update({ status: 'completed' });
                logger.info(`Organização ${orgName} criada com sucesso para o reference_id: ${reference_id}`);
            } catch (error) {
                logger.error(`Erro ao criar organização para reference_id ${reference_id}:`, error);
            }
        } else {
             logger.warn(`Organização pendente não encontrada ou já processada para reference_id: ${reference_id}`);
        }
    }

    return res.status(200).send('OK');
});