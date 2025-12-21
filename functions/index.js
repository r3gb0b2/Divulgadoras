
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Cloud Messaging (Push Notifications) ---

exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token } = data;
    if (!promoterId || !token) {
        throw new functions.https.HttpsError("invalid-argument", "ID da divulgadora e token são obrigatórios.");
    }
    try {
        await db.collection('promoters').doc(promoterId).update({
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, message: "Token vinculado com sucesso." };
    } catch (e) {
        throw new functions.https.HttpsError("internal", "Erro ao gravar no banco: " + e.message);
    }
});

// Envio manual via Painel de Campanhas
exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { title, body, url, promoterIds } = data;
    if (!title || !body || !promoterIds) {
        throw new functions.https.HttpsError("invalid-argument", "Campos obrigatórios ausentes.");
    }

    try {
        const tokens = [];
        const CHUNK_SIZE = 30;
        for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
            const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
            const snap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
            snap.forEach(doc => {
                const p = doc.data();
                if (p.fcmToken && p.fcmToken.length > 64) tokens.push(p.fcmToken);
            });
        }
        if (tokens.length === 0) return { success: false, message: "Nenhum token válido encontrado." };

        const response = await admin.messaging().sendEachForMulticast({
            notification: { title, body },
            data: { url: url || '/#/posts' },
            tokens: tokens
        });
        return { success: true, message: `${response.successCount} pushes enviados.` };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

// AUTO-PUSH: Dispara quando um post é ativado
exports.onPostActivatedTrigger = functions.region("southamerica-east1").firestore
    .document('posts/{postId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        // Só dispara se mudou de inativo para ativo
        if (!before.isActive && after.isActive) {
            const postId = context.params.postId;
            const assignmentsSnap = await db.collection('postAssignments').where('postId', '==', postId).get();
            
            const promoterIds = [];
            assignmentsSnap.forEach(doc => promoterIds.push(doc.data().promoterId));

            if (promoterIds.length === 0) return;

            const tokens = [];
            const promoterSnap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds.slice(0, 500)).get();
            promoterSnap.forEach(doc => {
                const p = doc.data();
                if (p.fcmToken && p.fcmToken.length > 64) tokens.push(p.fcmToken);
            });

            if (tokens.length === 0) return;

            await admin.messaging().sendEachForMulticast({
                notification: {
                    title: "Nova tarefa disponível! 🚀",
                    body: `Postagem liberada para: ${after.campaignName}${after.eventName ? ' - ' + after.eventName : ''}`
                },
                data: { url: '/#/posts' },
                tokens: tokens
            });
        }
    });

// Função manual para notificar post específico via botão
exports.notifyPostPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    const postSnap = await db.collection('posts').doc(postId).get();
    if (!postSnap.exists) throw new functions.https.HttpsError("not-found", "Post não encontrado.");
    const post = postSnap.data();

    const assignmentsSnap = await db.collection('postAssignments').where('postId', '==', postId).get();
    const promoterIds = [];
    assignmentsSnap.forEach(doc => promoterIds.push(doc.data().promoterId));

    if (promoterIds.length === 0) return { success: false, message: "Nenhuma divulgadora atribuída." };

    const tokens = [];
    const promoterSnap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds.slice(0, 500)).get();
    promoterSnap.forEach(doc => {
        const p = doc.data();
        if (p.fcmToken && p.fcmToken.length > 64) tokens.push(p.fcmToken);
    });

    if (tokens.length === 0) return { success: false, message: "Nenhum dispositivo App vinculado encontrado." };

    await admin.messaging().sendEachForMulticast({
        notification: {
            title: "Aviso de Postagem 📢",
            body: `Verifique sua tarefa para: ${post.campaignName}`
        },
        data: { url: '/#/posts' },
        tokens: tokens
    });

    return { success: true, message: `Notificação enviada para ${tokens.length} dispositivos.` };
});
