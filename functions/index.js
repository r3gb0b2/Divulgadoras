
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { Readable } = require("stream");


// Brevo (formerly Sendinblue) SDK for sending transactional emails
const Brevo = require("@getbrevo/brevo");

// Stripe SDK for payments
const stripe = require("stripe")(functions.config().stripe.secret_key);


// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
// IMPORTANT: This setting prevents the server from crashing if 'undefined' is passed in an update object
db.settings({ ignoreUndefinedProperties: true });


// --- Brevo API Client Initialization ---
const brevoConfig = functions.config().brevo;
let brevoApiInstance;
if (brevoConfig && brevoConfig.key) {
  const defaultClient = Brevo.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = brevoConfig.key;
  brevoApiInstance = new Brevo.TransactionalEmailsApi();
}

const getBrevoErrorDetails = (error) => {
  let details = "An unknown Brevo API error occurred.";
  if (error.response && error.response.body) {
    try {
      const bodyString = error.response.body.toString();
      const bodyJson = JSON.parse(bodyString);
      details = `[${bodyJson.code}] ${bodyJson.message}`;
    } catch (parseError) {
      details = `Could not parse error response. Raw: ${error.response.body.toString()}`;
    }
  } else if (error.message) {
    details = error.message;
  }
  return details;
};

// --- Safe String Helpers ---
const safeTrim = (val) => (typeof val === 'string' ? val.trim() : val);
const safeLower = (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val);

// --- Helper: Increment Email Usage ---
const incrementOrgEmailCount = async (organizationId) => {
    if (!organizationId) return;
    try {
        const orgRef = db.collection("organizations").doc(organizationId);
        await orgRef.update({
            "usageStats.emailsSent": admin.firestore.FieldValue.increment(1)
        });
    } catch (e) {
        console.error(`Failed to increment email count for org ${organizationId}`, e);
    }
};


// --- Email Template Management ---
const EMAIL_TEMPLATE_DOC_PATH = "settings/approvedEmailTemplate";

