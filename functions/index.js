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
    throw new functions.https.HttpsError("not-found", "Publicação relacionada não encontrada.");
  }
  const post = postSnap.data();

  const orgDoc = await db.collection("organizations").doc(post.organizationId).get();
  const orgName = orgDoc.exists ? orgDoc.data().name : "Sua Organização";

  // Send email using helper
  await sendProofReminderEmail(assignment, {
    campaignName: post.campaignName,
    orgName: orgName,
  });

  // Update a timestamp on the assignment
  await db.collection("postAssignments").doc(assignmentId).update({
    lastManualReminderAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, message: `Lembrete enviado para ${assignment.promoterName}.` };
});


// --- Callable Functions ---

/**
 * Creates a Post and its assignments in a single transaction.
 */
exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists || !["admin", "superadmin", "poster"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem criar publicações.");
    }

    const { postData, assignedPromoters } = data;
    if (!postData || !assignedPromoters || assignedPromoters.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados da publicação ou divulgadoras designadas estão ausentes.");
    }

    // 1. Create the Post document
    const postRef = db.collection("posts").doc();
    const newPost = {
        ...postData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await postRef.set(newPost);

    // 2. Create PostAssignment documents in a batch
    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    const denormalizedPostData = {
        type: newPost.type,
        mediaUrl: newPost.mediaUrl || null,
        textContent: newPost.textContent || null,
        instructions: newPost.instructions,
        postLink: newPost.postLink || null,
        campaignName: newPost.campaignName,
        eventName: newPost.eventName || null,
        isActive: newPost.isActive,
        expiresAt: newPost.expiresAt || null,
        createdAt: newPost.createdAt, // This will be the server timestamp object
        allowLateSubmissions: newPost.allowLateSubmissions || false,
        allowImmediateProof: newPost.allowImmediateProof || false,
        postFormats: newPost.postFormats || [],
    };

    assignedPromoters.forEach(promoter => {
        const assignmentDocRef = assignmentsCollectionRef.doc();
        const newAssignment = {
            postId: postRef.id,
            post: denormalizedPostData,
            organizationId: newPost.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentDocRef, newAssignment);
    });

    await batch.commit();
    // The onPostAssignmentCreated trigger will handle sending emails.
    
    return { success: true, postId: postRef.id };
});

/**
 * Scheduled function to check for and process due scheduled posts.
 */
exports.checkScheduledPosts = functions.region("southamerica-east1").pubsub
    .schedule("every 5 minutes").onRun(async (context) => {
        console.log("Running scheduled post check...");
        const now = admin.firestore.Timestamp.now();
        const scheduledPostsRef = db.collection("scheduledPosts");
        // Query only by status to avoid needing a composite index. Time check is done in code.
        const query = scheduledPostsRef.where("status", "==", "pending");

        const snapshot = await query.get();
        if (snapshot.empty) {
            console.log("No pending scheduled posts found.");
            return null;
        }

        // Filter for posts that are actually due
        const duePosts = snapshot.docs.filter((doc) => {
            const data = doc.data();
            return data.scheduledAt && data.scheduledAt.toDate() <= now.toDate();
        });

        if (duePosts.length === 0) {
            console.log("No scheduled posts are due at this time.");
            return null;
        }

        console.log(`Found ${duePosts.length} scheduled posts to process.`);

        const processingPromises = duePosts.map(async (doc) => {
            const scheduledPost = doc.data();
            const { postData, assignedPromoters, createdByEmail, organizationId } = scheduledPost;
            
            const batch = db.batch();
            try {
                // Robustly handle expiresAt, which might be an ISO string from client
                let expiresAtTimestamp = null;
                if (postData.expiresAt) {
                    const date = new Date(postData.expiresAt);
                    if (!isNaN(date.getTime())) {
                        expiresAtTimestamp = admin.firestore.Timestamp.fromDate(date);
                    }
                }

                const postRef = db.collection("posts").doc();
                const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

                const newPost = {
                    ...postData,
                    expiresAt: expiresAtTimestamp,
                    organizationId,
                    createdByEmail,
                    createdAt: serverTimestamp,
                };
                batch.set(postRef, newPost);

                const assignmentsCollectionRef = db.collection("postAssignments");
                const denormalizedPostData = {
                    type: postData.type,
                    mediaUrl: postData.mediaUrl || null,
                    textContent: postData.textContent || null,
                    instructions: postData.instructions,
                    postLink: postData.postLink || null,
                    campaignName: postData.campaignName,
                    eventName: postData.eventName || null,
                    isActive: postData.isActive,
                    expiresAt: expiresAtTimestamp,
                    createdAt: serverTimestamp,
                    allowLateSubmissions: postData.allowLateSubmissions || false,
                    allowImmediateProof: postData.allowImmediateProof || false,
                    postFormats: postData.postFormats || [],
                };

                assignedPromoters.forEach((promoter) => {
                    const assignmentDocRef = assignmentsCollectionRef.doc();
                    const newAssignment = {
                        postId: postRef.id,
                        post: denormalizedPostData,
                        organizationId: organizationId,
                        promoterId: promoter.id,
                        promoterEmail: promoter.email.toLowerCase(),
                        promoterName: promoter.name,
                        status: "pending",
                        confirmedAt: null,
                    };
                    batch.set(assignmentDocRef, newAssignment);
                });
                
                batch.update(doc.ref, { status: "sent" });

                await batch.commit();
                console.log(`Successfully processed scheduled post ${doc.id}`);

            } catch (error) {
                console.error(`Error processing scheduled post ${doc.id}:`, error);
                await doc.ref.update({ status: "error", error: error.message });
            }
        });

        await Promise.all(processingPromises);
        console.log("Finished scheduled post check.");
        return null;
    });

