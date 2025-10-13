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

// Helper function to create user, org, and admin records
const finalizeAccountCreation = async (newUser) => {
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
    return { success: true, organizationId: orgRef.id };
}

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

        mercadopago.configure({ access_token: credentials.accessToken });

        const mpResponse = await mercadopago.payment.create(paymentData);
        const paymentResult = mpResponse.body;

        if (paymentResult.status !== 'approved') {
            const errorMessage = paymentResult.status_detail || 'O pagamento foi recusado pelo processador.';
            throw new HttpsError('aborted', `Pagamento não aprovado: ${errorMessage}`);
        }

        await finalizeAccountCreation(newUser);

        return { success: true, message: 'Pagamento bem-sucedido e conta criada.' };

    } catch (error) {
        logger.error('Error in processMercadoPagoPayment', { error, userEmail: request.data.newUser?.email });
        if (error.cause) {
            const mpError = Array.isArray(error.cause) ? error.cause[0] : error.cause;
            const errorMessage = mpError?.description || 'Ocorreu um erro com o processador de pagamentos.';
            throw new HttpsError('aborted', errorMessage);
        }
        if (error instanceof HttpsError) throw error;
        if (error.code && error.code.startsWith('auth/')) {
            if (error.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'Pagamento aprovado, mas o e-mail já existe. Contate o suporte.');
            }
            throw new HttpsError('internal', `Erro ao criar sua conta após o pagamento (código: ${error.code}). Contate o suporte.`);
        }
        throw new HttpsError('internal', 'Ocorreu um erro interno. Tente novamente ou contate o suporte.');
    }
});

exports.createPixPayment = onCall(async (request) => {
    const { plan, newUser } = request.data;
    if (!plan || !newUser) {
        throw new HttpsError('invalid-argument', 'Dados do plano ou do usuário ausentes.');
    }

    try {
        const credentials = await getMercadoPagoCredentials();
        if (!credentials.accessToken) {
            throw new HttpsError('failed-precondition', 'O Access Token do Mercado Pago não foi configurado.');
        }

        mercadopago.configure({ access_token: credentials.accessToken });

        const expirationDate = new Date();
        expirationDate.setMinutes(expirationDate.getMinutes() + 30); // 30 minutes to pay

        const payment_data = {
            transaction_amount: plan.price,
            description: `Assinatura Plano ${plan.name} - ${newUser.orgName}`,
            payment_method_id: 'pix',
            payer: {
                email: newUser.email,
            },
            date_of_expiration: expirationDate.toISOString().replace('Z', '-03:00')
        };
        
        const mpResponse = await mercadopago.payment.create(payment_data);
        const paymentResult = mpResponse.body;

        // Store pending user data linked to the payment ID
        await db.collection('pendingPixPayments').doc(String(paymentResult.id)).set({
            ...newUser,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId: paymentResult.id
        });

        return {
            success: true,
            paymentId: paymentResult.id,
            qrCodeBase64: paymentResult.point_of_interaction.transaction_data.qr_code_base64,
            qrCode: paymentResult.point_of_interaction.transaction_data.qr_code,
        };

    } catch (error) {
        logger.error('Error in createPixPayment', { error, userEmail: newUser.email });
         if (error.cause) {
            const mpError = Array.isArray(error.cause) ? error.cause[0] : error.cause;
            const errorMessage = mpError?.description || 'Ocorreu um erro ao gerar o PIX.';
            throw new HttpsError('aborted', errorMessage);
        }
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Não foi possível gerar o pagamento PIX.');
    }
});

exports.checkPixPaymentStatus = onCall(async (request) => {
    const { paymentId } = request.data;
    if (!paymentId) {
        throw new HttpsError('invalid-argument', 'O ID do pagamento é obrigatório.');
    }

    try {
        const credentials = await getMercadoPagoCredentials();
        mercadopago.configure({ access_token: credentials.accessToken });

        const mpResponse = await mercadopago.payment.get(paymentId);
        const paymentResult = mpResponse.body;

        const pendingDocRef = db.collection('pendingPixPayments').doc(String(paymentId));
        
        if (paymentResult.status === 'approved') {
            const pendingDoc = await pendingDocRef.get();
            if (pendingDoc.exists) {
                const newUser = pendingDoc.data();
                await finalizeAccountCreation(newUser);
                await pendingDocRef.delete(); // Clean up
                return { status: 'approved' };
            } else {
                 // Payment approved, but we have no record. This is a rare edge case.
                 logger.warn('PIX payment approved but no pending record found.', { paymentId });
                 return { status: 'approved' }; // Still confirm to user
            }
        } else if (paymentResult.status === 'cancelled' || paymentResult.status === 'expired') {
            await pendingDocRef.delete(); // Clean up
            return { status: paymentResult.status, message: `Pagamento ${paymentResult.status}.` };
        }

        return { status: 'pending' };

    } catch (error) {
        logger.error('Error in checkPixPaymentStatus', { error, paymentId });
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Erro ao verificar o status do pagamento.');
    }
});