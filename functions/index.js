
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

// Helper to extract storage path from URL
function getStoragePathFromUrl(url) {
    if (!url.includes('/o/')) return null;
    try {
        const decodedUrl = decodeURIComponent(url);
        const startIndex = decodedUrl.indexOf('/o/') + 3;
        const endIndex = decodedUrl.indexOf('?');
        return decodedUrl.substring(startIndex, endIndex !== -1 ? endIndex : undefined);
    } catch (e) {
        return null;
    }
}

// --- Helper: Link to Leave Group ---
function getLeaveGroupLink(promoterId, campaignName, orgId) {
    const baseUrl = 'https://divulgadoras.vercel.app';
    const encodedCampaign = encodeURIComponent(campaignName || '');
    return `${baseUrl}/#/leave-group?promoterId=${promoterId}&campaignName=${encodedCampaign}&orgId=${orgId}`;
}

// --- Firestore Triggers ---

exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

      const isEligibleForAutoAssign = newValue.status === 'approved' && newValue.hasJoinedGroup === true;
      const wasEligibleForAutoAssign = oldValue.status === 'approved' && oldValue.hasJoinedGroup === true;

      if (isEligibleForAutoAssign && !wasEligibleForAutoAssign) {
        try {
            const postsQuery = db.collection('posts')
                .where('organizationId', '==', newValue.organizationId)
                .where('isActive', '==', true)
                .where('autoAssignToNewPromoters', '==', true)
                .where('stateAbbr', '==', newValue.state)
                .where('campaignName', '==', newValue.campaignName);

            const postsSnap = await postsQuery.get();

            if (!postsSnap.empty) {
                const batch = db.batch();
                let assignCount = 0;

                const existingAssignmentsQuery = db.collection('postAssignments')
                    .where('promoterId', '==', promoterId)
                    .where('organizationId', '==', newValue.organizationId);
                
                const existingSnap = await existingAssignmentsQuery.get();
                const existingPostIds = new Set(existingSnap.docs.map(doc => doc.data().postId));

                postsSnap.forEach(postDoc => {
                    if (existingPostIds.has(postDoc.id)) return;

                    const postData = postDoc.data();
                    const now = new Date();
                    if (postData.expiresAt) {
                        const expires = postData.expiresAt.toDate ? postData.expiresAt.toDate() : new Date(postData.expiresAt);
                        if (now > expires) return;
                    }

                    const assignmentRef = db.collection('postAssignments').doc();
                    batch.set(assignmentRef, {
                        postId: postDoc.id,
                        post: postData,
                        organizationId: newValue.organizationId,
                        promoterId: promoterId,
                        promoterEmail: newValue.email,
                        promoterName: newValue.name,
                        status: 'pending',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    assignCount++;
                });

                if (assignCount > 0) {
                    await batch.commit();
                }
            }
        } catch (error) {
            console.error("[Auto-Assign Error]", error);
        }
      }

      const statusChanged = newValue.status !== oldValue.status;
      if (statusChanged && (newValue.status === "approved" || newValue.status === "rejected_editable")) {
        try {
            const orgDoc = await db.collection("organizations").doc(newValue.organizationId).get();
            const orgData = orgDoc.exists ? orgDoc.data() : {};
            if (orgData.whatsappNotificationsEnabled !== false && newValue.whatsapp) {
                await sendWhatsAppStatusChange(newValue, promoterId);
            }
        } catch (waError) {
            console.error(`[WhatsApp Error]`, waError);
        }
      }
    });

exports.onPostAssignmentCreated = functions.region("southamerica-east1").firestore
    .document("postAssignments/{assignmentId}")
    .onCreate(async (snap, context) => {
        const assignmentData = snap.data();
        if (!assignmentData) return;

        try {
            const orgDoc = await db.collection("organizations").doc(assignmentData.organizationId).get();
            if (orgDoc.exists && orgDoc.data().whatsappNotificationsEnabled === false) return;

            const promoterDoc = await db.collection("promoters").doc(assignmentData.promoterId).get();
            if (promoterDoc.exists) {
                const promoterData = promoterDoc.data();
                if (promoterData.whatsapp) {
                    await sendNewPostNotificationWhatsApp(promoterData, assignmentData.post, assignmentData, assignmentData.promoterId);
                }
            }
        } catch (error) {
            console.error(`[Notification Error] assignment ${context.params.assignmentId}:`, error);
        }
    });

// --- Callable Functions ---

exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId, promoterIds } = data;
    if (!postId || !promoterIds || !Array.isArray(promoterIds)) {
        throw new functions.https.HttpsError("invalid-argument", "Parâmetros inválidos.");
    }

    try {
        const postDoc = await db.collection("posts").doc(postId).get();
        if (!postDoc.exists) throw new functions.https.HttpsError("not-found", "Post não encontrado.");
        const postData = postDoc.data();

        const batch = db.batch();
        const promoterDocs = await Promise.all(promoterIds.map(id => db.collection("promoters").doc(id).get()));

        promoterDocs.forEach(pSnap => {
            if (!pSnap.exists) return;
            const p = pSnap.data();
            const assignmentRef = db.collection("postAssignments").doc();
            batch.set(assignmentRef, {
                postId,
                post: postData,
                organizationId: postData.organizationId,
                promoterId: pSnap.id,
                promoterEmail: p.email,
                promoterName: p.name,
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        return { success: true };
    } catch (e) {
        console.error("Error in addAssignmentsToPost:", e);
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
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
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.manuallySendStatusEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { promoterId } = data;
    try {
        const promoterDoc = await db.collection("promoters").doc(promoterId).get();
        if (!promoterDoc.exists) throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        const promoterData = promoterDoc.data();
        await sendWhatsAppStatusChange(promoterData, promoterId);
        return { success: true, message: "Notificação enviada." };
    } catch (error) {
        console.error("Error manually sending status:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

exports.sendPendingReminders = functions.region("southamerica-east1").runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { postId } = data;
    if (!postId) throw new functions.https.HttpsError("invalid-argument", "Post ID obrigatório.");

    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) return { count: 0, message: "Post não encontrado." };
        const post = postDoc.data();

        const assignmentsSnap = await db.collection('postAssignments')
            .where('postId', '==', postId)
            .where('status', '==', 'pending')
            .get();

        if (assignmentsSnap.empty) return { count: 0, message: "Nenhuma tarefa pendente." };

        const config = getConfig();
        const zapiConfig = config.zapi;
        let waSentCount = 0;

        for (const doc of assignmentsSnap.docs) {
            const assignment = doc.data();
            const promoterId = assignment.promoterId;
            const firstName = assignment.promoterName ? assignment.promoterName.split(' ')[0] : 'Divulgadora';
            const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(assignment.promoterEmail)}`;
            const leaveLink = getLeaveGroupLink(promoterId, post.campaignName, post.organizationId);

            if (zapiConfig?.instance_id && zapiConfig?.token) {
                try {
                    let phone = assignment.promoterWhatsapp;
                    if (!phone) {
                        const pDoc = await db.collection('promoters').doc(promoterId).get();
                        if (pDoc.exists) phone = pDoc.data().whatsapp;
                    }

                    if (phone) {
                        let cleanPhone = phone.replace(/\D/g, '');
                        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
                        if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

                        const message = `Olá ${firstName}! ⏳\n\nConsta como pendente a sua postagem para *${post.eventName || post.campaignName}*.\n\nPor favor, realize a postagem e confirme no painel.\n\nAcesse aqui: ${portalLink}\n\nCaso queira sair do grupo, clique aqui: ${leaveLink}`;
                        
                        await fetch(`https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(zapiConfig.client_token && { 'Client-Token': zapiConfig.client_token }) },
                            body: JSON.stringify({ phone: cleanPhone, message })
                        });
                        waSentCount++;
                    }
                } catch (e) { console.error(e); }
            }
        }

        return { count: waSentCount, message: `${waSentCount} lembretes enviados via WhatsApp.` };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});

