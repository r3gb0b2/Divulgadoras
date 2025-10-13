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


const getStripeCredentialsFromFirestore = async () => {
    const docRef = db.collection('settings').doc('stripe_credentials');
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        logger.error("Stripe credentials document not found in Firestore at 'settings/stripe_credentials'");
        throw new HttpsError('failed-precondition', 'As credenciais de pagamento não foram configuradas no painel do Super Admin.');
    }
    return docSnap.data();
};


exports.createStripeCheckoutSession = onCall(async (request) => {
    let stripeCredentials;
    try {
        stripeCredentials = await getStripeCredentialsFromFirestore();
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error("Error fetching stripe credentials from Firestore", error);
        throw new HttpsError('internal', 'Falha ao ler a configuração do servidor.');
    }

    const { secretKey, basicPriceId, professionalPriceId } = stripeCredentials;
    
    if (!secretKey || !basicPriceId || !professionalPriceId) {
        logger.error("One or more Stripe credentials (secretKey, basicPriceId, professionalPriceId) are missing from the Firestore document.");
        throw new HttpsError('failed-precondition', 'A configuração de pagamento no servidor está incompleta. Fale com o administrador.');
    }

    const stripe = stripePackage(secretKey);
    
    const { planId, orgName, email, password } = request.data;
    
    if (!planId || !orgName || !email || !password) {
        throw new HttpsError('invalid-argument', 'Faltam parâmetros obrigatórios na requisição.');
    }

    const priceIdMap = {
        basic: basicPriceId,
        professional: professionalPriceId
    };

    const priceId = priceIdMap[planId];
    if (!priceId) {
        throw new HttpsError('not-found', `ID de preço para o plano '${planId}' não configurado no servidor.`);
    }

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

    try {
        const stripeCustomer = await stripe.customers.create({
            email: email,
            metadata: {
                firebaseUID: uid,
            },
        });

        const projectId = admin.app().options().projectId;
        if (!projectId) {
            logger.error("Could not determine Firebase Project ID from admin SDK.");
            throw new HttpsError('internal', 'Configuração do servidor incompleta (Project ID).');
        }
        const baseUrl = `https://${projectId}.web.app`;

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
        logger.error('Error during Stripe operations:', { message: error.message, email });
        if (uid) {
            await admin.auth().deleteUser(uid);
            logger.info(`Orphaned Firebase user with UID ${uid} deleted due to Stripe error.`);
        }
        const userFriendlyMessage = error.raw?.message || 'Ocorreu um erro inesperado com o provedor de pagamento. Verifique se os IDs de Preço estão corretos.';
        throw new HttpsError('internal', userFriendlyMessage);
    }
});


// This function triggers when the Stripe Extension creates a subscription document in Firestore.
// It's responsible for the custom logic of creating the organization and linking it to the user.
exports.createOrganizationAndAdmin = onDocumentCreated("customers/{customerId}/subscriptions/{subscriptionId}", async (event) => {
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