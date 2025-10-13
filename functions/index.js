const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
// IMPORTANT: You must configure your Stripe secret key in your Firebase environment.
// Run this command in your terminal:
// firebase functions:config:set stripe.secret_key="sk_test_YOUR_SECRET_KEY"
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


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
    const { planId, orgName, email, password } = request.data;
    
    if (!planId || !orgName || !email || !password) {
        throw new HttpsError('invalid-argument', 'Missing required parameters.');
    }

    const priceId = STRIPE_PRICE_IDS[planId];
    if (!priceId) {
        throw new HttpsError('not-found', `Price ID for plan '${planId}' not found.`);
    }

    let uid;
    try {
        // Step 1: Create the user in Firebase Auth FIRST.
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({ email, password });
            uid = userRecord.uid;
        } catch (error) {
             if (error.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'Este e-mail já está cadastrado. Por favor, tente fazer login ou use um e-mail diferente.');
            }
            throw new HttpsError('internal', 'Falha ao criar o usuário. Tente novamente.');
        }

        // Step 2: Explicitly create a Stripe Customer and link it to the Firebase user UID.
        // This is the most reliable method for the Stripe Extension to sync correctly.
        const stripeCustomer = await stripe.customers.create({
            email: email,
            metadata: {
                firebaseUID: uid,
            },
        });

        // Dynamically construct the base URL from the Firebase project ID
        const baseUrl = `https://${process.env.GCLOUD_PROJECT}.web.app`;

        // Step 3: Create the Stripe Checkout session linked to the specific customer.
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            success_url: `${baseUrl}/#/admin`,
            cancel_url: `${baseUrl}/#/planos`,
            customer: stripeCustomer.id, // Use the customer ID instead of just the email
            line_items: [{ price: priceId, quantity: 1 }],
            // Pass UID and other info in metadata for the Stripe Extension webhook.
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
        logger.error('Error creating Stripe checkout session:', { error, email });
        // If the process fails after user creation, we should delete the orphaned user.
        if (uid) {
            await admin.auth().deleteUser(uid);
            logger.info(`Orphaned Firebase user with UID ${uid} deleted due to Stripe error.`);
        }
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || 'An unexpected error occurred.');
    }
});