/**
 * Updates a Post and propagates changes to its assignments.
 */
exports.updatePostStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
    }
    const { postId, updateData } = data;
    if (!postId || !updateData) {
        throw new functions.https.HttpsError("invalid-argument", "Dados inválidos.");
    }

    const postRef = db.collection('posts').doc(postId);
    
    // Update the main post document
    await postRef.update(updateData);
    
    // Now, update all related assignments
    const assignmentsQuery = db.collection('postAssignments').where('postId', '==', postId);
    const snapshot = await assignmentsQuery.get();
    
    if (snapshot.empty) {
        return { success: true, message: 'Post updated, no assignments to sync.' };
    }
    
    // Denormalize the fields that are allowed to change
    const denormalizedUpdate = {};
    const updatableFields = ['instructions', 'postLink', 'isActive', 'expiresAt', 'allowLateSubmissions', 'allowImmediateProof', 'postFormats', 'textContent', 'mediaUrl', 'eventName'];
    for (const key of updatableFields) {
        if (updateData[key] !== undefined) {
            denormalizedUpdate[`post.${key}`] = updateData[key];
        }
    }
    
    if (Object.keys(denormalizedUpdate).length === 0) {
        return { success: true, message: 'Post updated, no relevant fields to sync to assignments.' };
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, denormalizedUpdate);
    });
    
    await batch.commit();

    return { success: true, message: `Post and ${snapshot.size} assignments updated.` };
});

/**
 * Adds new assignments to an existing post.
 */
exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
    }
    const { postId, promoterIds } = data;
    if (!postId || !promoterIds || !Array.isArray(promoterIds) || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados inválidos.");
    }

    const postRef = db.collection('posts').doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    }
    const postData = postSnap.data();

    // Get promoter details
    const promotersRef = db.collection('promoters');
    const promotersSnap = await promotersRef.where(admin.firestore.FieldPath.documentId(), 'in', promoterIds).get();
    const promoters = promotersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    const denormalizedPostData = {
        type: postData.type,
        mediaUrl: postData.mediaUrl || null,
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
    };

    promoters.forEach(promoter => {
        const assignmentDocRef = assignmentsCollectionRef.doc();
        const newAssignment = {
            postId: postId,
            post: denormalizedPostData,
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
    return { success: true };
});

/**
 * Manually resends a status email to a promoter.
 * Called by an admin from the admin panel.
 */
exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "A função deve ser chamada por um usuário autenticado.");
      }
      const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
      if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Permissão negada. Apenas administradores podem executar esta ação.");
      }
      const { promoterId } = data;
      if (!promoterId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da divulgadora (promoterId) é obrigatório.");
      }
      try {
        const promoterDoc = await db.collection("promoters").doc(promoterId).get();
        if (!promoterDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        }
        const promoterData = promoterDoc.data();
        if (promoterData.status !== "approved" && promoterData.status !== "rejected") {
          throw new functions.https.HttpsError("failed-precondition", `Não é possível enviar notificação para status '${promoterData.status}'. Apenas 'approved' ou 'rejected'.`);
        }
        await sendStatusChangeEmail(promoterData);
        return {
          success: true,
          message: `Notificação de '${promoterData.status}' enviada para ${promoterData.email}.`,
          provider: "Brevo",
        };
      } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        console.error("Error in manuallySendStatusEmail:", error);
        throw new functions.https.HttpsError("internal", error.message, { originalError: error.message, provider: "Brevo" });
      }
    });

