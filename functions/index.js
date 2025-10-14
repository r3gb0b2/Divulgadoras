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

    // Constrói as URLs de notificação e redirecionamento de forma dinâmica
    const projectId = process.env.GCLOUD_PROJECT;
    if (!projectId) {
        logger.error("GCLOUD_PROJECT environment variable is not set.");
        throw new HttpsError('internal', 'O ID do Projeto não foi encontrado no ambiente da função.');
    }
    const functionRegion = "southamerica-east1"; // Região definida em setGlobalOptions
    const notificationUrl = `https://${functionRegion}-${projectId}.cloudfunctions.net/handlePagSeguroNotification`;
    const redirectUrl = `https://${projectId}.web.app/checkout-complete`;

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
        notification_urls: [notificationUrl],
        redirect_url: redirectUrl,
        charges: [{
            reference_id: `CHG_${referenceId}`,
            description: `Assinatura do ${plan.name}`,
            amount: {
                value: plan.price,
                currency: 'BRL',
            },
            // IMPORTANTE: O objeto payment_method é removido daqui.
            // Isso permite que o usuário escolha o método de pagamento
            // (Cartão, PIX, Boleto) na página de checkout do PagSeguro.
        }],
    };

    try {
        const response = await axios.post(`${PAGSEGURO_API_URL}/orders`, orderPayload, {
            headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
                'x-api-version': '4.0', // Adicionar header recomendado
            },
        });

        // Encontra o link de pagamento na resposta
        const paymentLink = response.data.links.find((link) => link.rel === 'PAY');

        if (!paymentLink) {
            logger.error("Link de pagamento não encontrado na resposta do PagSeguro", response.data);
            throw new Error('Link de pagamento não encontrado na resposta do PagSeguro.');
        }

        return { checkoutUrl: paymentLink.href };

    } catch (error) {
        const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error("Erro ao criar pedido no PagSeguro:", errorDetails);
        
        let userMessage = 'Falha ao comunicar com o PagSeguro para iniciar o pagamento.';
        if (error.response && error.response.data && error.response.data.error_messages) {
            userMessage = error.response.data.error_messages.map((e) => e.description).join('; ');
        }
        
        throw new HttpsError('internal', userMessage);
    }
});

/**
 * Webhook para receber notificações de pagamento do PagSeguro.
 */
exports.handlePagSeguroNotification = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        logger.warn("Recebida requisição não-POST no webhook:", { method: req.method });
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const notification = req.body;
        logger.info("Notificação PagSeguro Recebida:", JSON.stringify(notification));

        const { reference_id, charges } = notification;

        if (!reference_id || !charges || charges.length === 0) {
            logger.warn("Notificação inválida, sem reference_id ou charges.", notification);
            return res.status(400).send('Invalid Notification');
        }

        // Verifica se existe algum 'charge' com status PAGO
        const charge = charges.find(c => c.status === 'PAID');
        if (!charge) {
            logger.info(`Nenhum charge PAGO encontrado para reference_id: ${reference_id}. Status: ${charges.map(c => c.status).join(', ')}`);
            return res.status(200).send('Notification received, but no action taken.');
        }

        const pendingOrgRef = db.collection('pendingOrganizations').doc(reference_id);
        const pendingOrgDoc = await pendingOrgRef.get();

        if (pendingOrgDoc.exists && pendingOrgDoc.data().status === 'pending') {
            const { orgName, email, passwordB64, planId } = pendingOrgDoc.data();
            const password = Buffer.from(passwordB64, 'base64').toString('utf-8');

            // Cria o usuário, organização e admin em uma transação para garantir atomicidade
            await db.runTransaction(async (transaction) => {
                const userRecord = await admin.auth().createUser({ email, password });
                const { uid } = userRecord;

                const orgRef = db.collection('organizations').doc(); // Cria uma referência com ID automático
                transaction.set(orgRef, {
                    ownerUid: uid,
                    ownerEmail: email,
                    name: orgName,
                    planId: planId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'active',
                    isPublic: true,
                    assignedStates: [],
                });

                const adminRef = db.collection('admins').doc(uid);
                transaction.set(adminRef, {
                    uid, email, role: 'admin', organizationId: orgRef.id,
                    assignedStates: [], assignedCampaigns: {},
                });

                // Atualiza o status para 'completed' para evitar reprocessamento
                transaction.update(pendingOrgRef, { status: 'completed' });
            });

            logger.info(`Organização '${orgName}' criada com sucesso para o reference_id: ${reference_id}`);
        } else {
            logger.warn(`Organização pendente não encontrada ou já processada para reference_id: ${reference_id}`);
        }

        return res.status(200).send('OK');

    } catch (error) {
        logger.error("Erro fatal no webhook do PagSeguro:", error);
        return res.status(500).send('Internal Server Error');
    }
});
