
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

// --- Helpers for Media ---

// Generate Signed URL for Firebase Storage files
async function getSignedUrl(storagePath) {
    try {
        if (!storagePath) return null;
        if (storagePath.startsWith('http')) return storagePath; // Already a URL

        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        
        const [exists] = await file.exists();
        if (!exists) return null;

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 48, // 48 hours
        });
        return url;
    } catch (e) {
        console.error("[Z-API] Failed to generate signed URL:", e);
        return null;
    }
}

// Convert Drive View URL to Direct Download URL
function convertDriveToDirectLink(url) {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('drive.google.com')) return url;
    
    let id = null;
    const patterns = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            id = match[1];
            break;
        }
    }
    if (id) {
        return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    return url;
}

// --- Firestore Triggers ---

exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

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

// Nova função para limpar comprovações antigas
exports.cleanupOldProofs = functions.region("southamerica-east1").runWith({ timeoutSeconds: 540, memory: "1GB" }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    
    // Check if user is superadmin or owner (simplified check, ideally verify role)
    const { organizationId } = data;
    if (!organizationId) throw new functions.https.HttpsError("invalid-argument", "Organização não informada.");

    try {
        // 1. Find Inactive Posts for this Org
        const postsSnap = await db.collection("posts")
            .where("organizationId", "==", organizationId)
            .where("isActive", "==", false)
            .get();

        if (postsSnap.empty) {
            return { success: true, count: 0, message: "Nenhum post inativo encontrado." };
        }

        const inactivePostIds = postsSnap.docs.map(doc => doc.id);
        const bucket = admin.storage().bucket();
        let deletedFilesCount = 0;
        let updatedDocsCount = 0;

        // Process in chunks of posts to avoid memory issues
        const CHUNK_SIZE = 10;
        for (let i = 0; i < inactivePostIds.length; i += CHUNK_SIZE) {
            const chunk = inactivePostIds.slice(i, i + CHUNK_SIZE);
            
            // Find assignments with proofs for these posts
            const assignmentsSnap = await db.collection("postAssignments")
                .where("postId", "in", chunk)
                .get();

            const batch = db.batch();
            let batchCount = 0;

            for (const doc of assignmentsSnap.docs) {
                const assignment = doc.data();
                const proofUrls = assignment.proofImageUrls || [];
                
                if (proofUrls.length > 0 && proofUrls[0] !== 'manual') {
                    let fileDeleted = false;

                    // Delete files from storage
                    for (const url of proofUrls) {
                        try {
                            // Extract path from URL. Format: .../o/folder%2Ffilename?alt...
                            const decodedUrl = decodeURIComponent(url);
                            const startIndex = decodedUrl.indexOf('/o/') + 3;
                            const endIndex = decodedUrl.indexOf('?');
                            const storagePath = decodedUrl.substring(startIndex, endIndex);

                            const file = bucket.file(storagePath);
                            const [exists] = await file.exists();
                            if (exists) {
                                await file.delete();
                                deletedFilesCount++;
                                fileDeleted = true;
                            }
                        } catch (err) {
                            console.warn(`Failed to delete file for assignment ${doc.id}:`, err);
                        }
                    }

                    // Update Firestore to remove URLs
                    if (fileDeleted || proofUrls.length > 0) {
                        batch.update(doc.ref, { 
                            proofImageUrls: [],
                            proofDeletedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        batchCount++;
                        updatedDocsCount++;
                    }
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }
        }

        return { 
            success: true, 
            count: deletedFilesCount, 
            docsUpdated: updatedDocsCount,
            message: `Limpeza concluída! ${deletedFilesCount} imagens apagadas em ${updatedDocsCount} tarefas.` 
        };

    } catch (error) {
        console.error("Error cleaning up proofs:", error);
        throw new functions.https.HttpsError("internal", "Erro ao limpar comprovações.");
    }
});

// 1. Limpar Duplicados (Restaurado)
exports.cleanupDuplicateReminders = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");

    try {
        const snapshot = await db.collection("whatsAppReminders")
            .where("status", "==", "pending")
            .get();

        if (snapshot.empty) return { count: 0 };

        const assignmentMap = new Map(); // assignmentId -> { docId, createdAt }
        const docsToDelete = [];

        snapshot.docs.forEach(doc => {
            const rData = doc.data();
            const assignmentId = rData.assignmentId;
            const createdAt = rData.createdAt && rData.createdAt.toMillis ? rData.createdAt.toMillis() : 0;

            if (assignmentMap.has(assignmentId)) {
                const existing = assignmentMap.get(assignmentId);
                // Keep the one created MOST RECENTLY
                if (createdAt > existing.createdAt) {
                    docsToDelete.push(db.collection("whatsAppReminders").doc(existing.docId));
                    assignmentMap.set(assignmentId, { docId: doc.id, createdAt });
                } else {
                    docsToDelete.push(doc.ref);
                }
            } else {
                assignmentMap.set(assignmentId, { docId: doc.id, createdAt });
            }
        });

        let deletedCount = docsToDelete.length;
        const batches = [];
        while (docsToDelete.length) {
            const batch = db.batch();
            docsToDelete.splice(0, 450).forEach(ref => batch.delete(ref));
            batches.push(batch.commit());
        }

        await Promise.all(batches);
        return { count: deletedCount };
    } catch (error) {
        console.error("Error cleaning up duplicates:", error);
        throw new functions.https.HttpsError("internal", "Erro ao limpar duplicados.");
    }
});