/**
 * Checks the configuration status of the system, primarily the email service.
 */
exports.getSystemStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Apenas Super Admins podem ver o status do sistema.");
  }

  const status = {
    functionVersion: process.env.K_REVISION,
    emailProvider: "Brevo (anteriormente Sendinblue)",
    configured: false,
    message: "",
    log: [],
  };
  status.log.push({ level: "INFO", message: "Iniciando verificação do sistema..." });
  if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email) {
    status.message = "As variáveis de ambiente para o serviço de e-mail (Brevo) não estão configuradas.";
    status.log.push({ level: "ERROR", message: "Configuração 'brevo.key' ou 'brevo.sender_email' não encontrada no Firebase." });
    return status;
  }
  status.log.push({ level: "INFO", message: "Variáveis de ambiente encontradas." });
  try {
    status.log.push({ level: "INFO", message: "Tentando autenticar com a API do Brevo..." });
    const accountApi = new Brevo.AccountApi();
    await accountApi.getAccount();
    status.configured = true;
    status.message = "A conexão com a API do Brevo foi bem-sucedida. O sistema de e-mail está operacional.";
    status.log.push({ level: "SUCCESS", message: "Autenticação com a API do Brevo bem-sucedida." });
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    status.configured = false;
    status.message = "Falha na comunicação com a API do Brevo. Verifique se a chave de API (API Key) está correta e se a conta Brevo está ativa.";
    status.log.push({ level: "ERROR", message: `A chamada para a API do Brevo falhou. Detalhes: ${detailedError}` });
  }
  return status;
});


/**
 * Sends a test email to the calling super admin.
 * Supports different test types: generic, approved (using template), and custom HTML.
 */
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.email || !(await isSuperAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Apenas Super Admins podem enviar e-mails de teste.");
  }
  if (!brevoApiInstance) {
    throw new functions.https.HttpsError("failed-precondition", "A API de e-mail não está configurada no servidor.");
  }

  const { testType, customHtmlContent } = data; // 'generic', 'approved', or 'custom_approved'
  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(context.auth.token.email)}`;

  sendSmtpEmail.to = [{ email: context.auth.token.email, name: "Super Admin Teste" }];
  sendSmtpEmail.sender = {
    name: "Sistema Equipe Certa",
    email: brevoConfig.sender_email,
  };

  const replacements = {
    promoterName: "Super Admin Teste",
    promoterEmail: context.auth.token.email,
    campaignName: "Evento de Teste",
    orgName: "Sua Organização",
    portalLink: portalLink,
  };

  if (testType === "approved" || testType === "custom_approved") {
    let htmlTemplate;
    if (testType === "approved") {
      sendSmtpEmail.subject = "Teste de E-mail de Aprovação";
      const templateDoc = await db.doc(EMAIL_TEMPLATE_DOC_PATH).get();
      htmlTemplate = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE_HTML;
    } else { // custom_approved
      if (!customHtmlContent) {
        throw new functions.https.HttpsError("invalid-argument", "Conteúdo HTML customizado é obrigatório para este tipo de teste.");
      }
      sendSmtpEmail.subject = "Teste de Template Customizado - Equipe Certa";
      htmlTemplate = customHtmlContent;
    }
    // Manually replace placeholders
    for (const key in replacements) {
      const placeholder = new RegExp(`{{${key}}}`, "g");
      htmlTemplate = htmlTemplate.replace(placeholder, replacements[key]);
    }
    sendSmtpEmail.htmlContent = htmlTemplate;
  } else { // 'generic'
    sendSmtpEmail.subject = "Teste de Conexão - Equipe Certa";
    sendSmtpEmail.htmlContent = `<html><body><h1>Olá!</h1><p>Se você recebeu este e-mail, a configuração de envio está funcionando (${new Date().toLocaleString("pt-BR")}).</p></body></html>`;
  }

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, message: `E-mail de teste ('${testType}') enviado com sucesso para ${context.auth.token.email}.` };
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send test email. Details: ${detailedError}`);
    throw new functions.https.HttpsError("internal", `Falha no envio: ${detailedError}`);
  }
});


