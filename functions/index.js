const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/onCall");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

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
 * Etapa 1: Cria a conta de usuário no Firebase Auth e a organização no Firestore com status 'pending_payment'.
 * Esta função é chamada antes de qualquer interação com o Mercado Pago.
 */
exports.createPendingOrganization = onCall({ allow: "unauthenticated" }, async (request) => {
    const { orgName, email, password, planId } = request.data;
    const plan = plans[planId];
    
    if (!plan || !orgName || !email || !password) {
        throw new HttpsError('invalid-argument', 'Todos os campos são obrigatórios.');
    }
    if (password.length < 6) {
        throw new HttpsError('invalid-argument', 'A senha deve ter pelo menos 6 caracteres.');
    }

    try {
        // Criar o usuário no Firebase Authentication
        const userRecord = await admin.auth().createUser({ email, password });
        const { uid } = userRecord;

        // Criar a organização no Firestore
        const orgRef = db.collection('organizations').doc();
        await orgRef.set({
            ownerUid: uid,
            ownerEmail: email,
            name: orgName,
            planId: planId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending_payment', // Novo status
            isPublic: false, // Não é público até o pagamento ser concluído
            assignedStates: [],
        });

        // Criar o documento de permissões do admin
        const adminRef = db.collection('admins').doc(uid);
        await adminRef.set({
            uid, email, role: 'admin', organizationId: orgRef.id,
            assignedStates: [], assignedCampaigns: {},
        });

        logger.info(`Organização pendente '${orgName}' e usuário '${email}' criados com ID: ${orgRef.id}`);
        return { success: true, organizationId: orgRef.id };

    } catch (error) {
        logger.error("Erro ao criar organização pendente:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Este e-mail já está cadastrado.');
        }
        if (error.code === 'auth/invalid-email') {
            throw new HttpsError('invalid-argument', 'O formato do e-mail é inválido.');
        }
        if (error.code === 'auth/invalid-password') {
             throw new HttpsError('invalid-argument', 'A senha é inválida. Deve ter pelo menos 6 caracteres.');
        }
        throw new HttpsError('internal', 'Não foi possível criar a conta. Ocorreu um erro inesperado.');
    }
});

/**
 * Etapa 2: Gera o link de pagamento do Mercado Pago para uma organização já criada e com status pendente.
 * Esta função deve ser chamada por um usuário autenticado.
 */
exports.getCheckoutLinkForOrg = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Você precisa estar logado para realizar esta ação.');
    }
    
    const { orgId } = request.data;
    if (!orgId) {
        throw new HttpsError('invalid-argument', 'O ID da organização é obrigatório.');
    }

    const orgRef = db.collection('organizations').doc(orgId);
    const orgDoc = await orgRef.get();

    if (!orgDoc.exists) {
        throw new HttpsError('not-found', 'Organização não encontrada.');
    }
    
    const orgData = orgDoc.data();
    // Security Check: Garante que o usuário logado é o dono da organização
    if (orgData.ownerUid !== request.auth.uid) {
         throw new HttpsError('permission-denied', 'Você não tem permissão para pagar por esta organização.');
    }

    const plan = plans[orgData.planId];
    if (!plan) {
        throw new HttpsError('failed-precondition', 'O plano selecionado é inválido.');
    }
    
    const config = await getMercadoPagoConfig();
    const client = new MercadoPagoConfig({ accessToken: config.accessToken });
    const preferenceClient = new Preference(client);

    // Constrói as URLs de notificação e redirecionamento de forma dinâmica
    const projectId = process.env.GCLOUD_PROJECT;
    const functionRegion = "southamerica-east1";
    const notificationUrl = `https://${functionRegion}-${projectId}.cloudfunctions.net/handleMercadoPagoNotification`;
    const redirectBaseUrl = `https://${projectId}.web.app`;

    const preferencePayload = {
        items: [{
            title: `Assinatura Plano ${plan.name} - ${orgData.name}`,
            unit_price: plan.price,
            quantity: 1,
        }],
        payer: { email: orgData.ownerEmail },
        back_urls: {
            success: `${redirectBaseUrl}/#/checkout-complete`,
            failure: `${redirectBaseUrl}/#/planos`,
            pending: `${redirectBaseUrl}/#/checkout-complete`,
        },
        auto_return: "approved",
        notification_url: notificationUrl,
        external_reference: orgId, // A referência externa agora é o ID da organização
    };

    try {
        const response = await preferenceClient.create({ body: preferencePayload });
        return { checkoutUrl: response.init_point };
    } catch (error) {
        logger.error("Erro ao criar preferência no Mercado Pago:", error);
        let errorMessage = 'Falha ao comunicar com o Mercado Pago.';
        // Verifica se é um erro específico da API do Mercado Pago
        if (error.cause && Array.isArray(error.cause) && error.cause.length > 0) {
            const cause = error.cause[0];
            logger.error("Causa do erro do Mercado Pago:", cause);
            errorMessage = `Erro do Mercado Pago: ${cause.description || 'Por favor, verifique os dados e as credenciais.'}`;
        } else if (error.message) {
            errorMessage = error.message;
        }
        throw new HttpsError('internal', errorMessage);
    }
});


/**
 * Webhook para receber notificações de pagamento e ATIVAR a organização.
 */
exports.handleMercadoPagoNotification = functions.https.onRequest(async (req, res) => {
    logger.info("Notificação MP Recebida:", { query: req.query, body: req.body });

    const paymentId = req.query.id || (req.body.data && req.body.data.id);
    const topic = req.query.topic || req.body.action;

    if (topic !== 'payment.created' && topic !== 'payment.updated' && req.body.type !== 'payment') {
        logger.log("Notificação ignorada (não é de pagamento).");
        return res.status(200).send('OK');
    }
    if (!paymentId) {
        logger.warn("ID de pagamento não encontrado.");
        return res.status(400).send('Payment ID not found');
    }

    try {
        const config = await getMercadoPagoConfig();
        const client = new MercadoPagoConfig({ accessToken: config.accessToken });
        const paymentClient = new Payment(client);
        
        const payment = await paymentClient.get({ id: paymentId });
        
        if (payment && payment.status === 'approved' && payment.external_reference) {
            const orgId = payment.external_reference;
            const orgRef = db.collection('organizations').doc(orgId);
            
            await db.runTransaction(async (transaction) => {
                const orgDoc = await transaction.get(orgRef);
                if (orgDoc.exists && orgDoc.data().status === 'pending_payment') {
                    transaction.update(orgRef, { status: 'active', isPublic: true });
                    logger.info(`Organização ativada com sucesso: ${orgId}`);
                } else {
                     logger.warn(`Organização não encontrada ou já ativa: ${orgId}`);
                }
            });
        }
        
        return res.status(200).send('OK');

    } catch (error) {
        logger.error("Erro no webhook do Mercado Pago:", error);
        return res.status(500).send('Internal Server Error');
    }
});