exports.sendPostReminder = functions.region("southamerica-east1").runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { postId } = data;
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        const post = postDoc.data();
        const assignmentsSnap = await db.collection('postAssignments').where('postId', '==', postId).where('status', '==', 'confirmed').get();
        const pendingProofAssignments = assignmentsSnap.docs.map(doc => doc.data()).filter(a => !a.proofSubmittedAt && !a.justification);
        if (pendingProofAssignments.length === 0) return { count: 0, message: "Ninguém pendente." };

        const zapi = getConfig().zapi;
        let count = 0;
        for (const a of pendingProofAssignments) {
            try {
                let phone = a.promoterWhatsapp;
                if (!phone) {
                    const p = await db.collection('promoters').doc(a.promoterId).get();
                    if (p.exists) phone = p.data().whatsapp;
                }
                if (phone && zapi?.instance_id) {
                    let cleanPhone = phone.replace(/\D/g, '');
                    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
                    const message = `Olá! 📸\n\nVocê confirmou a postagem para *${post.eventName || post.campaignName}*, mas ainda não enviou o print.\n\nEnvie agora: https://divulgadoras.vercel.app/#/proof/${a.id}`;
                    await fetch(`https://api.z-api.io/instances/${zapi.instance_id}/token/${zapi.token}/send-text`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: cleanPhone, message })
                    });
                    count++;
                }
            } catch (e) { console.error(e); }
        }
        return { count, message: `${count} lembretes enviados.` };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.analyzeCampaignProofs = functions.region("southamerica-east1").runWith({ timeoutSeconds: 300, memory: "1GB" }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { organizationId, campaignName, postId } = data;
    try {
        let query = db.collection("postAssignments").where("organizationId", "==", organizationId);
        if (postId) query = query.where("postId", "==", postId);
        else query = query.where("post.campaignName", "==", campaignName);
        const snap = await query.get();
        if (snap.empty) return { count: 0, sizeBytes: 0 };
        const bucket = admin.storage().bucket();
        let totalSize = 0;
        let fileCount = 0;
        for (const doc of snap.docs) {
            const urls = doc.data().proofImageUrls || [];
            for (const url of urls) {
                const path = getStoragePathFromUrl(url);
                if (path) {
                    try {
                        const [meta] = await bucket.file(path).getMetadata();
                        totalSize += parseInt(meta.size, 10);
                        fileCount++;
                    } catch (e) {}
                }
            }
        }
        return { count: fileCount, sizeBytes: totalSize, formattedSize: (totalSize / 1048576).toFixed(2) + ' MB' };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.deleteCampaignProofs = functions.region("southamerica-east1").runWith({ timeoutSeconds: 540, memory: "1GB" }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { organizationId, campaignName, postId } = data;
    try {
        let query = db.collection("postAssignments").where("organizationId", "==", organizationId);
        if (postId) query = query.where("postId", "==", postId);
        else query = query.where("post.campaignName", "==", campaignName);
        const snap = await query.limit(50).get();
        const bucket = admin.storage().bucket();
        let deleted = 0;
        const batch = db.batch();
        for (const doc of snap.docs) {
            const urls = doc.data().proofImageUrls || [];
            if (urls.length > 0 && urls[0] !== 'DELETED_PROOF') {
                for (const url of urls) {
                    const path = getStoragePathFromUrl(url);
                    if (path) {
                        try { await bucket.file(path).delete(); deleted++; } catch (e) {}
                    }
                }
                batch.update(doc.ref, { proofImageUrls: ['DELETED_PROOF'], proofDeletedAt: admin.firestore.FieldValue.serverTimestamp() });
            }
        }
        if (deleted > 0) await batch.commit();
        return { success: true, deletedFiles: deleted, updatedDocs: snap.size, hasMore: snap.size === 50 };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.cleanupOldProofs = functions.region("southamerica-east1").runWith({ timeoutSeconds: 540, memory: "1GB" }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { organizationId } = data;
    try {
        const postsSnap = await db.collection("posts").where("organizationId", "==", organizationId).where("isActive", "==", false).get();
        if (postsSnap.empty) return { count: 0, message: "Nada para limpar." };
        const bucket = admin.storage().bucket();
        let count = 0;
        for (const postDoc of postsSnap.docs) {
            const assignments = await db.collection("postAssignments").where("postId", "==", postDoc.id).get();
            const batch = db.batch();
            let bCount = 0;
            for (const doc of assignments.docs) {
                const urls = doc.data().proofImageUrls || [];
                if (urls.length > 0 && urls[0] !== 'DELETED_PROOF' && urls[0] !== 'manual') {
                    for (const url of urls) {
                        const path = getStoragePathFromUrl(url);
                        if (path) try { await bucket.file(path).delete(); count++; } catch(e) {}
                    }
                    batch.update(doc.ref, { proofImageUrls: ['DELETED_PROOF'], proofDeletedAt: admin.firestore.FieldValue.serverTimestamp() });
                    bCount++;
                }
            }
            if (bCount > 0) await batch.commit();
        }
        return { count, message: `Limpeza concluída! ${count} arquivos removidos.` };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.cleanupDuplicateReminders = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    try {
        const snap = await db.collection("whatsAppReminders").where("status", "==", "pending").get();
        if (snap.empty) return { count: 0 };
        const map = new Map();
        const toDelete = [];
        snap.docs.forEach(doc => {
            const id = doc.data().assignmentId;
            const time = doc.data().createdAt?.toMillis() || 0;
            if (map.has(id)) {
                const prev = map.get(id);
                if (time > prev.time) { toDelete.push(db.collection("whatsAppReminders").doc(prev.docId)); map.set(id, { docId: doc.id, time }); }
                else toDelete.push(doc.ref);
            } else map.set(id, { docId: doc.id, time });
        });
        const batches = [];
        while (toDelete.length) {
            const b = db.batch();
            toDelete.splice(0, 450).forEach(ref => b.delete(ref));
            batches.push(b.commit());
        }
        await Promise.all(batches);
        return { count: toDelete.length };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.scheduleWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { assignmentId } = data;
    try {
        const snap = await db.collection("postAssignments").doc(assignmentId).get();
        const a = snap.data();
        const pSnap = await db.collection("promoters").doc(a.promoterId).get();
        const phone = pSnap.data().whatsapp;
        if (!phone) throw new Error("Sem telefone.");
        const sendAt = admin.firestore.Timestamp.fromMillis(Date.now() + 21600000); 
        await db.collection("whatsAppReminders").add({
            assignmentId, promoterId: a.promoterId, promoterName: a.promoterName, promoterEmail: a.promoterEmail,
            promoterWhatsapp: phone, postId: a.postId, postCampaignName: a.post?.campaignName || "Evento",
            organizationId: a.organizationId, status: 'pending', sendAt, createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await db.collection("postAssignments").doc(assignmentId).update({ whatsAppReminderRequestedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.sendWhatsAppReminderNow = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { reminderId } = data;
    const config = getConfig().zapi;
    try {
        const snap = await db.collection("whatsAppReminders").doc(reminderId).get();
        const r = snap.data();
        let phone = r.promoterWhatsapp.replace(/\D/g, '');
        if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
        const msg = `Olá! 📸\n\nLembrete de print para o evento *${r.postCampaignName}*.\n\nEnvie agora: https://divulgadoras.vercel.app/#/proof/${r.assignmentId}`;
        const res = await fetch(`https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(config.client_token && { 'Client-Token': config.client_token }) },
            body: JSON.stringify({ phone, message: msg })
        });
        if (res.ok) {
            await db.collection("whatsAppReminders").doc(reminderId).update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
            return { success: true };
        } else throw new Error(await res.text());
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

// --- Helper Functions ---

async function sendWhatsAppStatusChange(promoterData, promoterId) {
    const config = getConfig().zapi;
    if (!config?.instance_id) return;
    let phone = promoterData.whatsapp.replace(/\D/g, '');
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
    let message = "";
    if (promoterData.status === 'approved') {
        message = `Olá! Parabéns 🥳\n\nSeu cadastro foi APROVADO!\n\nAcesse seu painel: https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;
    } else if (promoterData.status === 'rejected_editable') {
        message = `Olá! 👋\n\nSeu cadastro precisa de um ajuste. Corrija aqui: https://divulgadoras.vercel.app/#/${promoterData.organizationId}/register/${promoterData.state}/${encodeURIComponent(promoterData.campaignName || '')}?edit_id=${promoterId}`;
    } else return;
    await fetch(`https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.client_token && { 'Client-Token': config.client_token }) },
        body: JSON.stringify({ phone, message })
    });
}

async function sendNewPostNotificationWhatsApp(promoterData, postData, assignmentData, promoterId) {
    const config = getConfig().zapi;
    if (!config?.instance_id) return;
    let phone = promoterData.whatsapp.replace(/\D/g, '');
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
    const caption = `✨ *NOVA POSTAGEM* ✨\n\nOlá! Nova publicação disponível.\n\n👇 *CONFIRA AQUI:* 👇\nhttps://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoterData.email)}`;
    let endpoint = 'send-text';
    let body = { phone, message: caption };
    const mediaUrl = await (postData.mediaUrl?.startsWith('http') ? Promise.resolve(postData.mediaUrl) : getSignedUrl(postData.mediaUrl));
    if (mediaUrl) {
        if (postData.type === 'image') { endpoint = 'send-image'; body = { phone, image: mediaUrl, caption }; }
        else if (postData.type === 'video') { endpoint = 'send-video'; body = { phone, video: mediaUrl, caption }; }
    }
    await fetch(`https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.client_token && { 'Client-Token': config.client_token }) },
        body: JSON.stringify(body)
    });
}
