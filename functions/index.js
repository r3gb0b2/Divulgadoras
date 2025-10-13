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

    try {
        // Step 1: Create the user in Firebase Auth FIRST.
        // This is crucial because the Stripe Extension links customers based on UID.
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({ email, password });
        } catch (error) {
             if (error.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'Este e-mail já está cadastrado. Por favor, tente fazer login ou use um e-mail diferente.');
            }
            throw new HttpsError('internal', 'Falha ao criar o usuário. Tente novamente.');
        }

        const uid = userRecord.uid;

        // Dynamically construct the base URL from the Firebase project ID
        const baseUrl = `https://${process.env.GCLOUD_PROJECT}.web.app`;

        // Step 2: Create the Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            // Use the dynamically generated URL. The '#' is needed for HashRouter.
            success_url: `${baseUrl}/#/admin`,
            cancel_url: `${baseUrl}/#/planos`,
            customer_email: email,
            line_items: [{ price: priceId, quantity: 1 }],
            // IMPORTANT: Pass the new user's UID and other necessary info in metadata.
            // The Stripe Firebase Extension will use this to create the organization
            // and admin documents after successful payment.
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
        if (error instanceof HttpsError) {
            // If user creation succeeded but Stripe failed, we should ideally delete the user.
            // For now, we'll just throw the error.
            throw error;
        }
        throw new HttpsError('internal', error.message || 'An unexpected error occurred.');
    }
});