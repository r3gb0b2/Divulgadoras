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


// --- Brevo API Client Initialization ---
// The API key and sender email are configured in the Firebase environment.
// Use the command:
// firebase functions:config:set brevo.key="YOUR_API_KEY" brevo.sender_email="your@verified-sender.com"
const brevoConfig = functions.config().brevo;
let brevoApiInstance;
if (brevoConfig && brevoConfig.key) {
  const defaultClient = Brevo.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = brevoConfig.key;
  brevoApiInstance = new Brevo.TransactionalEmailsApi();
}

/**
 * Helper function to extract detailed error messages from the Brevo SDK.
 * @param {any} error - The error object caught from a Brevo API call.
 * @return {string} A detailed error message.
 */
const getBrevoErrorDetails = (error) => {
  let details = "An unknown Brevo API error occurred.";
  if (error.response && error.response.body) {
    try {
      // Brevo SDK might return the body as a buffer or string
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


/**
 * Helper to check if a user is a super admin.
 * @param {string} uid - The user's UID.
 * @return {Promise<boolean>} True if the user is a super admin.
 */
const isSuperAdmin = async (uid) => {
  if (!uid) return false;
  const adminDoc = await db.collection("admins").doc(uid).get();
  return adminDoc.exists && adminDoc.data().role === "superadmin";
};


// --- Firestore Triggers ---

/**
 * Triggered when a promoter's status is updated.
 * If the new status is 'approved' or 'rejected', it sends a notification email.
 * If it's a new approval, it also checks for and assigns auto-assignable posts.
 */
exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

      // 1. Check for new approvals to auto-assign posts
      const isNewApproval = oldValue.status !== "approved" && newValue.status === "approved";
      if (isNewApproval) {
        try {
          await assignPostsToNewPromoter(newValue, promoterId);
        } catch (error) {
          console.error(`[Auto-Assign Trigger] Failed for promoter ${promoterId}:`, error);
        }
      }

      // 2. Check for status changes to send notification emails
      const statusChanged = newValue.status !== oldValue.status;
      const isApprovalOrRejection =
      newValue.status === "approved" || newValue.status === "rejected";

      if (statusChanged && isApprovalOrRejection) {
        try {
          await sendStatusChangeEmail(newValue);
        } catch (error) {
          console.error(`[Email Trigger] Failed to send status change email for promoter ${promoterId}:`, error);
        }
      }
    });

/**
 * Triggered when a new PostAssignment document is created.
 * This function is responsible for sending the notification email to the promoter in the background.
 */
exports.onPostAssignmentCreated = functions.region("southamerica-east1").firestore
    .document("postAssignments/{assignmentId}")
    .onCreate(async (snap, context) => {
        const assignmentData = snap.data();
        if (!assignmentData) {
            console.error(`No data for new assignment ${context.params.assignmentId}`);
            return;
        }

        const { organizationId, promoterEmail, promoterName, post } = assignmentData;
        if (!organizationId || !promoterEmail || !promoterName || !post) {
            console.error(`Incomplete data for assignment ${context.params.assignmentId}, cannot send notification.`);
            return;
        }

        try {
            const orgDoc = await db.collection("organizations").doc(organizationId).get();
            const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Organização";

            await sendNewPostNotificationEmail(
                { email: promoterEmail, name: promoterName },
                {
                    campaignName: post.campaignName,
                    eventName: post.eventName,
                    orgName: orgName,
                }
            );
        } catch (error) {
            console.error(`Failed to send notification for assignment ${context.params.assignmentId}:`, error);
        }
    });


/**
 * Queries for posts that should be auto-assigned to a newly approved promoter
 * and creates the assignments and notifications.
 * @param {object} promoterData The promoter document data for the new promoter.
 * @param {string} promoterId The ID of the promoter document.
 */
async function assignPostsToNewPromoter(promoterData, promoterId) {
  const { organizationId, state: stateAbbr, campaignName } = promoterData;
  if (!organizationId || !stateAbbr || !campaignName) {
    console.log(`[Auto-Assign] Skipping for promoter ${promoterId} due to missing org/state/campaign. orgId: ${organizationId}, state: ${stateAbbr}, campaign: ${campaignName}`);
    return;
  }

  const now = admin.firestore.Timestamp.now();

  // Find matching posts that are active and set to auto-assign
  const postsQuery = db.collection("posts")
      .where("organizationId", "==", organizationId)
      .where("stateAbbr", "==", stateAbbr)
      .where("campaignName", "==", campaignName)
      .where("autoAssignToNewPromoters", "==", true)
      .where("isActive", "==", true);

  const snapshot = await postsQuery.get();
  if (snapshot.empty) {
    console.log(`[Auto-Assign] No auto-assign posts found for campaign ${campaignName}.`);
    return;
  }

  const batch = db.batch();
  const assignmentsCollectionRef = db.collection("postAssignments");
  
  for (const doc of snapshot.docs) {
    const post = doc.data();
    const postId = doc.id;

    // Filter out expired posts (client-side since we can't have two range filters)
    if (post.expiresAt && post.expiresAt.toDate() < now.toDate()) {
      continue;
    }

    // Create assignment document
    const assignmentDocRef = assignmentsCollectionRef.doc();
    const newAssignment = {
      postId: postId,
      post: { // denormalized data
        type: post.type,
        mediaUrl: post.mediaUrl || null,
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
  // Note: Emails are now sent by the onPostAssignmentCreated, so no email logic is needed here.
  console.log(`[Auto-Assign] Created new assignments for promoter ${promoterId}.`);
}


/**
 * Sends a status change email to a promoter.
 * For 'approved' status, it uses the custom HTML template from Firestore.
 * For 'rejected' status, it uses a fixed template ID from Brevo.
 * @param {object} promoterData The promoter document data.
 */
async function sendStatusChangeEmail(promoterData) {
  if (!brevoApiInstance) {
    console.error("Brevo API key not configured. Cannot send email.");
    return;
  }
  if (!promoterData || !promoterData.email) {
    console.error("Promoter data or email is missing.");
    return;
  }

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

    // Manually replace placeholders because `params` is ignored when `htmlContent` is used
    for (const key in replacements) {
      const placeholder = new RegExp(`{{${key}}}`, "g");
      htmlTemplate = htmlTemplate.replace(placeholder, replacements[key]);
    }
    sendSmtpEmail.htmlContent = htmlTemplate;
  } else { // 'rejected'
    sendSmtpEmail.subject = "Atualização sobre seu cadastro";
    sendSmtpEmail.templateId = 11; // Assumes Brevo template ID 11 for rejections
    // For templateId, Brevo will use the params object
    sendSmtpEmail.params = replacements;
  }


  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`Email for status '${promoterData.status}' sent to ${promoterData.email}`);
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send email to ${promoterData.email}. Details: ${detailedError}`);
    throw new Error(`Brevo API Error: ${detailedError}`);
  }
}

/**
 * Sends a notification email to a promoter about a new post.
 * @param {object} promoter - The promoter object from the assigned promoters list.
 * @param {object} postDetails - Object containing post details like campaignName and orgName.
 */
async function sendNewPostNotificationEmail(promoter, postDetails) {
  if (!brevoApiInstance) {
    console.warn(`Skipping new post email for ${promoter.email}: Brevo API is not configured.`);
    return;
  }

  const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.email)}`;
  const eventDisplayName = postDetails.eventName ? `${postDetails.campaignName} - ${postDetails.eventName}` : postDetails.campaignName;
  const subject = `Nova Publicação Disponível - ${eventDisplayName}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${subject}</title>
        <style>
            body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; }
            .header { background-color: #1a1a2e; color: #ffffff; padding: 20px; text-align: center; }
            .content { padding: 30px; }
            .button { display: inline-block; background-color: #e83a93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h1>Olá, ${promoter.name}!</h1></div>
            <div class="content">
                <p>Uma nova publicação para o evento <strong>${eventDisplayName}</strong> está disponível para você.</p>
                <p>Acesse o portal para ver as instruções e confirmar sua postagem.</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="${portalLink}" class="button">Ver Publicação</a>
                </p>
                <p>Atenciosamente,<br>Equipe ${postDetails.orgName}</p>
            </div>
        </div>
    </body>
    </html>`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoter.email, name: promoter.name }];
  sendSmtpEmail.sender = {
    name: postDetails.orgName || "Equipe de Eventos",
    email: brevoConfig.sender_email,
  };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`New post notification sent to ${promoter.email}`);
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send new post email to ${promoter.email}. Details: ${detailedError}`);
    // Do not re-throw, to allow other emails to be sent.
  }
}


/**
 * Sends a reminder email to a promoter to submit proof for a post.
 * @param {object} promoter - The promoter data object.
 * @param {object} postDetails - Object with campaignName, orgName, etc.
 */
async function sendProofReminderEmail(promoter, postDetails) {
  if (!brevoApiInstance) {
    console.warn(`Skipping proof reminder email for ${promoter.promoterEmail}: Brevo API is not configured.`);
    return;
  }

  const proofLink = `https://divulgadoras.vercel.app/#/proof/${promoter.id}`;
  const subject = `Lembrete: Envie a comprovação do post - ${postDetails.campaignName}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${subject}</title>
        <style>
            body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; }
            .header { background-color: #1a1a2e; color: #ffffff; padding: 20px; text-align: center; }
            .content { padding: 30px; }
            .button { display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h1>Olá, ${promoter.promoterName}!</h1></div>
            <div class="content">
                <p>Este é um lembrete amigável para você enviar a comprovação (print) da sua publicação para o evento <strong>${postDetails.campaignName}</strong>.</p>
                <p>O prazo está se aproximando. Acesse o link abaixo para enviar seu print.</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="${proofLink}" class="button">Enviar Comprovação</a>
                </p>
                <p>Atenciosamente,<br>Equipe ${postDetails.orgName}</p>
            </div>
        </div>
    </body>
    </html>`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoter.promoterEmail, name: promoter.promoterName }];
  sendSmtpEmail.sender = {
    name: postDetails.orgName || "Equipe de Eventos",
    email: brevoConfig.sender_email,
  };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`Proof reminder sent to ${promoter.promoterEmail}`);
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send proof reminder to ${promoter.promoterEmail}. Details: ${detailedError}`);
    // Do not re-throw
  }
}


/**
 * Fetches organization and campaign details for personalizing emails.
 * @param {string} organizationId - The ID of the organization.
 * @param {string} stateAbbr - The state abbreviation for the campaign.
 * @param {string} campaignName - The name of the campaign.
 * @return {Promise<object>} An object with orgName, campaignRules, and campaignLink.
 */
async function getOrgAndCampaignDetails(organizationId, stateAbbr, campaignName) {
  let orgName = "Equipe de Eventos";
  let campaignRules = "";
  let campaignLink = "#";

  if (organizationId) {
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (orgDoc.exists) {
      orgName = orgDoc.data().name || orgName;
    }
  }

  if (stateAbbr && campaignName && organizationId) {
    const campaignsQuery = db
        .collection("campaigns")
        .where("organizationId", "==", organizationId)
        .where("stateAbbr", "==", stateAbbr)
        .where("name", "==", campaignName)
        .limit(1);

    const snapshot = await campaignsQuery.get();
    if (!snapshot.empty) {
      const campaignDoc = snapshot.docs[0].data();
      campaignRules = campaignDoc.rules || "";
      campaignLink = campaignDoc.whatsappLink || "#";
    }
  }

  return { orgName, campaignRules, campaignLink };
}

/**
 * Sends reminder emails to all promoters who have confirmed a post but not yet submitted proof.
 */
exports.sendPostReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
  }
  const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
  if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
    throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem executar esta ação.");
  }

  // 2. Get postId
  const { postId } = data;
  if (!postId) {
    throw new functions.https.HttpsError("invalid-argument", "O ID da publicação (postId) é obrigatório.");
  }

  // Get post and org details for email personalization
  const postSnap = await db.collection("posts").doc(postId).get();
  if (!postSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
  }
  const post = postSnap.data();

  const orgDoc = await db.collection("organizations").doc(post.organizationId).get();
  const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Organização";

  // 3. Query for assignments that need a reminder
  const assignmentsQuery = db.collection("postAssignments")
      .where("postId", "==", postId)
      .where("status", "==", "confirmed")
      .where("proofSubmittedAt", "==", null);

  const snapshot = await assignmentsQuery.get();

  // Filter out assignments that already have a justification
  const assignmentsToSendTo = snapshot.docs.filter((doc) => !doc.data().justification);

  if (assignmentsToSendTo.length === 0) {
    return { success: true, count: 0, message: "Nenhuma divulgadora pendente de comprovação para este post." };
  }

  // 4. Iterate and send emails
  const emailPromises = assignmentsToSendTo.map((doc) => {
    const assignment = { id: doc.id, ...doc.data() };
    return sendProofReminderEmail(assignment, { campaignName: post.campaignName, orgName });
  });

  await Promise.all(emailPromises);

  // 5. Batch update the timestamps for sent reminders
  const batch = db.batch();
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  assignmentsToSendTo.forEach((doc) => {
    batch.update(doc.ref, { lastManualReminderAt: serverTimestamp });
  });
  await batch.commit();

  return { success: true, count: assignmentsToSendTo.length, message: `${assignmentsToSendTo.length} lembretes foram enviados com sucesso.` };
});

exports.sendSingleProofReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
  }
  const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
  if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
    throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem executar esta ação.");
  }

  const { assignmentId } = data;
  if (!assignmentId) {
    throw new functions.https.HttpsError("invalid-argument", "O ID da atribuição (assignmentId) é obrigatório.");
  }

  const assignmentSnap = await db.collection("postAssignments").doc(assignmentId).get();
  if (!assignmentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Atribuição não encontrada.");
  }
  const assignment = { id: assignmentSnap.id, ...assignmentSnap.data() };

  if (assignment.proofSubmittedAt) {
    throw new functions.https.HttpsError("failed-precondition", "Esta divulgadora já enviou a comprovação.");
  }
  if (assignment.status !== "confirmed") {
    throw new functions.https.HttpsError("failed-precondition", "A divulgadora ainda não confirmou a postagem.");
  }

  const postSnap = await db.collection("posts").doc(assignment.postId).get();
  if (!postSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Publicação associada não encontrada.");
  }
  const post = postSnap.data();

  const orgDoc = await db.collection("organizations").doc(post.organizationId).get();
  const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Organização";

  await sendProofReminderEmail(assignment, { campaignName: post.campaignName, orgName });

  await db.collection("postAssignments").doc(assignmentId).update({
      lastManualReminderAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, message: "Lembrete enviado com sucesso." };
});

exports.createPostAndAssignments = functions.region("southamerica-east1")
  .https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Apenas administradores autenticados podem criar publicações.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists || !["admin", "superadmin", "poster"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Você não tem permissão para criar publicações.");
    }

    // 2. Data Validation
    const { postData, assignedPromoters } = data;
    if (!postData || typeof postData !== "object" || !Array.isArray(assignedPromoters) || assignedPromoters.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados da publicação ou divulgadoras inválidos.");
    }

    const postsCollection = db.collection("posts");
    const assignmentsCollection = db.collection("postAssignments");
    const batch = db.batch();

    try {
        const postDocRef = postsCollection.doc();

        // 3. Prepare Post Data
        const finalPostData = {
            ...postData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            // The client sends an ISO string, so we convert it back to a Timestamp.
            expiresAt: postData.expiresAt ?
                admin.firestore.Timestamp.fromDate(new Date(postData.expiresAt)) :
                null,
        };

        // 4. Batch write the Post document
        batch.set(postDocRef, finalPostData);

        // 5. Batch write all PostAssignment documents
        for (const promoter of assignedPromoters) {
            const assignmentDocRef = assignmentsCollection.doc();
            const newAssignment = {
                postId: postDocRef.id,
                post: { // denormalized data
                    type: finalPostData.type,
                    mediaUrl: finalPostData.mediaUrl || null,
                    textContent: finalPostData.textContent || null,
                    instructions: finalPostData.instructions,
                    postLink: finalPostData.postLink || null,
                    campaignName: finalPostData.campaignName,
                    eventName: finalPostData.eventName || null,
                    isActive: finalPostData.isActive,
                    expiresAt: finalPostData.expiresAt, // This is now a Firestore Timestamp
                    createdAt: finalPostData.createdAt, // This is a ServerTimestamp FieldValue
                    allowLateSubmissions: finalPostData.allowLateSubmissions || false,
                    allowImmediateProof: finalPostData.allowImmediateProof || false,
                    postFormats: finalPostData.postFormats || [],
                    autoAssignToNewPromoters: finalPostData.autoAssignToNewPromoters || false,
                },
                organizationId: finalPostData.organizationId,
                promoterId: promoter.id,
                promoterEmail: promoter.email.toLowerCase(),
                promoterName: promoter.name,
                status: "pending",
                confirmedAt: null,
            };
            batch.set(assignmentDocRef, newAssignment);
        }

        // 6. Commit the batch
        await batch.commit();

        return { success: true, postId: postDocRef.id };
    } catch (error) {
        console.error("Error in createPostAndAssignments function:", error);
        // Log the received data for debugging
        console.error("Received postData:", JSON.stringify(postData));
        throw new functions.https.HttpsError("internal", "Erro ao salvar no banco de dados.", { message: error.message });
    }
});