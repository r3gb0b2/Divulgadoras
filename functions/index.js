const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

/**
 * Creates a Firebase Auth user, an organization, and an admin document.
 * This function is called AFTER a successful payment is confirmed by the PagSeguro SDK on the client side.
 * It's a simple, direct way to provision the user's account post-payment.
 */
exports.createOrganizationAndUser = onCall(async (request) => {
    const { orgName, email, password, planId } = request.data;

    if (!orgName || !email || !password || !planId) {
        throw new HttpsError('invalid-argument', 'Faltam parâmetros obrigatórios na requisição (orgName, email, password, planId).');
    }

    try {
        // 1. Create the user in Firebase Auth first
        const userRecord = await admin.auth().createUser({ email, password });
        const { uid } = userRecord;

        // 2. Create the organization document
        const orgRef = await db.collection('organizations').add({
            ownerUid: uid,
            ownerEmail: email,
            name: orgName,
            planId: planId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            isPublic: true,
            assignedStates: [],
        });
        const newOrgId = orgRef.id;

        // 3. Create the admin user document and link it to the organization
        const adminRef = db.collection('admins').doc(uid);
        await adminRef.set({
            uid: uid,
            email: email,
            role: 'admin', // The owner is always an admin
            organizationId: newOrgId,
            assignedStates: [],
            assignedCampaigns: {},
        });

        logger.info(`Successfully created user ${email} and organization ${orgName} (${newOrgId})`);
        return { success: true, userId: uid, organizationId: newOrgId };

    } catch (error) {
        logger.error('CRITICAL ERROR in createOrganizationAndUser:', {
            errorMessage: error.message,
            errorCode: error.code,
            requestData: { email, orgName, planId } // Exclude password from logs
        });

        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'Este e-mail já está cadastrado. Tente fazer login ou use um e-mail diferente.');
        }
        
        // Generic error for other failures
        throw new HttpsError('internal', 'Não foi possível criar sua conta. Entre em contato com o suporte.');
    }
});