const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const stripePackage = require("stripe");


admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });


const getStripeConfigFromFirestore = async () => {
    const docRef = db.collection('settings').doc('stripe_credentials');
    const docSnap = await docRef.get();
    if (!docSnap.exists()) {
        logger.error("Stripe credentials document not found in Firestore at 'settings/stripe_credentials'");
        throw new HttpsError('failed-precondition', 'As credenciais de pagamento (IDs de Preço) não foram configuradas no painel do Super Admin.');
    }
    return docSnap.data();
};


exports.createStripeCheckoutSession = onCall(async (request) => {
    try {
        // 1. Get secret key from environment config. This is synchronous and robust.
        const secretKey = functions.config().stripe?.secret_key;
        if (!secretKey) {
            logger.error("Stripe secret key not set in Firebase environment config. Run 'firebase functions:config:set stripe.secret_key=...'");
            throw new HttpsError('failed-precondition', 'A chave secreta de pagamento não está configurada no servidor. Contate o administrador.');
        }

        // 2. Get non-sensitive config (price IDs) from Firestore.
        const { basicPriceId, professionalPriceId } = await getStripeConfigFromFirestore();
        if (!basicPriceId || !professionalPriceId) {
            logger.error("Stripe Price IDs are missing from the Firestore document.");
            throw new HttpsError('failed-precondition', 'Os IDs de preço dos planos não estão configurados no painel.');
        }

        const stripe = stripePackage(secretKey);
        
        const { planId, orgName, email, password } = request.data;
        if (!planId || !orgName || !email || !password) {
            throw new HttpsError('invalid-argument', 'Faltam parâmetros obrigatórios na requisição.');
        }

        const priceId = planId === 'basic' ? basicPriceId : professionalPriceId;

        let uid;
        try {
            const userRecord = await admin.auth().createUser({ email, password });
            uid = userRecord.uid;
        } catch (error) {
            if (error.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'Este e-mail já está cadastrado. Por favor, tente fazer login ou use um e-mail diferente.');
            }
            logger.error("Error creating Firebase Auth user:", { code: error.code, email });
            throw new HttpsError('internal', 'Falha ao criar o usuário. Tente novamente.');
        }

        const origin = request.rawRequest?.headers?.origin;
        if (!origin) {
            logger.error("Could not determine request origin (origin header is missing). Cannot construct redirect URLs.");
            // Fallback to a configured URL if necessary, or fail.
            const projectId = admin.app().options().projectId;
            if (!projectId) {
                 throw new HttpsError('internal', 'Não foi possível determinar a origem da aplicação para o redirecionamento.');
            }
        }
        
        // Use a reliable base URL construction
        const baseUrl = origin || `https://${admin.app().options().projectId}.firebaseapp.com`;

        const stripeCustomer = await stripe.customers.create({
            email: email,
            metadata: { firebaseUID: uid },
        });

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
        logger.error('CRITICAL ERROR in createStripeCheckoutSession:', {
            errorMessage: error.message,
            errorCode: error.code,
            requestData: request.data
        });
        
        // Clean up created user if the process fails later
        if (request.data.email && error.code !== 'already-exists') {
             try {
                const user = await admin.auth().getUserByEmail(request.data.email);
                await admin.auth().deleteUser(user.uid);
                logger.info(`Orphaned Firebase user ${request.data.email} deleted due to Stripe error.`);
             } catch (cleanupError) {
                logger.error(`Failed to clean up user ${request.data.email}`, cleanupError);
             }
        }

        if (error instanceof HttpsError) {
            throw error;
        }
        const userFriendlyMessage = error.message?.includes('No such price') 
            ? 'ID de Preço inválido. Verifique a configuração no painel.'
            : 'Ocorreu um erro com o provedor de pagamento. Tente novamente.';
        throw new HttpsError('internal', userFriendlyMessage);
    }
});


// This function triggers when the Stripe Extension creates a subscription document in Firestore.
// It's responsible for the custom logic of creating the organization and linking it to the user.
exports.createOrganizationAndAdmin = onDocumentCreated("customers/{customerId}/subscriptions/{subscriptionId}", async (event) => {
    if (!event.data) {
        logger.error("onDocumentCreated trigger for subscriptions received an event with no data.", event);
        return null;
    }
    const subscription = event.data.data();

    // Check if subscription is active and we haven't processed it before to ensure idempotency.
    if (
        (subscription.status !== 'active' && subscription.status !== 'trialing') ||
        subscription.metadata.organizationCreated === 'true'
    ) {
        logger.log(`Skipping subscription ${event.params.subscriptionId}. Status: ${subscription.status}, Processed: ${subscription.metadata.organizationCreated}`);
        return null;
    }

    const { firebaseUID, organizationName, planId } = subscription.metadata;

    if (!firebaseUID || !organizationName || !planId) {
        logger.error("Missing required metadata from subscription object.", { subscriptionId: event.params.subscriptionId, metadata: subscription.metadata });
        return null;
    }
    
    try {
        // 1. Get user email from Firebase Auth
        const userRecord = await admin.auth().getUser(firebaseUID);
        if (!userRecord.email) {
            logger.error(`User ${firebaseUID} does not have an email.`);
            return null; // Can't proceed without an email
        }
        const ownerEmail = userRecord.email;

        // 2. Create the organization document
        const orgRef = await db.collection('organizations').add({
            ownerUid: firebaseUID,
            ownerEmail: ownerEmail,
            name: organizationName,
            planId: planId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            isPublic: true,
            assignedStates: [],
            stripeCustomerId: event.params.customerId,
            stripeSubscriptionId: event.params.subscriptionId,
        });
        const newOrgId = orgRef.id;

        // 3. Create/update the admin user document with the new organization ID
        const adminRef = db.collection('admins').doc(firebaseUID);
        await adminRef.set({
            uid: firebaseUID,
            email: ownerEmail,
            role: 'admin', // The owner is always an admin
            organizationId: newOrgId,
            assignedStates: [],
        }, { merge: true });

        // 4. Mark the subscription as processed to prevent duplicate runs
        await event.data.ref.set({
            metadata: {
                ...subscription.metadata,
                organizationCreated: 'true'
            }
        }, { merge: true });
        
        logger.info(`Successfully created organization ${newOrgId} for user ${firebaseUID}`);
        return { success: true, organizationId: newOrgId };

    } catch (error) {
        logger.error("Error in createOrganizationAndAdmin trigger for subscription " + event.params.subscriptionId, error);
        return null; // Return null to indicate non-retriable error
    }
});