
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sib = require("@getbrevo/brevo");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Brevo Configuration ---
const brevoApi = new sib.TransactionalEmailsApi();
const apiKey = functions.config().brevo ? functions.config().brevo.key : null;
if (apiKey) {
    brevoApi.setApiKey(sib.TransactionalEmailsApiApiKeys.apiKey, apiKey);
}

// Helper: Send Email via Brevo
async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!apiKey) {
        console.warn("Brevo API Key not configured. Email not sent.");
        return { success: false, message: "API Key missing" };
    }
    try {
        const email = new sib.SendSmtpEmail();
        email.sender = { name: "Equipe Certa", email: "contato@equipecerta.com.br" };
        email.to = [{ email: toEmail, name: toName }];
        email.subject = subject;
        email.htmlContent = htmlContent;
        await brevoApi.sendTransacEmail(email);
        return { success: true };
    } catch (e) {
        console.error("Error sending email via Brevo:", e);
        return { success: false, error: e.message };
    }
}

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

// --- EMAIL TRIGGERS ---

// Trigger: On Promoter Approval
exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId, data: updateData } = data;

    try {
        const promoterRef = db.collection('promoters').doc(promoterId);
        const snapshot = await promoterRef.get();
        if (!snapshot.exists) throw new functions.https.HttpsError("not-found", "Promoter not found");
        const promoter = snapshot.data();

        await promoterRef.update(updateData);

        // Se o status mudou para aprovado e não era aprovado antes
        if (updateData.status === 'approved' && promoter.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(promoter.organizationId).get();
            const org = orgSnap.data();
            
            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h1 style="color: #7e39d5;">Parabéns, ${promoter.name}!</h1>
                    <p>Seu perfil foi aprovado para participar da equipe <strong>${org.name}</strong>.</p>
                    <p>Agora você já pode acessar suas tarefas e confirmar sua presença nos eventos.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${promoter.email}" style="background-color: #7e39d5; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">ACESSAR MEU PORTAL</a>
                    </div>
                    <p style="color: #666; font-size: 12px;">Equipe Certa &copy; ${new Date().getFullYear()}</p>
                </div>
            `;

            await sendEmail({
                toEmail: promoter.email,
                toName: promoter.name,
                subject: `Seu cadastro na ${org.name} foi aprovado! 🎉`,
                htmlContent: html
            });
        }

        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

// Trigger: New Post Assignments
exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postData, assignedPromoters } = data;

    try {
        const postRef = await db.collection('posts').add({
            ...postData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const postId = postRef.id;

        const batch = db.batch();
        assignedPromoters.forEach(p => {
            const assignmentRef = db.collection('postAssignments').doc();
            batch.set(assignmentRef, {
                postId,
                post: postData,
                promoterId: p.id,
                promoterEmail: p.email,
                promoterName: p.name,
                organizationId: postData.organizationId,
                status: 'pending',
                confirmedAt: null,
                proofSubmittedAt: null
            });
        });
        await batch.commit();

        // Envio de E-mails de aviso de post (em background/async para não travar a UI)
        if (assignedPromoters.length > 0) {
            const orgSnap = await db.collection('organizations').doc(postData.organizationId).get();
            const org = orgSnap.data();

            assignedPromoters.forEach(async (p) => {
                const html = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                        <h2 style="color: #7e39d5;">Nova tarefa de divulgação! 🚀</h2>
                        <p>Olá <strong>${p.name}</strong>,</p>
                        <p>Um novo post foi liberado para você na equipe <strong>${org.name}</strong>.</p>
                        <p>Evento: <strong>${postData.campaignName}</strong></p>
                        <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #7e39d5; margin: 20px 0;">
                            ${postData.instructions}
                        </div>
                        <p>Acesse seu portal agora para baixar a mídia e confirmar sua postagem.</p>
                        <a href="https://divulgadoras.vercel.app/#/posts?email=${p.email}" style="color: #7e39d5; font-weight: bold; text-decoration: underline;">VER MEUS POSTS</a>
                    </div>
                `;
                await sendEmail({
                    toEmail: p.email,
                    toName: p.name,
                    subject: `Nova postagem: ${postData.campaignName}`,
                    htmlContent: html
                });
            });
        }

        return { success: true, postId };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

// AUTO-PUSH: Mantido para dispositivos nativos
exports.onPostActivatedTrigger = functions.region("southamerica-east1").firestore
    .document('posts/{postId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
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
