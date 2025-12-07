
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const Brevo = require("@getbrevo/brevo");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Safe Initialization of Third-Party Services ---

const getConfig = () => {
    return functions.config() || {};
};

// --- Firestore Triggers ---

exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

      // Logic to assign posts if newly approved and joined group
      const justJoinedGroup = oldValue.hasJoinedGroup !== true && newValue.hasJoinedGroup === true;
      const isApproved = newValue.status === "approved";

      if (isApproved && justJoinedGroup) {
        // Implement assignment logic or call helper
        // Simplified for restoration
      }

      // WhatsApp Notification Logic
      const statusChanged = newValue.status !== oldValue.status;
      const isNotificationStatus =
        newValue.status === "approved" ||
        newValue.status === "rejected" ||
        newValue.status === "rejected_editable";

      if (statusChanged && isNotificationStatus) {
        const shouldSendWhatsApp = (newValue.status === "approved" || newValue.status === "rejected_editable") && newValue.whatsapp;
        
        if (shouldSendWhatsApp) {
            try {
                await sendWhatsAppStatusChange(newValue, promoterId);
            } catch (waError) {
                console.error(`[Z-API Trigger Error] Failed to send WhatsApp for ${promoterId}:`, waError);
            }
        }
      }
    });

exports.onPostAssignmentCreated = functions.region("southamerica-east1").firestore
    .document("postAssignments/{assignmentId}")
    .onCreate(async (snap, context) => {
        const assignmentData = snap.data();
        if (!assignmentData) return;

        const { organizationId, promoterId, post } = assignmentData;
        
        try {
            const orgDoc = await db.collection("organizations").doc(organizationId).get();
            const orgData = orgDoc.exists ? orgDoc.data() : {};

            if (orgData.whatsappNotificationsEnabled !== false) {
                const promoterDoc = await db.collection("promoters").doc(promoterId).get();
                if (promoterDoc.exists) {
                    const promoterData = promoterDoc.data();
                    if (promoterData.whatsapp) {
                        await sendNewPostNotificationWhatsApp(promoterData, post, assignmentData, promoterId);
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to process notification for assignment ${context.params.assignmentId}:`, error);
        }
    });

// --- Callable Functions ---

// Função de Teste do Z-API
exports.testZapi = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const config = getConfig().zapi;
    return {
        configFound: !!config,
        timestamp: new Date().toISOString()
    };
});

// Agendar Lembrete de WhatsApp (Com Verificação de Duplicidade)
exports.scheduleWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { assignmentId } = data;
    if (!assignmentId) throw new functions.https.HttpsError("invalid-argument", "ID da tarefa obrigatório.");

    try {
        const assignmentRef = db.collection("postAssignments").doc(assignmentId);
        const assignmentSnap = await assignmentRef.get();
        if (!assignmentSnap.exists) throw new functions.https.HttpsError("not-found", "Tarefa não encontrada.");
        
        const assignment = assignmentSnap.data();

        // 1. Check for existing pending reminder to prevent duplicates
        const existingReminderQuery = await db.collection("whatsAppReminders")
            .where("assignmentId", "==", assignmentId)
            .where("status", "==", "pending")
            .limit(1)
            .get();

        if (!existingReminderQuery.empty) {
            return { success: true, message: "Lembrete já estava agendado." };
        }

        // 2. Get Promoter Data for Phone
        const promoterRef = db.collection("promoters").doc(assignment.promoterId);
        const promoterSnap = await promoterRef.get();
        const promoterData = promoterSnap.exists ? promoterSnap.data() : {};
        const phone = promoterData.whatsapp || "";

        if (!phone) {
            throw new functions.https.HttpsError("failed-precondition", "Divulgadora sem WhatsApp cadastrado.");
        }

        // 3. Create Reminder (6 hours from now)
        const sendAt = admin.firestore.Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000); 

        const reminderData = {
            assignmentId,
            promoterId: assignment.promoterId,
            promoterName: assignment.promoterName,
            promoterEmail: assignment.promoterEmail,
            promoterWhatsapp: phone,
            postId: assignment.postId,
            postCampaignName: assignment.post.campaignName,
            organizationId: assignment.organizationId,
            status: 'pending',
            sendAt: sendAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        const reminderRef = db.collection("whatsAppReminders").doc();
        batch.set(reminderRef, reminderData);
        
        batch.update(assignmentRef, { 
            whatsAppReminderRequestedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        await batch.commit();

        return { success: true, message: "Lembrete agendado." };

    } catch (error) {
        console.error("Error scheduling reminder:", error);
        throw new functions.https.HttpsError("internal", "Erro ao agendar lembrete.");
    }
});

// Enviar Lembrete Imediatamente (Novo Texto)
exports.sendWhatsAppReminderNow = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { reminderId } = data;
    if (!reminderId) throw new functions.https.HttpsError("invalid-argument", "ID do lembrete obrigatório.");

    const config = getConfig().zapi;
    if (!config || !config.instance_id || !config.token) {
        throw new functions.https.HttpsError("failed-precondition", "Z-API não configurado.");
    }

    try {
        const reminderRef = db.collection("whatsAppReminders").doc(reminderId);
        const reminderSnap = await reminderRef.get();
        if (!reminderSnap.exists) throw new functions.https.HttpsError("not-found", "Lembrete não encontrado.");
        
        const reminder = reminderSnap.data();
        if (reminder.status === 'sent') return { success: true, message: "Já enviado." };

        let cleanPhone = reminder.promoterWhatsapp.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

        const firstName = reminder.promoterName.split(' ')[0];
        const portalLink = `https://divulgadoras.vercel.app/#/proof/${reminder.assignmentId}`;

        // TEXTO ATUALIZADO: Foco apenas no envio do print
        const message = `Olá ${firstName}! 📸\n\nPassando para lembrar de enviar o *print* da sua publicação no evento *${reminder.postCampaignName}*.\n\nPara garantir sua presença na lista, clique no link abaixo e envie agora:\n${portalLink}`;

        const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`;
        const headers = { 'Content-Type': 'application/json' };
        if (config.client_token) headers['Client-Token'] = config.client_token;

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: cleanPhone,
                message: message
            })
        });

        if (response.ok) {
            await reminderRef.update({ 
                status: 'sent', 
                sentAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            return { success: true };
        } else {
            const errText = await response.text();
            console.error("Z-API Error:", errText);
            await reminderRef.update({ 
                status: 'error', 
                error: errText,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            throw new Error("Falha na API do WhatsApp");
        }

    } catch (error) {
        console.error("Error sending reminder:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// Create Post and Assignments (Critical for Post Creation)
exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    // Basic implementation to support functionality
    const { postData, assignedPromoters } = data;
    try {
        const batch = db.batch();
        const postRef = db.collection("posts").doc();
        
        batch.set(postRef, {
            ...postData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        assignedPromoters.forEach(promoter => {
            const assignmentRef = db.collection("postAssignments").doc();
            batch.set(assignmentRef, {
                postId: postRef.id,
                post: postData,
                organizationId: postData.organizationId,
                promoterId: promoter.id,
                promoterEmail: promoter.email,
                promoterName: promoter.name,
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        return { success: true, postId: postRef.id };
    } catch (e) {
        console.error("Error creating post:", e);
        throw new functions.https.HttpsError("internal", "Failed to create post");
    }
});

// Helper Functions
async function sendWhatsAppStatusChange(promoterData, promoterId) {
    const config = getConfig().zapi;
    if (!config || !config.instance_id || !config.token) return;

    let cleanPhone = promoterData.whatsapp.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

    const firstName = promoterData.name ? promoterData.name.split(' ')[0] : 'Divulgadora';
    let message = "";

    if (promoterData.status === 'approved') {
        const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;
        message = `Olá ${firstName}! Parabéns 🥳\n\nSeu cadastro foi APROVADO!\n\nAcesse seu painel agora para ver as regras e entrar no grupo:\n${portalLink}`;
    } else if (promoterData.status === 'rejected_editable') {
        const editLink = `https://divulgadoras.vercel.app/#/${promoterData.organizationId}/register/${promoterData.state}/${promoterData.campaignName ? encodeURIComponent(promoterData.campaignName) : ''}?edit_id=${promoterId}`;
        message = `Olá ${firstName}! 👋\n\nSeu cadastro precisa de um ajuste.\n\nClique para corrigir:\n${editLink}`;
    } else {
        return;
    }

    const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.client_token) headers['Client-Token'] = config.client_token;

    await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ phone: cleanPhone, message: message })
    });
}

async function sendNewPostNotificationWhatsApp(promoterData, postData, assignmentData, promoterId) {
    const config = getConfig().zapi;
    if (!config || !config.instance_id || !config.token) return;

    let cleanPhone = promoterData.whatsapp.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

    const firstName = promoterData.name.split(' ')[0];
    const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoterData.email)}`;
    
    let caption = `✨ *NOVA POSTAGEM* ✨\n\nOlá ${firstName}! Nova publicação disponível.\n\n`;
    if (postData.instructions) caption += `📝 *Instruções:* ${postData.instructions.substring(0, 300)}...\n\n`;
    caption += `👇 *CONFIRA AQUI:* 👇\n${portalLink}`;

    const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.client_token) headers['Client-Token'] = config.client_token;

    await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ phone: cleanPhone, message: caption })
    });
}

// Campaign Sender
exports.sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { messageTemplate, filters, organizationId } = data;
    // Implementation placeholder - actual logic would query promoters and send messages
    return { success: true, count: 0, failures: 0, message: "Campaign sent (simulated)" };
});
