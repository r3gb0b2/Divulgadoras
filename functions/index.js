const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const mercadopago = require("mercadopago");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

// Helper to get Mercado Pago credentials from Firestore
const getMercadoPagoCredentials = async () => {
    const credsDoc = await db.collection('settings').doc('mercado_pago_credentials').get();
    if (!credsDoc.exists) {
        throw new HttpsError('failed-precondition', 'As credenciais do Mercado Pago não foram configuradas.');
    }
    return credsDoc.data();
};

exports.processMercadoPagoPayment = onCall(async (request) => {
        
    const { paymentData, newUser } = request.data;
    
    if (!paymentData || !newUser) {
        throw new HttpsError('invalid-argument', 'A função deve ser chamada com os argumentos "paymentData" e "newUser".');
    }

    try {
        const credentials = await getMercadoPagoCredentials();
        if (!credentials.accessToken) {
            throw new HttpsError('failed-precondition', 'O Access Token do Mercado Pago não foi configurado.');
        }

        // 1. Configure and use the Mercado Pago SDK
        mercadopago.configure({
            access_token: credentials.accessToken,
        });

        const mpResponse = await mercadopago.payment.create(paymentData);
        const paymentResult = mpResponse.body;

        // 2. Check if payment was successful
        if (paymentResult.status !== 'approved') {
            const errorMessage = paymentResult.status_detail || 'O pagamento foi recusado pelo processador.';
            throw new HttpsError('aborted', `Pagamento não aprovado: ${errorMessage}`);
        }

        // 3. If payment is successful, create user and organization
        const { email, password, orgName, planId } = newUser;

        // Create Firebase Auth user
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
        });
        const uid = userRecord.uid;

        const batch = db.batch();

        // Create Organization document
        const orgRef = db.collection('organizations').doc(); // Auto-generate ID
        batch.set(orgRef, {
            ownerUid: uid,
            ownerEmail: email,
            name: orgName,
            planId: planId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            isPublic: true,
            assignedStates: [],
        });

        // Create Admin document for the new user
        const adminRef = db.collection('admins').doc(uid);
        batch.set(adminRef, {
            email: email,
            role: 'admin',
            assignedStates: [],
            assignedCampaigns: {},
            organizationId: orgRef.id,
        });

        await batch.commit();

        return { success: true, message: 'Pagamento bem-sucedido e conta criada.', organizationId: orgRef.id };

    } catch (error) {
        logger.error('Error in processMercadoPagoPayment', { 
            // Do not log the full request data in production if it contains sensitive info like password
            error: error, 
            userEmail: request.data.newUser?.email 
        });

        // Handle Mercado Pago SDK-specific errors
        if (error.cause) {
            const mpError = Array.isArray(error.cause) ? error.cause[0] : error.cause;
            const errorMessage = mpError?.description || 'Ocorreu um erro ao se comunicar com o processador de pagamentos.';
            throw new HttpsError('aborted', errorMessage);
        }

        if (error instanceof HttpsError) {
            throw error;
        }

        // Handle Firebase Auth errors after payment
        if (error.code && error.code.startsWith('auth/')) {
            if (error.code === 'auth/email-already-exists') {
                // IMPORTANT: The payment was successful but the user account could not be created.
                // This requires manual intervention or a more complex refund/retry logic.
                // For now, inform the user clearly.
                throw new HttpsError('already-exists', 'Seu pagamento foi aprovado, mas não foi possível criar sua conta pois o e-mail já existe. Por favor, entre em contato com o suporte.');
            }
            throw new HttpsError('internal', `Ocorreu um erro ao criar sua conta após o pagamento (código: ${error.code}). Por favor, entre em contato com o suporte.`);
        }
        
        throw new HttpsError('internal', 'Ocorreu um erro interno desconhecido. Por favor, tente novamente ou contate o suporte.');
    }
});