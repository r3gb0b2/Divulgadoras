
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();

exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds } = data;
    if (!title || !body || !promoterIds) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    try {
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

        if (tokens.length === 0) return { success: false, message: "Nenhum token encontrado." };

        const messagePayload = {
            notification: { title, body },
            data: { url: url || '/#/posts' },
            android: {
                priority: "high",
                notification: { sound: "default", icon: "stock_ticker_update", color: "#e83a93" }
            },
            apns: {
                payload: {
                    aps: { sound: "default", badge: 1 }
                }
            },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(messagePayload);
        
        return { 
            success: true, 
            message: `${response.successCount} notificações enviadas.`,
            failureCount: response.failureCount
        };

    } catch (e) {
        console.error("Error sending push:", e);
        throw new functions.https.HttpsError("internal", e.message);
    }
});
