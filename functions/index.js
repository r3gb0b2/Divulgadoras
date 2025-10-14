const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/onCall");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const mercadopago = require("mercadopago");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

const plans = {
    basic: { name: "Plano Básico", price: 49.00 },
    professional: { name: "Plano Profissional", price: 99.00 },
};

// Helper para buscar as credenciais do Mercado Pago
const getMercadoPagoConfig = async () => {
    const credsDoc = await db.collection('settings').doc('mercado_pago_credentials').get();
    if (!credsDoc.exists || !credsDoc.data().accessToken) {
        throw new HttpsError('failed-precondition', 'O Access Token do Mercado Pago não está configurado no sistema.');
    }
    return credsDoc.data();
};

/**
 * Inicia o processo de checkout, criando uma preferência no Mercado Pago e retornando o link de pagamento.
 */
exports.initiateMercadoPagoCheckout = onCall(async (request) => {
    const { planId, orgName, email, passwordB64 } = request.data;
    const plan = plans[planId];

    if (!plan || !orgName || !email || !passwordB64) {
        throw new HttpsError('invalid-argument', 'Todos os campos do formulário são obrigatórios.');
    }
    
    const config = await getMercadoPagoConfig();
    mercadopago.configure({ access_token: config.accessToken });

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
    const functionRegion = "southamerica-east1";
    const notificationUrl = `https://${functionRegion}-${projectId}.cloudfunctions.net/handleMercadoPagoNotification`;
    const redirectBaseUrl = `https://${projectId}.web.app`;

    const preference = {
        items: [
            {
                title: plan.name,
                unit_price: plan.price,
                quantity: 1,
            },
        ],
        payer: {
            email: email,
        },
        back_urls: {
            success: `${redirectBaseUrl}/#/checkout-complete`,
            failure: `${redirectBaseUrl}/#/planos`,
            pending: `${redirectBaseUrl}/#/checkout-complete`,
        },
        auto_return: "approved",
        notification_url: notificationUrl,
        external_reference: referenceId,
    };

    try {
        const response = await mercadopago.preferences.create(preference);
        return { checkoutUrl: response.body.init_point };
    } catch (error) {
        logger.error("Erro ao criar preferência no Mercado Pago:", error);
        throw new HttpsError('internal', 'Falha ao comunicar com o Mercado Pago para iniciar o pagamento.');
    }
});


/**
 * Webhook para receber notificações de pagamento do Mercado Pago.
 */
exports.handleMercadoPagoNotification = functions.https.onRequest(async (req, res) => {
    logger.info("Notificação Mercado Pago Recebida, query:", req.query);

    const { topic, id } = req.query;

    // A partir da V2, o MP envia um POST com body. Por segurança, checamos ambos.
    const paymentId = id || (req.body.type === 'payment' && req.body.data && req.body.data.id);
    const notificationTopic = topic || (req.body.topic);

    if (notificationTopic !== 'payment' && req.body.action !== 'payment.updated') {
        logger.log("Notificação não é sobre pagamento, ignorando.", req.body);
        return res.status(200).send('OK');
    }

    if (!paymentId) {
        logger.warn("ID de pagamento não encontrado na notificação.", req.body);
        return res.status(400).send('Payment ID not found');
    }

    try {
        const config = await getMercadoPagoConfig();
        mercadopago.configure({ access_token: config.accessToken });

        const payment = await mercadopago.payment.findById(Number(paymentId));
        
        if (payment && payment.body && payment.body.status === 'approved' && payment.body.external_reference) {
            const referenceId = payment.body.external_reference;
            
            const pendingOrgRef = db.collection('pendingOrganizations').doc(referenceId);
            const pendingOrgDoc = await pendingOrgRef.get();

            if (pendingOrgDoc.exists && pendingOrgDoc.data().status === 'pending') {
                const { orgName, email, passwordB64, planId } = pendingOrgDoc.data();
                const password = Buffer.from(passwordB64, 'base64').toString('utf-8');

                await db.runTransaction(async (transaction) => {
                    // Previne re-processamento em caso de múltiplas notificações
                    const freshDoc = await transaction.get(pendingOrgRef);
                    if (freshDoc.data().status !== 'pending') return;

                    const userRecord = await admin.auth().createUser({ email, password });
                    const { uid } = userRecord;

                    const orgRef = db.collection('organizations').doc();
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

                    transaction.update(pendingOrgRef, { status: 'completed' });
                });

                logger.info(`Organização '${orgName}' criada com sucesso para a referência: ${referenceId}`);
            } else {
                logger.warn(`Organização pendente não encontrada ou já processada para a referência: ${referenceId}`);
            }
        }
        
        return res.status(200).send('OK');

    } catch (error) {
        logger.error("Erro no webhook do Mercado Pago:", error);
        return res.status(500).send('Internal Server Error');
    }
});