// 2. Agendar Lembrete (Restaurado)
exports.scheduleWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { assignmentId } = data;
    if (!assignmentId) throw new functions.https.HttpsError("invalid-argument", "ID da tarefa obrigatório.");

    try {
        const assignmentRef = db.collection("postAssignments").doc(assignmentId);
        const assignmentSnap = await assignmentRef.get();
        if (!assignmentSnap.exists) throw new functions.https.HttpsError("not-found", "Tarefa não encontrada.");
        
        const assignment = assignmentSnap.data();

        // Check duplicates
        const existingReminderQuery = await db.collection("whatsAppReminders")
            .where("assignmentId", "==", assignmentId)
            .where("status", "==", "pending")
            .limit(1)
            .get();

        if (!existingReminderQuery.empty) {
            return { success: true, message: "Lembrete já estava agendado." };
        }

        const promoterRef = db.collection("promoters").doc(assignment.promoterId);
        const promoterSnap = await promoterRef.get();
        const promoterData = promoterSnap.exists ? promoterSnap.data() : {};
        const phone = promoterData.whatsapp || "";

        if (!phone) {
            throw new functions.https.HttpsError("failed-precondition", "Divulgadora sem WhatsApp cadastrado.");
        }

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

// 3. Enviar Agora (Restaurado)
exports.sendWhatsAppReminderNow = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { reminderId } = data;
    if (!reminderId) throw new functions.https.HttpsError("invalid-argument", "ID obrigatório.");

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

        const message = `Olá ${firstName}! 📸\n\nPassando para lembrar de enviar o *print* da sua publicação no evento *${reminder.postCampaignName}*.\n\nPara garantir sua presença na lista, clique no link abaixo e envie agora:\n${portalLink}`;

        const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`;
        const headers = { 'Content-Type': 'application/json' };
        if (config.client_token) headers['Client-Token'] = config.client_token;

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ phone: cleanPhone, message: message })
        });

        if (response.ok) {
            await reminderRef.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
            return { success: true };
        } else {
            const errText = await response.text();
            console.error("Z-API Error:", errText);
            await reminderRef.update({ status: 'error', error: errText });
            throw new Error("Falha na API do WhatsApp");
        }
    } catch (error) {
        console.error("Error sending reminder:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

exports.testZapi = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const config = getConfig().zapi;
    return {
        configFound: !!config,
        timestamp: new Date().toISOString()
    };
});

exports.sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    // Implementation placeholder for campaign
    return { success: true, count: 0, failures: 0, message: "Campaign sent (simulated)" };
});

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postData, assignedPromoters } = data;
    try {
        const batch = db.batch();
        const postRef = db.collection("posts").doc();
        batch.set(postRef, { ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
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

// --- Helper Functions ---

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

// 4. Enviar Post com Mídia (Restaurado e Melhorado)
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

    // Logic for Media
    let endpoint = 'send-text';
    let body = { phone: cleanPhone, message: caption };

    if (postData.type === 'image' || postData.type === 'video') {
        try {
            let mediaUrl = null;
            // A) Firebase Storage
            if (postData.mediaUrl && typeof postData.mediaUrl === 'string') {
                if (postData.mediaUrl.startsWith('http')) {
                    mediaUrl = convertDriveToDirectLink(postData.mediaUrl);
                } else if (!postData.mediaUrl.includes('drive.google.com')) {
                    mediaUrl = await getSignedUrl(postData.mediaUrl);
                }
            }
            // B) Google Drive fallback
            if (!mediaUrl && postData.googleDriveUrl && typeof postData.googleDriveUrl === 'string') {
                 mediaUrl = convertDriveToDirectLink(postData.googleDriveUrl);
            }

            if (mediaUrl && mediaUrl.startsWith('http')) {
                if (postData.type === 'image') {
                    endpoint = 'send-image';
                    body = { phone: cleanPhone, image: mediaUrl, caption: caption };
                } else if (postData.type === 'video') {
                    endpoint = 'send-video';
                    body = { phone: cleanPhone, video: mediaUrl, caption: caption };
                }
            }
        } catch (mediaError) {
            console.error("Error resolving media, sending text only:", mediaError);
        }
    }

    const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.client_token) headers['Client-Token'] = config.client_token;

    await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
}