// --- NEW Email Template Management Callables ---
exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
  }
  const docRef = db.doc(EMAIL_TEMPLATE_DOC_PATH);
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    return { htmlContent: docSnap.data().htmlContent };
  }
  return { htmlContent: DEFAULT_APPROVED_TEMPLATE_HTML };
});

exports.getDefaultEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
  }
  return { htmlContent: DEFAULT_APPROVED_TEMPLATE_HTML };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
  }
  const { htmlContent } = data;
  if (typeof htmlContent !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "O conteúdo HTML é obrigatório.");
  }
  const docRef = db.doc(EMAIL_TEMPLATE_DOC_PATH);
  await docRef.set({ htmlContent });
  return { success: true };
});

exports.resetEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
  }
  const docRef = db.doc(EMAIL_TEMPLATE_DOC_PATH);
  await docRef.delete();
  return { success: true };
});

exports.resetGuestListsForCampaign = functions.region("southamerica-east1")
    .runWith({ timeoutSeconds: 300 }) // Increase timeout for large deletions
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem executar esta ação.");
    }

    const { campaignId } = data;
    if (!campaignId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID do evento (campaignId) é obrigatório.");
    }

    try {
        const confirmationsRef = db.collection("guestListConfirmations");
        const q = confirmationsRef.where("campaignId", "==", campaignId);
        const snapshot = await q.get();

        if (snapshot.empty) {
            return { success: true, message: "Nenhuma lista para resetar.", deletedCount: 0 };
        }

        // Process deletions in chunks to avoid exceeding batch limit of 500 operations.
        const BATCH_SIZE = 499; // Keep it slightly under the limit for safety
        const batches = [];
        
        for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
            chunk.forEach(doc => {
                batch.delete(doc.ref);
            });
            batches.push(batch.commit());
        }

        await Promise.all(batches);

        return { success: true, message: `Todas as ${snapshot.size} listas foram resetadas.`, deletedCount: snapshot.size };
    } catch (error) {
        console.error(`Error resetting guest lists for campaign ${campaignId}:`, error);
        throw new functions.https.HttpsError("internal", "Ocorreu um erro interno ao tentar resetar as listas.");
    }
});


// --- User and Organization Management ---

exports.createAdminRequest = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  const { email, password, name, phone, message } = data;
  if (!email || !password || !name || !phone) {
    throw new functions.https.HttpsError("invalid-argument", "Todos os campos obrigatórios devem ser preenchidos.");
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "A senha deve ter no mínimo 6 caracteres.");
  }
  try {
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) {
      throw new functions.https.HttpsError("already-exists", "Este e-mail já está cadastrado no sistema.");
    }
    const userRecord = await admin.auth().createUser({ email, password, displayName: name });
    const applicationData = {
      name, email, phone, message: message || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("adminApplications").doc(userRecord.uid).set(applicationData);
    return { success: true, message: "Solicitação enviada com sucesso." };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("Error creating admin request:", error);
    throw new functions.https.HttpsError("internal", "Ocorreu um erro interno ao processar sua solicitação.");
  }
});


exports.createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  const { orgName, ownerName, phone, taxId, email, password, planId } = data;
  if (!orgName || !ownerName || !email || !password || !planId) {
    throw new functions.https.HttpsError("invalid-argument", "Dados insuficientes para criar la organização.");
  }
  return db.runTransaction(async (transaction) => {
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) {
      throw new functions.https.HttpsError("already-exists", "Este e-mail já está cadastrado.");
    }
    const userRecord = await admin.auth().createUser({ email, password, displayName: ownerName });
    const orgRef = db.collection("organizations").doc();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const newOrgData = {
      name: orgName, ownerName, ownerEmail: email, ownerUid: userRecord.uid,
      ownerPhone: phone, ownerTaxId: taxId, status: "trial", planId,
      planExpiresAt: admin.firestore.Timestamp.fromDate(threeDaysFromNow),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      public: true, assignedStates: [],
    };
    transaction.set(orgRef, newOrgData);
    const adminRef = db.collection("admins").doc(userRecord.uid);
    const newAdminData = {
      email, role: "admin", organizationIds: [orgRef.id],
      assignedStates: [], assignedCampaigns: {},
    };
    transaction.set(adminRef, newAdminData);
    return { success: true, orgId: orgRef.id };
  }).then((result) => {
    console.log(`Successfully created org ${result.orgId} for user ${email}`);
    return result;
  }).catch((error) => {
    console.error("Transaction failed: ", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", "Falha na transação ao criar organização.");
  });
});

