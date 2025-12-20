
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();

exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds, organizationId } = data;
    if (!title || !body || !promoterIds) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    try {
        const tokens = [];
        const CHUNK_SIZE = 30;
        
        // Busca os tokens atualizados no banco
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

        if (tokens.length === 0) return { success: false, message: "Nenhum token encontrado no banco de dados." };

        const messagePayload = {
            notification: { title, body },
            data: { 
                url: url || '/#/posts',
                click_action: "FLUTTER_NOTIFICATION_CLICK" // Compatibilidade extra
            },
            android: {
                priority: "high",
                notification: { 
                    sound: "default", 
                    icon: "stock_ticker_update", 
                    color: "#e83a93",
                    clickAction: url || '/#/posts'
                }
            },
            apns: {
                payload: {
                    aps: { 
                        sound: "default", 
                        badge: 1,
                        alert: { title, body }
                    }
                }
            },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(messagePayload);
        
        // Diagnóstico de falhas
        let detailedError = "";
        if (response.failureCount > 0) {
            const firstError = response.responses.find(r => !r.success);
            detailedError = firstError ? firstError.error.message : "Erro desconhecido no gateway.";
        }

        return { 
            success: response.successCount > 0, 
            message: `${response.successCount} enviadas, ${response.failureCount} falhas.`,
            errorDetail: detailedError,
            results: response.responses.map(r => r.success)
        };

    } catch (e) {
        console.error("Erro crítico no envio Push:", e);
        throw new functions.https.HttpsError("internal", e.message);
    }
});
