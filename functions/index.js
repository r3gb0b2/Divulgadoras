
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/**
 * MOTOR DE DISPARO UNIFICADO (Core do Push)
 * Configurado para máxima prioridade e exibição com app fechado.
 */
const sendPushToToken = async (token, title, body, url, metadata = {}) => {
    if (!token) return { success: false, error: "Token ausente." };

    const message = {
        // Bloco 'notification' faz o Android/iOS exibir o banner mesmo com app fechado
        notification: {
            title: title,
            body: body
        },
        // Bloco 'data' permite que o código do app processe o clique e navegue
        data: {
            url: url || "/#/posts",
            ...metadata
        },
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "default", 
                clickAction: "FCM_PLUGIN_ACTIVITY"
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1,
                    contentAvailable: true
                }
            }
        },
        token: token
    };

    try {
        await admin.messaging().send(message);
        return { success: true };
    } catch (error) {
        console.error("Erro FCM:", error.message);
        return { success: false, error: error.message };
    }
};

/**
 * TESTE IMEDIATO (Divulgadora testando o próprio celular)
 */
exports.testSelfPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { fcmToken, name } = data;
    if (!fcmToken) throw new functions.https.HttpsError("invalid-argument", "Token não encontrado.");

    return await sendPushToToken(
        fcmToken,
        "Teste de Conexão 🚀",
        `Olá ${name.split(' ')[0]}, seu celular está pronto para receber alertas mesmo com o app fechado!`,
        "/#/posts",
        { type: "test_push" }
    );
});

/**
 * DISPARO MANUAL (Super Admin forçando um item da fila)
 */
exports.sendPushReminderImmediately = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    // Apenas superadmin ou admin
    const { reminderId } = data;
    if (!reminderId) throw new functions.https.HttpsError("invalid-argument", "ID do lembrete é obrigatório.");

    const docRef = db.collection("pushReminders").doc(reminderId);
    const snap = await docRef.get();
    
    if (!snap.exists) throw new functions.https.HttpsError("not-found", "Lembrete não encontrado.");
    
    const r = snap.data();
    const result = await sendPushToToken(r.fcmToken, r.title, r.body, r.url, { assignmentId: r.assignmentId, manual: "true" });

    if (result.success) {
        await docRef.update({ status: "sent", sentAt: admin.firestore.Timestamp.now(), manualSend: true });
        return { success: true };
    } else {
        throw new functions.https.HttpsError("internal", result.error);
    }
});

/**
 * ROBÔ DE 6 HORAS (Agendado)
 * Varre a fila de 5 em 5 minutos
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
            const result = await sendPushToToken(
                r.fcmToken, 
                r.title, 
                r.body, 
                r.url, 
                { assignmentId: r.assignmentId, type: "reminder_6h" }
            );

            if (result.success) {
                return doc.ref.update({ status: "sent", sentAt: now });
            } else {
                return doc.ref.update({ status: "error", error: result.error });
            }
        }));

        return null;
    });
