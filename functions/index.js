
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/**
 * MOTOR DE DISPARO UNIFICADO
 * Esta função garante que a notificação chegue com o app fechado.
 */
const sendPushToToken = async (token, title, body, url, metadata = {}) => {
    if (!token) return { success: false, error: "Token ausente." };

    const message = {
        // Bloco 'notification' é CRÍTICO para o app fechado ser alertado pelo OS
        notification: {
            title: title,
            body: body
        },
        // Bloco 'data' é usado pelo app quando aberto/em segundo plano para navegação
        data: {
            url: url || "/#/posts",
            ...metadata
        },
        // Configurações para prioridade alta (acorda o rádio do celular)
        android: {
            priority: "high",
            notification: {
                sound: "default",
                clickAction: "FCM_PLUGIN_ACTIVITY"
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1
                }
            }
        },
        token: token
    };

    try {
        await admin.messaging().send(message);
        return { success: true };
    } catch (error) {
        console.error("Erro no envio FCM:", error.message);
        return { success: false, error: error.message };
    }
};

/**
 * TESTE IMEDIATO (Callable)
 * Usa o motor unificado para testar se o celular da divulgadora está recebendo.
 */
exports.testSelfPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { fcmToken, name } = data;
    if (!fcmToken) throw new functions.https.HttpsError("invalid-argument", "Token não encontrado.");

    return await sendPushToToken(
        fcmToken,
        "Teste de Notificação 🚀",
        `Olá ${name.split(' ')[0]}, se você recebeu isso, seu celular está configurado corretamente!`,
        "/#/posts",
        { type: "test_push" }
    );
});

/**
 * AGENDADOR AUTOMÁTICO (Robô de 6h)
 * Varre a fila e usa o mesmo motor unificado.
 */
exports.processScheduledPushReminders = functions.region("southamerica-east1")
    .pubsub.schedule("every 5 minutes")
    .onRun(async (context) => {
        const now = admin.firestore.Timestamp.now();
        
        const snapshot = await db.collection("pushReminders")
            .where("status", "==", "pending")
            .where("scheduledFor", "<=", now)
            .limit(50)
            .get();

        if (snapshot.empty) return null;

        await Promise.all(snapshot.docs.map(async (doc) => {
            const r = doc.data();
            const result = await sendPushToToken(r.fcmToken, r.title, r.body, r.url, { assignmentId: r.assignmentId });

            if (result.success) {
                return doc.ref.update({ status: "sent", sentAt: now });
            } else {
                return doc.ref.update({ status: "error", error: result.error });
            }
        }));

        return null;
    });
