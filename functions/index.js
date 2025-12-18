
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ... (helpers anteriores mantidos)

// --- Cloud Messaging (Push Notifications) ---

exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds, organizationId } = data;
    if (!title || !body || !promoterIds) {
        throw new functions.https.HttpsError("invalid-argument", "Título, mensagem e destinatários são obrigatórios.");
    }

    try {
        // Busca os tokens das divulgadoras selecionadas
        const tokens = [];
        const CHUNK_SIZE = 30;
        
        for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
            const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
            const snap = await db.collection('promoters')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
            
            snap.forEach(doc => {
                const p = doc.data();
                if (p.fcmToken) tokens.push(p.fcmToken);
            });
        }

        if (tokens.length === 0) {
            return { success: false, message: "Nenhum dispositivo registrado encontrado para estas divulgadoras." };
        }

        const messagePayload = {
            notification: {
                title: title,
                body: body
            },
            data: {
                // Se o app estiver aberto ou em background, esse link será usado para navegar
                url: url || '/#/admin'
            },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(messagePayload);
        
        return { 
            success: true, 
            message: `${response.successCount} notificações enviadas com sucesso.`,
            failureCount: response.failureCount
        };

    } catch (e) {
        console.error("Error sending push:", e);
        throw new functions.https.HttpsError("internal", e.message);
    }
});

// ... (restante das funções mantidas)
