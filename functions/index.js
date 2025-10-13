const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

// Helper to get Mercado Pago credentials from Firestore
const getMercadoPagoCredentials = async () => {
    const credsDoc = await db.collection('settings').doc('mercado_pago_credentials').get();
    if (!credsDoc.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'As credenciais do Mercado Pago não foram configuradas.');
    }
    return credsDoc.data();
};

exports.processMercadoPagoPayment = functions
    .region('southamerica-east1')
    .https.onCall(async (data, context) => {
        
    const { paymentData, newUser } = data;
    
    if (!paymentData || !newUser) {
        throw new functions.https.HttpsError('invalid-argument', 'A função deve ser chamada com os argumentos "paymentData" e "newUser".');
    }

    try {
        const credentials = await getMercadoPagoCredentials();
        if (!credentials.accessToken) {
            throw new functions.https.HttpsError('failed-precondition', 'O Access Token do Mercado Pago não foi configurado.');
        }

        // 1. Process Payment with Mercado Pago
        const idempotencyKey = context.auth ? context.auth.uid + Date.now() : Date.now().toString();

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
            functions.logger.error("Mercado Pago non-JSON response", { status: mpResponse.status, text: responseText });
            throw new functions.https.HttpsError('unavailable', `O serviço de pagamento retornou uma resposta inesperada (status: ${mpResponse.status}). Tente novamente.`);
        }

        if (!mpResponse.ok) {
            const errorMessage = mpResult.cause?.[0]?.description || mpResult.message || 'O pagamento foi recusado.';
            throw new functions.https.HttpsError('aborted', errorMessage);
        }

        if (mpResult.status !== 'approved') {
             throw new functions.https.HttpsError('aborted', `Pagamento não aprovado. Status: ${mpResult.status_detail}`);
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
        functions.logger.error('Error in processMercadoPagoPayment', { error, data });

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        if (error.code && error.code.startsWith('auth/')) {
            if (error.code === 'auth/email-already-exists') {
                throw new functions.https.HttpsError('already-exists', 'Este e-mail já está cadastrado. Tente fazer login ou use um e-mail diferente.');
            }
            throw new functions.https.HttpsError('internal', `Ocorreu um erro ao criar sua conta após o pagamento (código: ${error.code}).`);
        }
        
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro interno ao processar sua solicitação.');
    }
});