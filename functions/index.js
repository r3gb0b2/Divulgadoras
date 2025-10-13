const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const stripePackage = require("stripe");


admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });


// ATENÇÃO: Estes IDs de preço são exemplos. Você PRECISA substituí-los
// pelos IDs de Preço REAIS do seu painel Stripe para que a assinatura funcione.
const STRIPE_PRICE_IDS = {
    basic: 'price_1PbydWRx7f8p2bWBRYd8b9eA', // Substitua pelo seu ID de preço do plano Básico
    professional: 'price_1PbydWRx7f8p2bWBTGfA9cDE', // Substitua pelo seu ID de preço do plano Profissional
};


exports.createStripeCheckoutSession = onCall(async (request) => {
    // 1. Get and validate Stripe secret key from Firebase config
    const stripeSecretKey = functions.config().stripe?.secret_key;
    if (!stripeSecretKey) {
        logger.error("Stripe secret key is not configured. Run: firebase functions:config:set stripe.secret_key=YOUR_KEY");
        throw new HttpsError('failed-precondition', 'A chave secreta de pagamento não está configurada no servidor. Por favor, contate o administrador.');
    }

    // 2. Initialize Stripe inside the function
    const stripe = stripePackage(stripeSecretKey);
    
    const { planId, orgName, email, password } = request.data;
    
    if (!planId || !orgName || !email || !password) {
        throw new HttpsError('invalid-argument', 'Faltam parâmetros obrigatórios na requisição.');
    }

    const priceId = STRIPE_PRICE_IDS[planId];
    if (!priceId) {
        throw new HttpsError('not-found', `ID de preço para o plano '${planId}' não encontrado.`);
    }

    let uid;
    try {
        // Step 1: Create the user in Firebase Auth FIRST.
        const userRecord = await admin.auth().createUser({ email, password });
        uid = userRecord.uid;
    } catch (error) {
         if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Este e-mail já está cadastrado. Por favor, tente fazer login ou use um e-mail diferente.');
        }
        logger.error("Error creating Firebase Auth user:", { error, email });
        throw new HttpsError('internal', 'Falha ao criar o usuário. Tente novamente.');
    }

    try {
        // Step 2: Explicitly create a Stripe Customer.
        const stripeCustomer = await stripe.customers.create({
            email: email,
            metadata: {
                firebaseUID: uid,
            },
        });

        // Dynamically construct the base URL from the Firebase project ID
        const baseUrl = `https://${process.env.GCLOUD_PROJECT}.web.app`;

        // Step 3: Create the Stripe Checkout session.
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            success_url: `${baseUrl}/#/admin`,
            cancel_url: `${baseUrl}/#/planos`,
            customer: stripeCustomer.id,
            line_items: [{ price: priceId, quantity: 1 }],
            subscription_data: {
                metadata: {
                    firebaseUID: uid,
                    organizationName: orgName,
                    planId: planId,
                }
            },
        });

        return { sessionId: session.id };

    } catch (error) {
        logger.error('Error during Stripe operations:', { error, email });
        // If Stripe operations fail, we must delete the orphaned user we just created.
        if (uid) {
            await admin.auth().deleteUser(uid);
            logger.info(`Orphaned Firebase user with UID ${uid} deleted due to Stripe error.`);
        }
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'Ocorreu um erro inesperado com o provedor de pagamento.');
    }
});