exports.removePromoterFromAllAssignments = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
        }
        const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
        if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
            throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem executar esta ação.");
        }

        const { promoterId } = data;
        if (!promoterId) {
            throw new functions.https.HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
        }

        const batch = db.batch();

        // 1. Update the promoter document
        const promoterRef = db.collection("promoters").doc(promoterId);
        batch.update(promoterRef, { hasJoinedGroup: false });

        // 2. Find and delete all their assignments
        const assignmentsQuery = db.collection("postAssignments").where("promoterId", "==", promoterId);
        const assignmentsSnapshot = await assignmentsQuery.get();

        if (!assignmentsSnapshot.empty) {
            assignmentsSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
        }

        // 3. Commit the batch
        await batch.commit();

        return { success: true, deletedCount: assignmentsSnapshot.size };
    });

exports.setPromoterStatusToRemoved = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
      }
      const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
      if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Apenas administradores podem executar esta ação.");
      }

      const { promoterId } = data;
      if (!promoterId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
      }

      const batch = db.batch();

      // 1. Update the promoter document
      const promoterRef = db.collection("promoters").doc(promoterId);
      batch.update(promoterRef, {
        status: "removed",
        hasJoinedGroup: false,
        actionTakenByUid: context.auth.uid,
        actionTakenByEmail: adminDoc.data().email,
        statusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Find and delete all their post assignments
      const assignmentsQuery = db.collection("postAssignments").where("promoterId", "==", promoterId);
      const assignmentsSnapshot = await assignmentsQuery.get();

      if (!assignmentsSnapshot.empty) {
        assignmentsSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }

      // 3. Commit the batch
      await batch.commit();

      return { success: true, message: "Divulgadora removida e suas publicações foram limpas.", deletedAssignments: assignmentsSnapshot.size };
    });

/**
 * Accepts all pending justifications for a given post.
 */
exports.acceptAllJustifications = functions.region("southamerica-east1").https.onCall(async (data, context) => {
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

  // 3. Query for assignments with pending justifications
  const assignmentsQuery = db.collection("postAssignments")
      .where("postId", "==", postId)
      .where("justificationStatus", "==", "pending");

  const snapshot = await assignmentsQuery.get();

  if (snapshot.empty) {
    return { success: true, count: 0, message: "Nenhuma justificativa pendente encontrada para esta publicação." };
  }

  // 4. Batch update the status to 'accepted'
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { justificationStatus: "accepted" });
  });
  await batch.commit();

  return { success: true, count: snapshot.size, message: `${snapshot.size} justificativas foram aceitas com sucesso.` };
});


// --- Gemini AI assistant function ---
const { GoogleGenAI } = require("@google/genai");

// Configure Gemini using Firebase Functions config, similar to Brevo.
// Use the command:
// firebase functions:config:set gemini.key="YOUR_GEMINI_API_KEY"
const geminiConfig = functions.config().gemini;
let ai;
try {
  if (geminiConfig && geminiConfig.key) {
    ai = new GoogleGenAI({ apiKey: geminiConfig.key });
  } else {
    console.warn("Gemini API Key not configured in Firebase Functions config. Run: firebase functions:config:set gemini.key=\"YOUR_API_KEY\"");
  }
} catch (e) {
  console.error("Could not initialize GoogleGenAI.", e);
  ai = null; // Ensure ai is null on initialization error
}

exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Acesso não autenticado.");
  }
  const { prompt } = data;
  if (!prompt || typeof prompt !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "O prompt é obrigatório e deve ser um texto.");
  }
  if (!ai) {
    const errorMessage = "A IA do Gemini não está configurada no servidor. Para configurar, execute no terminal: firebase functions:config:set gemini.key=\"SUA_CHAVE_DE_API\"";
    console.error("Gemini API Key is not set in Firebase config. Run 'firebase functions:config:set gemini.key=\"YOUR_API_KEY\"' and redeploy functions.");
    throw new functions.https.HttpsError("failed-precondition", errorMessage);
  }
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });
    const responseText = response.text;
    if (responseText) {
      return { text: responseText };
    } else {
      console.warn("Gemini API returned an empty response.", response);
      throw new Error("A IA retornou uma resposta vazia. A solicitação pode ter sido bloqueada por segurança.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new functions.https.HttpsError("internal", "Não foi possível comunicar com a IA do Gemini.", { originalError: error.message });
  }
});


// --- Stripe Integration ---
const stripeConfig = functions.config().stripe;

exports.getStripePublishableKey = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
    }
    if (!stripeConfig || !stripeConfig.publishable_key) {
        throw new functions.https.HttpsError("failed-precondition", "A chave publicável do Stripe não está configurada no servidor.");
    }
    return { publishableKey: stripeConfig.publishable_key };
});

exports.createStripeCheckoutSession = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autenticado.");
    const { orgId, planId } = data;
    if (!orgId || !planId) throw new functions.https.HttpsError("invalid-argument", "ID da Organização e do Plano são obrigatórios.");

    const plans = {
        "basic": stripeConfig.basic_price_id,
        "professional": stripeConfig.professional_price_id,
    };
    const priceId = plans[planId];
    if (!priceId) throw new functions.https.HttpsError("not-found", "ID de preço do Stripe não encontrado para este plano.");

    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) throw new functions.https.HttpsError("not-found", "Organização não encontrada.");
    const orgData = orgDoc.data();

    const successUrl = `https://divulgadoras.vercel.app/#/admin/settings/subscription?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `https://divulgadoras.vercel.app/#/admin/settings/subscription`;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            customer_email: orgData.ownerEmail,
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                orgId: orgId,
                planId: planId,
            },
        });

        return { sessionId: session.id };
    } catch (error) {
        console.error("Stripe Checkout Session Error:", error);
        throw new functions.https.HttpsError("internal", "Falha ao criar a sessão de checkout do Stripe.", { message: error.message });
    }
});

exports.stripeWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = stripeConfig.webhook_secret;
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error("Webhook signature verification failed.", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const { orgId, planId } = session.metadata;

        if (!orgId || !planId) {
            console.error("Webhook received with missing metadata:", session.id);
            res.status(400).send("Metadata (orgId, planId) is missing.");
            return;
        }

        try {
            const orgRef = db.collection("organizations").doc(orgId);
            const oneMonthFromNow = new Date();
            oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

            await orgRef.update({
                status: "active",
                planExpiresAt: admin.firestore.Timestamp.fromDate(oneMonthFromNow),
            });

            console.log(`Successfully updated organization ${orgId} to active plan.`);
        } catch (error) {
            console.error(`Error updating organization ${orgId} from webhook:`, error);
            // Don't send 400, because Stripe will retry. This is an internal server error.
            res.status(500).send("Internal server error while updating organization.");
            return;
        }
    }

    res.status(200).send();
});


exports.getStripeStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
        throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
    }

    const status = {
        configured: false,
        secretKey: false,
        publishableKey: false,
        webhookSecret: false,
        basicPriceId: false,
        professionalPriceId: false,
    };

    if (stripeConfig) {
        if (stripeConfig.secret_key) status.secretKey = true;
        if (stripeConfig.publishable_key) status.publishableKey = true;
        if (stripeConfig.webhook_secret) status.webhookSecret = true;
        if (stripeConfig.basic_price_id) status.basicPriceId = true;
        if (stripeConfig.professional_price_id) status.professionalPriceId = true;
        
        if (status.secretKey && status.publishableKey && status.basicPriceId && status.professionalPriceId) {
            status.configured = true;
        }
    }
    return status;
});

exports.getEnvironmentConfig = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth || !(await isSuperAdmin(context.auth.uid))) {
        throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
    }
    // WARNING: Be careful what you expose here.
    return {
        brevo: functions.config().brevo,
        stripe: functions.config().stripe,
        gemini_key_exists: !!functions.config().gemini?.key,
    };
});