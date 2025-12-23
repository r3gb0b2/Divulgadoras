
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sib = require("@getbrevo/brevo");
const { GoogleGenAI } = require("@google/genai");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// Gemini API Setup
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Envia uma notificação de teste para o próprio dispositivo do usuário.
 */
exports.testSelfPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { fcmToken, name } = data;
    
    if (!fcmToken) {
        throw new functions.https.HttpsError("invalid-argument", "Token FCM não fornecido.");
    }

    const message = {
        notification: {
            title: "Teste de Notificação 🚀",
            body: `Olá ${name.split(' ')[0]}, seu aplicativo está configurado corretamente para receber alertas!`
        },
        data: {
            url: "/#/posts",
            type: "test_push"
        },
        token: fcmToken,
        android: {
            priority: "high",
            notification: {
                channelId: "high_importance_channel",
                sound: "default",
                priority: "max"
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1
                }
            }
        }
    };

    try {
        await admin.messaging().send(message);
        return { success: true, message: "Push enviado com sucesso." };
    } catch (error) {
        console.error("Error sending self test push:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

/**
 * Função para limpar lembretes duplicados de uma mesma tarefa.
 * Mantém apenas o mais recente agendado.
 */
exports.cleanupDuplicateReminders = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    try {
        const snap = await db.collection('pushReminders').where('status', '==', 'pending').get();
        const map = new Map();
        const toDelete = [];

        snap.forEach(doc => {
            const r = doc.data();
            const key = `${r.promoterId}_${r.assignmentId}`;
            if (map.has(key)) {
                const existing = map.get(key);
                if (r.scheduledFor.toMillis() > existing.data.scheduledFor.toMillis()) {
                    toDelete.push(existing.id);
                    map.set(key, { id: doc.id, data: r });
                } else {
                    toDelete.push(doc.id);
                }
            } else {
                map.set(key, { id: doc.id, data: r });
            }
        });

        if (toDelete.length > 0) {
            const chunks = [];
            for (let i = 0; i < toDelete.length; i += 500) {
                chunks.push(toDelete.slice(i, i + 500));
            }
            for (const chunk of chunks) {
                const batch = db.batch();
                chunk.forEach(id => batch.delete(db.collection('pushReminders').doc(id)));
                await batch.commit();
            }
        }

        return { success: true, count: toDelete.length };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});