const DEFAULT_APPROVED_TEMPLATE_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Cadastro Aprovado!</title>
    <style>
        body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
        .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; }
        .header { background-color: #e83a93; color: #ffffff; padding: 20px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background-color: #e83a93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>Parabéns, {{promoterName}}!</h1></div>
        <div class="content">
            <p>Temos uma ótima notícia! Seu cadastro para o evento <strong>{{campaignName}}</strong> da <strong>{{orgName}}</strong> foi aprovado.</p>
            <p>Estamos muito felizes em ter você em nosso time de divulgadoras.</p>
            <p>Para continuar, acesse o seu portal exclusivo, onde você encontrará as regras do evento e o link para o grupo oficial no WhatsApp.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{{portalLink}}" class="button">Acessar Portal da Divulgadora</a>
            </p>
            <p>Qualquer dúvida, entre em contato.</p>
            <p>Atenciosamente,<br>Equipe {{orgName}}</p>
        </div>
    </div>
</body>
</html>`;


const isSuperAdmin = async (uid) => {
  if (!uid) return false;
  const adminDoc = await db.collection("admins").doc(uid).get();
  return adminDoc.exists && adminDoc.data().role === "superadmin";
};


// --- Firestore Triggers ---

exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

      const justJoinedGroup = oldValue.hasJoinedGroup !== true && newValue.hasJoinedGroup === true;
      const isApproved = newValue.status === "approved";

      if (isApproved && justJoinedGroup) {
        try {
          console.log(`[Auto-Assign Trigger] Promoter ${promoterId} joined group. Assigning posts.`);
          await assignPostsToNewPromoter(newValue, promoterId);
        } catch (error) {
          console.error(`[Auto-Assign Trigger] Failed for promoter ${promoterId}:`, error);
        }
      }

      const statusChanged = newValue.status !== oldValue.status;
      const isNotificationStatus =
        newValue.status === "approved" ||
        newValue.status === "rejected" ||
        newValue.status === "rejected_editable";

      if (statusChanged && isNotificationStatus) {
        try {
          await sendStatusChangeEmail(newValue, promoterId);
        } catch (error) {
          console.error(`[Email Trigger] Failed to send status change email for promoter ${promoterId}:`, error);
        }
      }
    });

exports.onPostAssignmentCreated = functions.region("southamerica-east1").firestore
    .document("postAssignments/{assignmentId}")
    .onCreate(async (snap, context) => {
        const assignmentData = snap.data();
        if (!assignmentData) return;

        const { organizationId, promoterId, promoterEmail, promoterName, post } = assignmentData;
        if (!organizationId || !promoterId || !promoterEmail || !promoterName || !post) return;

        try {
            const orgDoc = await db.collection("organizations").doc(organizationId).get();
            const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Organização";

            await sendNewPostNotificationEmail(
                { email: promoterEmail, name: promoterName, id: promoterId },
                {
                    campaignName: post.campaignName,
                    eventName: post.eventName,
                    orgName: orgName,
                    organizationId: organizationId,
                }
            );
        } catch (error) {
            console.error(`Failed to send notification for assignment ${context.params.assignmentId}:`, error);
        }
    });


async function assignPostsToNewPromoter(promoterData, promoterId) {
    const { organizationId, state: stateAbbr, campaignName } = promoterData;
    if (!organizationId || !stateAbbr) return;

    const now = admin.firestore.Timestamp.now();
    const postsToAssign = new Map();

    const baseQuery = db.collection("posts")
        .where("organizationId", "==", organizationId)
        .where("stateAbbr", "==", stateAbbr)
        .where("autoAssignToNewPromoters", "==", true)
        .where("isActive", "==", true);

    if (campaignName) {
        const specificPostsQuery = baseQuery.where("campaignName", "==", campaignName);
        const snapshot = await specificPostsQuery.get();
        snapshot.forEach(doc => postsToAssign.set(doc.id, { id: doc.id, data: doc.data() }));
    }

    const generalPostsQuery = baseQuery.where("campaignName", "==", null);
    const generalSnapshot = await generalPostsQuery.get();
    generalSnapshot.forEach(doc => postsToAssign.set(doc.id, { id: doc.id, data: doc.data() }));

    if (postsToAssign.size === 0) return;

    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    for (const postInfo of postsToAssign.values()) {
        const post = postInfo.data;
        const postId = postInfo.id;

        if (post.expiresAt && post.expiresAt.toDate() < now.toDate()) {
            continue;
        }

        const assignmentDocRef = assignmentsCollectionRef.doc();
        const newAssignment = {
            postId: postId,
            post: {
                type: post.type,
                mediaUrl: post.mediaUrl || null,
                googleDriveUrl: post.googleDriveUrl || null,
                textContent: post.textContent || null,
                instructions: post.instructions,
                postLink: post.postLink || null,
                campaignName: post.campaignName,
                eventName: post.eventName || null,
                isActive: post.isActive,
                expiresAt: post.expiresAt || null,
                createdAt: post.createdAt,
                allowLateSubmissions: post.allowLateSubmissions || false,
                allowImmediateProof: post.allowImmediateProof || false,
                postFormats: post.postFormats || [],
                skipProofRequirement: post.skipProofRequirement || false,
                allowJustification: post.allowJustification !== false,
            },
            organizationId: promoterData.organizationId,
            promoterId: promoterId,
            promoterEmail: promoterData.email.toLowerCase(),
            promoterName: promoterData.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentDocRef, newAssignment);
    }

    await batch.commit();
}


async function sendStatusChangeEmail(promoterData, promoterId) {
  if (!brevoApiInstance || !promoterData || !promoterData.email) return;

  const { orgName } = await getOrgAndCampaignDetails(
      promoterData.organizationId,
      promoterData.state,
      promoterData.campaignName,
  );

  const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoterData.email, name: promoterData.name }];
  sendSmtpEmail.sender = {
    name: orgName || "Equipe de Eventos",
    email: brevoConfig.sender_email,
  };

  const replacements = {
    promoterName: promoterData.name,
    promoterEmail: promoterData.email,
    campaignName: promoterData.campaignName || "nosso time",
    rejectionReason: promoterData.rejectionReason || "",
    orgName: orgName || "Nossa Organização",
    portalLink: portalLink,
  };

  if (promoterData.status === "approved") {
    sendSmtpEmail.subject = `Parabéns, seu cadastro para ${replacements.campaignName} foi aprovado!`;
    const templateDoc = await db.doc(EMAIL_TEMPLATE_DOC_PATH).get();
    let htmlTemplate = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE_HTML;

    for (const key in replacements) {
      const placeholder = new RegExp(`{{${key}}}`, "g");
      htmlTemplate = htmlTemplate.replace(placeholder, replacements[key]);
    }
    sendSmtpEmail.htmlContent = htmlTemplate;
  } else if (promoterData.status === "rejected_editable") {
    sendSmtpEmail.subject = `Ação Necessária: Corrija seu cadastro para ${replacements.campaignName}`;
    const editLink = `https://divulgadoras.vercel.app/#/${promoterData.organizationId}/register/${promoterData.state}/${promoterData.campaignName ? encodeURIComponent(promoterData.campaignName) : ""}?edit_id=${promoterId}`;
    const rejectionReasonHtml = promoterData.rejectionReason ? `<p><strong>Motivo:</strong></p><div style="background-color: #ffefef; border-left: 4px solid #f87171; padding: 10px; margin-bottom: 20px;">${promoterData.rejectionReason.replace(/\n/g, "<br/>")}</div>` : "";

    const htmlContent = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Correção de Cadastro Necessária</title><style>body{font-family:sans-serif;background-color:#f4f4f4;color:#333;}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;}.header{background-color:#f97316;color:#ffffff;padding:20px;text-align:center;}.content{padding:30px;}.button{display:inline-block;background-color:#f97316;color:#ffffff;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;}</style></head>
    <body><div class="container"><div class="header"><h1>Olá, ${promoterData.name}!</h1></div><div class="content"><p>Notamos que seu cadastro para o evento <strong>${replacements.campaignName}</strong> precisa de algumas correções.</p>${rejectionReasonHtml}<p>Clique abaixo para corrigir.</p><p style="text-align:center;margin:30px 0;"><a href="${editLink}" class="button">Corrigir Meu Cadastro</a></p><p>Atenciosamente,<br>Equipe ${replacements.orgName}</p></div></div></body></html>`;
    sendSmtpEmail.htmlContent = htmlContent;
  } else { 
    sendSmtpEmail.subject = "Atualização sobre seu cadastro";
    sendSmtpEmail.templateId = 11; 
    sendSmtpEmail.params = replacements;
  }

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    await incrementOrgEmailCount(promoterData.organizationId);
  } catch (error) {
    console.error(`[Brevo API Error] Failed to send email to ${promoterData.email}.`, getBrevoErrorDetails(error));
  }
}

async function sendNewPostNotificationEmail(promoter, postDetails) {
  if (!brevoApiInstance) return;

  const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.email)}`;
  const leaveGroupLink = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoter.id}&campaignName=${encodeURIComponent(postDetails.campaignName)}&orgId=${postDetails.organizationId}`;
  const eventDisplayName = postDetails.eventName ? `${postDetails.campaignName} - ${postDetails.eventName}` : postDetails.campaignName;
  const subject = `Nova Publicação Disponível - ${eventDisplayName}`;
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;background-color:#f4f4f4;color:#333;}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;}.header{background-color:#1a1a2e;color:#ffffff;padding:20px;text-align:center;}.content{padding:30px;}.footer{padding:20px;text-align:center;font-size:12px;color:#888;}.button{display:inline-block;background-color:#e83a93;color:#ffffff;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;}</style></head><body><div class="container"><div class="header"><h1>Olá, ${promoter.name}!</h1></div><div class="content"><p>Nova publicação para <strong>${eventDisplayName}</strong>.</p><p style="text-align:center;margin:30px 0;"><a href="${portalLink}" class="button">Ver Publicação</a></p><p>Atenciosamente,<br>Equipe ${postDetails.orgName}</p></div><div class="footer"><p><a href="${leaveGroupLink}">Sair do grupo</a></p></div></div></body></html>`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoter.email, name: promoter.name }];
  sendSmtpEmail.sender = { name: postDetails.orgName || "Equipe de Eventos", email: brevoConfig.sender_email };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    await incrementOrgEmailCount(postDetails.organizationId);
  } catch (error) {
    console.error(`[Brevo API Error] Failed to send new post email.`, getBrevoErrorDetails(error));
  }
}

