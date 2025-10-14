const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/onCall");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

/**
 * Cria a conta de usuário no Firebase Auth e a organização no Firestore com um status de 'trial'
 * e uma data de expiração de 3 dias.
 */
exports.createTrialOrganization = onCall({ allow: "unauthenticated" }, async (request) => {
    const { orgName, email, password, planId } = request.data;
    
    if (!orgName || !email || !password || !planId) {
        throw new HttpsError('invalid-argument', 'Todos os campos são obrigatórios.');
    }
    if (password.length < 6) {
        throw new HttpsError('invalid-argument', 'A senha deve ter pelo menos 6 caracteres.');
    }

    try {
        // Criar o usuário no Firebase Authentication
        const userRecord = await admin.auth().createUser({ email, password });
        const { uid } = userRecord;

        // Calcular a data de expiração para 3 dias a partir de agora
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 3);

        // Criar a organização no Firestore
        const orgRef = db.collection('organizations').doc();
        await orgRef.set({
            ownerUid: uid,
            ownerEmail: email,
            name: orgName,
            planId: planId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'trial', // Novo status
            isPublic: true, // É público durante o trial
            assignedStates: [],
            planExpiresAt: admin.firestore.Timestamp.fromDate(trialEndDate), // Define a data de expiração
            paymentLink: null, // Link de pagamento manual a ser definido pelo superadmin
        });

        // Criar o documento de permissões do admin
        const adminRef = db.collection('admins').doc(uid);
        await adminRef.set({
            uid, email, role: 'admin', organizationId: orgRef.id,
            assignedStates: [], assignedCampaigns: {},
        });

        logger.info(`Organização em trial '${orgName}' e usuário '${email}' criados com ID: ${orgRef.id}`);
        return { success: true, organizationId: orgRef.id };

    } catch (error) {
        logger.error("Erro detalhado ao criar organização em trial:", error);

        // Provide specific feedback for known Auth errors
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Este e-mail já está cadastrado.');
        }
        if (error.code === 'auth/invalid-email') {
            throw new HttpsError('invalid-argument', 'O formato do e-mail é inválido.');
        }
        if (error.code === 'auth/weak-password') {
             throw new HttpsError('invalid-argument', 'A senha é inválida. Deve ter pelo menos 6 caracteres.');
        }

        // For any other error, return the actual error message for better debugging.
        // This will reveal issues like disabled APIs or misconfigurations.
        const detailedErrorMessage = error.message || 'Ocorreu um erro inesperado no servidor. Verifique os logs da função para mais detalhes.';
        throw new HttpsError('internal', detailedErrorMessage);
    }
});