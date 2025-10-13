const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

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
        
    // The data sent from the client is in request.data
    const { paymentData, newUser } = request.data;
    const uidFromAuth = request.auth ? request.auth.uid : null;
    
    if (!paymentData || !newUser) {
        throw new HttpsError('invalid-argument', 'A função deve ser chamada com os argumentos "paymentData" e "newUser".');
    }

    try {
        const credentials = await getMercadoPagoCredentials();
        if (!credentials.accessToken) {
            throw new HttpsError('failed-precondition', 'O Access Token do Mercado Pago não foi configurado.');
        }

        // 1. Process Payment with Mercado Pago
        // Use authenticated user's UID for idempotency if available, otherwise use a timestamp
        const idempotencyKey = uidFromAuth ? uidFromAuth + Date.now() : Date.now().toString();

        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${credentials.accessToken}`,
                'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(paymentData),
        });

        // Robust response handling
        const responseText = await mpResponse.text();
        let mpResult;
        try {
            mpResult = JSON.parse(responseText);
        } catch (jsonError) {
            logger.error("Mercado Pago non-JSON response", { status: mpResponse.status, text: responseText });
            throw new HttpsError('unavailable', `O serviço de pagamento retornou uma resposta inesperada (status: ${mpResponse.status}). Tente novamente.`);
        }

        if (!mpResponse.ok) {
            const errorMessage = mpResult.cause?.[0]?.description || mpResult.message || 'O pagamento foi recusado.';
            throw new HttpsError('aborted', errorMessage);
        }

        if (mpResult.status !== 'approved') {
             throw new HttpsError('aborted', `Pagamento não aprovado. Status: ${mpResult.status_detail}`);
        }

        // 2. If payment is successful, create user and organization
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
        logger.error('Error in processMercadoPagoPayment', { error, data: request.data });

        if (error instanceof HttpsError) {
            throw error;
        }

        if (error.code && error.code.startsWith('auth/')) {
            if (error.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'Este e-mail já está cadastrado. Tente fazer login ou use um e-mail diferente.');
            }
            throw new HttpsError('internal', `Ocorreu um erro ao criar sua conta após o pagamento (código: ${error.code}).`);
        }
        
        throw new HttpsError('internal', 'Ocorreu um erro interno ao processar sua solicitação.');
    }
});