async function sendProofReminderEmail(promoter, postDetails) {
  if (!brevoApiInstance) return;
  const proofLink = `https://divulgadoras.vercel.app/#/proof/${promoter.id}`;
  const subject = `Lembrete: Envie a comprovação do post - ${postDetails.campaignName}`;
  const htmlContent = `<!DOCTYPE html><html><body><p>Olá ${promoter.promoterName}, envie seu print para <strong>${postDetails.campaignName}</strong>.</p><a href="${proofLink}">Enviar Comprovação</a></body></html>`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoter.promoterEmail, name: promoter.promoterName }];
  sendSmtpEmail.sender = { name: postDetails.orgName || "Equipe de Eventos", email: brevoConfig.sender_email };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    await incrementOrgEmailCount(promoter.organizationId);
  } catch (error) {
    console.error(`[Brevo API Error] Failed to send proof reminder.`, getBrevoErrorDetails(error));
  }
}

async function sendPendingPostReminderEmail(promoter, postDetails, promoterId) {
  if (!brevoApiInstance) return;
  const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.promoterEmail)}`;
  const subject = `Lembrete: Confirmar post - ${postDetails.campaignName}`;
  const htmlContent = `<!DOCTYPE html><html><body><p>Olá ${promoter.promoterName}, confirme sua postagem para <strong>${postDetails.campaignName}</strong>.</p><a href="${portalLink}">Ver Publicação</a></body></html>`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoter.promoterEmail, name: promoter.promoterName }];
  sendSmtpEmail.sender = { name: postDetails.orgName || "Equipe de Eventos", email: brevoConfig.sender_email };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    await incrementOrgEmailCount(promoter.organizationId);
  } catch (error) {
    console.error(`[Brevo API Error] Failed to send pending reminder.`, getBrevoErrorDetails(error));
  }
}

async function getOrgAndCampaignDetails(organizationId, stateAbbr, campaignName) {
  let orgName = "Equipe de Eventos";
  let campaignRules = "";
  let campaignLink = "#";

  if (organizationId) {
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (orgDoc.exists) orgName = orgDoc.data().name || orgName;
  }

  if (stateAbbr && campaignName && organizationId) {
    const campaignsQuery = db.collection("campaigns").where("organizationId", "==", organizationId).where("stateAbbr", "==", stateAbbr).where("name", "==", campaignName).limit(1);
    const snapshot = await campaignsQuery.get();
    if (!snapshot.empty) {
      const campaignDoc = snapshot.docs[0].data();
      campaignRules = campaignDoc.rules || "";
      campaignLink = campaignDoc.whatsappLink || "#";
    }
  }
  return { orgName, campaignRules, campaignLink };
}

exports.updatePromoterAndSync = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
      const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
      if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) throw new functions.https.HttpsError("permission-denied", "Acesso negado.");

      const { promoterId, data: updateData } = data;
      if (!promoterId || !updateData) throw new functions.https.HttpsError("invalid-argument", "Dados inválidos.");

      const promoterRef = db.collection("promoters").doc(promoterId);

      try {
        const promoterSnap = await promoterRef.get();
        if (!promoterSnap.exists) throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        const oldData = promoterSnap.data();

        const newEmail = updateData.email !== undefined ? safeLower(updateData.email) : oldData.email;
        const newName = updateData.name !== undefined ? safeTrim(updateData.name) : oldData.name;
        const newInstagram = updateData.instagram !== undefined ? safeTrim(updateData.instagram) : oldData.instagram;

        const emailHasChanged = newEmail !== oldData.email;
        const nameHasChanged = newName !== oldData.name;
        const instagramHasChanged = newInstagram !== oldData.instagram;

        await promoterRef.update(updateData);

        if (!emailHasChanged && !nameHasChanged && !instagramHasChanged) {
          return { success: true, message: "Divulgadora atualizada." };
        }

        const fieldsToSync = {};
        if (emailHasChanged) fieldsToSync.promoterEmail = newEmail;
        if (nameHasChanged) fieldsToSync.promoterName = newName;

        const collectionsToSync = ["postAssignments", "guestListConfirmations", "groupRemovalRequests", "guestListChangeRequests"];
        for (const collectionName of collectionsToSync) {
            const query = db.collection(collectionName).where("promoterId", "==", promoterId);
            const snapshot = await query.get();
            if (snapshot.empty) continue;
            const batch = db.batch();
            snapshot.forEach((doc) => batch.update(doc.ref, fieldsToSync));
            await batch.commit();
        }

        if (nameHasChanged || instagramHasChanged) {
            const participantRef = db.collection("followLoopParticipants").doc(promoterId);
            const participantSnap = await participantRef.get();
            if (participantSnap.exists) {
                const pUpdate = {};
                if (nameHasChanged) pUpdate.promoterName = newName;
                if (instagramHasChanged) pUpdate.instagram = newInstagram;
                await participantRef.update(pUpdate);
            }

            const batchUpdate = async (docs, updateFn) => {
                const CHUNK_SIZE = 490; 
                const chunks = [];
                for (let i = 0; i < docs.length; i += CHUNK_SIZE) chunks.push(docs.slice(i, i + CHUNK_SIZE));
                for (const chunk of chunks) {
                    const batch = db.batch();
                    chunk.forEach(doc => updateFn(batch, doc));
                    await batch.commit();
                }
            };

            const asFollowerQuery = db.collection("followInteractions").where("followerId", "==", promoterId);
            const asFollowerSnap = await asFollowerQuery.get();
            if (!asFollowerSnap.empty) {
                await batchUpdate(asFollowerSnap.docs, (batch, doc) => {
                    const iUpdate = {};
                    if (nameHasChanged) iUpdate.followerName = newName;
                    if (instagramHasChanged) iUpdate.followerInstagram = newInstagram;
                    batch.update(doc.ref, iUpdate);
                });
            }

            const asFollowedQuery = db.collection("followInteractions").where("followedId", "==", promoterId);
            const asFollowedSnap = await asFollowedQuery.get();
            if (!asFollowedSnap.empty) {
                await batchUpdate(asFollowedSnap.docs, (batch, doc) => {
                     const iUpdate = {};
                     if (nameHasChanged) iUpdate.followedName = newName;
                     if (instagramHasChanged) iUpdate.followedInstagram = newInstagram;
                     batch.update(doc.ref, iUpdate);
                });
            }
        }

        return { success: true, message: "Divulgadora atualizada e sincronizada." };

      } catch (error) {
        console.error(`Error updating promoter ${promoterId}:`, error);
        throw new functions.https.HttpsError("internal", "Erro interno ao atualizar.", error.message);
      }
    });

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postData, assignedPromoters } = data;
    const batch = db.batch();
    const postRef = db.collection("posts").doc();
    batch.set(postRef, { ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    assignedPromoters.forEach(promoter => {
        const assignmentRef = db.collection("postAssignments").doc();
        const newAssignment = {
            postId: postRef.id,
            post: {
                ...postData,
                skipProofRequirement: postData.skipProofRequirement || false,
                allowJustification: postData.allowJustification !== false,
            },
            organizationId: postData.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentRef, newAssignment);
    });

    await batch.commit();
    return { success: true, postId: postRef.id };
});

exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { postId, promoterIds } = data;
    const postRef = db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    const postData = postSnap.data();

    const promoters = [];
    const promoterChunks = [];
    for (let i = 0; i < promoterIds.length; i += 30) promoterChunks.push(promoterIds.slice(i, i + 30));

    for (const chunk of promoterChunks) {
        const promotersQuery = db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", chunk);
        const snapshot = await promotersQuery.get();
        snapshot.forEach(doc => promoters.push({ id: doc.id, ...doc.data() }));
    }

    const denormalizedPost = {
        type: postData.type,
        mediaUrl: postData.mediaUrl || null,
        googleDriveUrl: postData.googleDriveUrl || null,
        textContent: postData.textContent || null,
        instructions: postData.instructions,
        postLink: postData.postLink || null,
        campaignName: postData.campaignName,
        eventName: postData.eventName || null,
        isActive: postData.isActive,
        expiresAt: postData.expiresAt || null,
        createdAt: postData.createdAt,
        allowLateSubmissions: postData.allowLateSubmissions || false,
        allowImmediateProof: postData.allowImmediateProof || false,
        postFormats: postData.postFormats || [],
        skipProofRequirement: postData.skipProofRequirement || false,
        allowJustification: postData.allowJustification !== false,
    };
    
    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    promoters.forEach(promoter => {
        const assignmentDocRef = assignmentsCollectionRef.doc(); 
        const newAssignment = {
            postId: postId,
            post: denormalizedPost,
            organizationId: postData.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentDocRef, newAssignment);
    });

    await batch.commit();
    return { success: true, count: promoters.length };
});

exports.updatePostStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { postId, updateData } = data;
    
    const postRef = db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    const originalPostData = postSnap.data();

    await postRef.update(updateData);

    const assignmentsRef = db.collection("postAssignments");
    const assignmentsQuery = assignmentsRef.where("postId", "==", postId);
    const assignmentsSnapshot = await assignmentsQuery.get();

    if (assignmentsSnapshot.empty) return { success: true, message: "Post atualizado." };

    const updatedDenormalizedPostData = { ...originalPostData, ...updateData };
    const denormalizedPostObject = {
        type: updatedDenormalizedPostData.type,
        mediaUrl: updatedDenormalizedPostData.mediaUrl || null,
        googleDriveUrl: updatedDenormalizedPostData.googleDriveUrl || null,
        textContent: updatedDenormalizedPostData.textContent || null,
        instructions: updatedDenormalizedPostData.instructions,
        postLink: updatedDenormalizedPostData.postLink || null,
        campaignName: updatedDenormalizedPostData.campaignName,
        eventName: updatedDenormalizedPostData.eventName || null,
        isActive: updatedDenormalizedPostData.isActive,
        expiresAt: updatedDenormalizedPostData.expiresAt || null,
        createdAt: updatedDenormalizedPostData.createdAt,
        allowLateSubmissions: updatedDenormalizedPostData.allowLateSubmissions || false,
        allowImmediateProof: updatedDenormalizedPostData.allowImmediateProof || false,
        postFormats: updatedDenormalizedPostData.postFormats || [],
        skipProofRequirement: updatedDenormalizedPostData.skipProofRequirement || false,
        allowJustification: updatedDenormalizedPostData.allowJustification !== false,
    };
    
    const batch = db.batch();
    assignmentsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { post: denormalizedPostObject });
    });

    await batch.commit();
    return { success: true, message: "Atualizado com sucesso." };
});
