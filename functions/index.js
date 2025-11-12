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
 * Triggered when a promoter's document is updated.
 * Handles auto-assigning posts and sending status change notification emails.
 */
exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

      // --- Auto-assign posts when an approved promoter joins a group for the first time ---
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

      // --- Send notification emails on status change ---
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

        const { organizationId, promoterId, promoterEmail, promoterName, post } = assignmentData;
        if (!organizationId || !promoterId || !promoterEmail || !promoterName || !post) {
            console.error(`Incomplete data for assignment ${context.params.assignmentId}, cannot send notification.`);
            return;
        }

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


/**
 * Queries for posts that should be auto-assigned to a newly approved promoter
 * and creates the assignments and notifications.
 * @param {object} promoterData The promoter document data for the new promoter.
 * @param {string} promoterId The ID of the promoter document.
 */
async function assignPostsToNewPromoter(promoterData, promoterId) {
    const { organizationId, state: stateAbbr, campaignName } = promoterData;
    if (!organizationId || !stateAbbr) {
        console.log(`[Auto-Assign] Skipping for promoter ${promoterId} due to missing org/state.`);
        return;
    }

    const now = admin.firestore.Timestamp.now();
    const postsToAssign = new Map(); // Use Map to avoid duplicates by ID

    const baseQuery = db.collection("posts")
        .where("organizationId", "==", organizationId)
        .where("stateAbbr", "==", stateAbbr)
        .where("autoAssignToNewPromoters", "==", true)
        .where("isActive", "==", true);

    // Query 1: Get posts for the promoter's specific campaign, if they have one
    if (campaignName) {
        const specificPostsQuery = baseQuery.where("campaignName", "==", campaignName);
        const snapshot = await specificPostsQuery.get();
        snapshot.forEach(doc => postsToAssign.set(doc.id, { id: doc.id, data: doc.data() }));
    }

    // Query 2: Get general posts (campaignName is null) for everyone in the state
    const generalPostsQuery = baseQuery.where("campaignName", "==", null);
    const generalSnapshot = await generalPostsQuery.get();
    generalSnapshot.forEach(doc => postsToAssign.set(doc.id, { id: doc.id, data: doc.data() }));

    if (postsToAssign.size === 0) {
        console.log(`[Auto-Assign] No auto-assign posts found for promoter ${promoterId} in campaign '${campaignName || "general"}'.`);
        return;
    }

    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    for (const postInfo of postsToAssign.values()) {
        const post = postInfo.data;
        const postId = postInfo.id;

        // Filter out expired posts
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
    console.log(`[Auto-Assign] Created ${postsToAssign.size} new assignments for promoter ${promoterId}.`);
}


/**
 * Sends a status change email to a promoter.
 * For 'approved' status, it uses the custom HTML template from Firestore.
 * For 'rejected' status, it uses a fixed template ID from Brevo.
 * @param {object} promoterData The promoter document data.
 * @param {string} promoterId The ID of the promoter document.
 */
async function sendStatusChangeEmail(promoterData, promoterId) {
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
  } else if (promoterData.status === "rejected_editable") {
    sendSmtpEmail.subject = `Ação Necessária: Corrija seu cadastro para ${replacements.campaignName}`;

    const editLink = `https://divulgadoras.vercel.app/#/${promoterData.organizationId}/register/${promoterData.state}/${promoterData.campaignName ? encodeURIComponent(promoterData.campaignName) : ""}?edit_id=${promoterId}`;
    const rejectionReasonHtml = promoterData.rejectionReason ? `<p><strong>Motivo:</strong></p><div style="background-color: #ffefef; border-left: 4px solid #f87171; padding: 10px; margin-bottom: 20px;">${promoterData.rejectionReason.replace(/\n/g, "<br/>")}</div>` : "";

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Correção de Cadastro Necessária</title>
          <style>
            body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; }
            .header { background-color: #f97316; color: #ffffff; padding: 20px; text-align: center; }
            .content { padding: 30px; }
            .button { display: inline-block; background-color: #f97316; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h1>Olá, ${promoterData.name}!</h1></div>
            <div class="content">
                <p>Notamos que seu cadastro para o evento <strong>${replacements.campaignName}</strong> precisa de algumas correções antes de ser aprovado.</p>
                ${rejectionReasonHtml}
                <p>Por favor, clique no botão abaixo para acessar seu cadastro, fazer as correções necessárias e reenviá-lo para análise.</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="${editLink}" class="button">Corrigir Meu Cadastro</a>
                </p>
                <p>Atenciosamente,<br>Equipe ${replacements.orgName}</p>
            </div>
        </div>
    </body>
    </html>`;
    sendSmtpEmail.htmlContent = htmlContent;
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
  const leaveGroupLink = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoter.id}&campaignName=${encodeURIComponent(postDetails.campaignName)}&orgId=${postDetails.organizationId}`;
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
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
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
            <div class="footer">
                <p>Não quer mais fazer parte deste grupo de divulgação? <a href="${leaveGroupLink}">Solicite sua remoção</a>.</p>
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
 * @param {object} promoter - The promoter data object (this is an assignment object).
 * @param {object} postDetails - Object with campaignName, orgName, etc.
 */
async function sendProofReminderEmail(promoter, postDetails) {
  if (!brevoApiInstance) {
    console.warn(`Skipping proof reminder email for ${promoter.promoterEmail}: Brevo API is not configured.`);
    return;
  }

  const proofLink = `https://divulgadoras.vercel.app/#/proof/${promoter.id}`;
  const leaveGroupLink = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoter.promoterId}&campaignName=${encodeURIComponent(postDetails.campaignName)}&orgId=${promoter.organizationId}`;
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
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
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
            <div class="footer">
                <p>Não quer mais fazer parte deste grupo de divulgação? <a href="${leaveGroupLink}">Solicite sua remoção</a>.</p>
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
 * Sends a reminder email to a promoter to confirm a post.
 * @param {object} promoter - The promoter data object (this is an assignment object).
 * @param {object} postDetails - Object with campaignName, orgName, etc.
 * @param {string} promoterId - The promoter's document ID.
 */
async function sendPendingPostReminderEmail(promoter, postDetails, promoterId) {
  if (!brevoApiInstance) {
    console.warn(`Skipping pending post reminder email for ${promoter.promoterEmail}: Brevo API is not configured.`);
    return;
  }

  const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.promoterEmail)}`;
  const leaveGroupLink = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoterId}&campaignName=${encodeURIComponent(postDetails.campaignName)}&orgId=${postDetails.organizationId}`;
  const eventDisplayName = postDetails.eventName ? `${postDetails.campaignName} - ${postDetails.eventName}` : postDetails.campaignName;
  const subject = `Lembrete: Você tem uma nova postagem para confirmar - ${eventDisplayName}`;
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
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #888; }
            .button { display: inline-block; background-color: #e83a93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h1>Olá, ${promoter.promoterName}!</h1></div>
            <div class="content">
                <p>Este é um lembrete de que uma nova publicação para o evento <strong>${eventDisplayName}</strong> está aguardando sua confirmação.</p>
                <p>Acesse o portal para ver as instruções e confirmar se você irá realizar a postagem.</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="${portalLink}" class="button">Ver Publicação</a>
                </p>
                <p>Atenciosamente,<br>Equipe ${postDetails.orgName}</p>
            </div>
            <div class="footer">
                <p>Não quer mais fazer parte deste grupo de divulgação? <a href="${leaveGroupLink}">Solicite sua remoção</a>.</p>
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
    console.log(`Pending post reminder sent to ${promoter.promoterEmail}`);
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send pending post reminder to ${promoter.promoterEmail}. Details: ${detailedError}`);
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
 * Sends a newsletter to a specified audience of promoters.
 * This is a superadmin-only function.
 */
exports.sendNewsletter = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      // 1. Authentication and Authorization
      if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
      }
      const isCallerSuperAdmin = await isSuperAdmin(context.auth.uid);
      if (!isCallerSuperAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
      }

      // 2. Data Validation
      const { audience, subject, body } = data;
      if (!audience || !audience.type || !subject || !body) {
        throw new functions.https.HttpsError("invalid-argument", "Argumentos inválidos: público, assunto e corpo são obrigatórios.");
      }
      if (!brevoApiInstance) {
        throw new functions.https.HttpsError("failed-precondition", "O serviço de e-mail não está configurado no servidor.");
      }

      // 3. Build Firestore Query
      let query = db.collection("promoters").where("status", "==", "approved");
      let audienceDescription = "todas as divulgadoras aprovadas";

      if (audience.type === "org" && audience.orgId) {
        query = query.where("organizationId", "==", audience.orgId);
        const orgDoc = await db.collection("organizations").doc(audience.orgId).get();
        audienceDescription = `divulgadoras da organização "${orgDoc.data()?.name || audience.orgId}"`;
      } else if (audience.type === "campaign" && audience.campaignId) {
        const campaignDoc = await db.collection("campaigns").doc(audience.campaignId).get();
        if (!campaignDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Evento/Campanha não encontrado(a).");
        }
        const campaignData = campaignDoc.data();
        // This query requires a composite index on allCampaigns.
        query = query.where("allCampaigns", "array-contains", campaignData.name);
        audienceDescription = `divulgadoras do evento "${campaignData.name}"`;
      }

      // 4. Fetch Promoters
      const snapshot = await query.get();
      if (snapshot.empty) {
        return { success: true, message: "Nenhuma divulgadora encontrada para o público selecionado. Nenhum e-mail foi enviado." };
      }
      const promoters = snapshot.docs.map((doc) => doc.data());

      // 5. Send Emails
      const baseHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;color:#333;line-height:1.6;}.container{max-width:600px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:5px;}</style></head><body><div class="container">{{content}}</div></body></html>`;
      const htmlBody = body.replace(/\n/g, "<br>");
      
      let successCount = 0;
      // Using a simple loop for now as batch sending with personalization can be complex.
      for (const promoter of promoters) {
          const sendSmtpEmail = new Brevo.SendSmtpEmail();
          
          const personalizedBody = htmlBody.replace(/{{promoterName}}/g, promoter.name);
          sendSmtpEmail.htmlContent = baseHtml.replace("{{content}}", personalizedBody);
          sendSmtpEmail.subject = subject;
          sendSmtpEmail.sender = { name: "Equipe Certa", email: brevoConfig.sender_email };
          sendSmtpEmail.to = [{ email: promoter.email, name: promoter.name }];

          try {
            await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
            successCount++;
          } catch (error) {
              const detailedError = getBrevoErrorDetails(error);
              console.error(`[Newsletter] Failed to send to ${promoter.email}. Details: ${detailedError}`);
          }
      }

      // 6. Return Result
      const message = `Newsletter enviada para ${successCount} de ${promoters.length} divulgadoras em "${audienceDescription}".`;
      console.log(message);
      return { success: true, message: message };
    });

/**
 * Removes a promoter from all their active (pending or confirmed) post assignments.
 * This is typically used when they leave a group.
 */
exports.removePromoterFromAllAssignments = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      // Auth check
      if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
      }
      const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
      if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
      }

      const { promoterId } = data;
      if (!promoterId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
      }

      const assignmentsRef = db.collection("postAssignments");
      const query = assignmentsRef
          .where("promoterId", "==", promoterId)
          .where("status", "in", ["pending", "confirmed"]);

      const snapshot = await query.get();
      if (snapshot.empty) {
        return { success: true, message: "Nenhuma tarefa ativa encontrada para remover." };
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return { success: true, count: snapshot.size, message: `${snapshot.size} tarefa(s) ativa(s) foram removidas.` };
    });

/**
 * Sends reminder emails to all promoters who have confirmed a post but not yet submitted proof.
 */
exports.sendPostReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists || !["admin", "superadmin", "poster"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
    }

    const { postId } = data;
    if (!postId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da publicação é obrigatório.");
    }

    const postDoc = await db.collection("posts").doc(postId).get();
    if (!postDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    }
    const postData = postDoc.data();
    const orgId = postData.organizationId;
    if (!orgId) {
        console.log(`[sendPostReminder] Aborting: Post ${postId} has no organizationId.`);
        return { success: true, count: 0, message: "A publicação não pertence a uma organização." };
    }

    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (orgDoc.exists && orgDoc.data().emailRemindersEnabled === false) {
        console.log(`[sendPostReminder] Aborting: Email reminders are disabled for organization ${orgId}.`);
        return { success: true, count: 0, message: "Lembretes por e-mail estão desabilitados para esta organização." };
    }

    const assignmentsRef = db.collection("postAssignments");
    const query = assignmentsRef
        .where("postId", "==", postId)
        .where("status", "==", "confirmed")
        .where("proofSubmittedAt", "==", null);

    const snapshot = await query.get();

    if (snapshot.empty) {
        return { success: true, count: 0, message: "Nenhuma divulgadora pendente de comprovação para este post." };
    }

    const assignmentsToSend = [];
    snapshot.forEach((doc) => {
        const assignment = doc.data();
        if (!assignment.justification) {
            assignmentsToSend.push({ id: doc.id, ...assignment });
        }
    });

    if (assignmentsToSend.length === 0) {
        return { success: true, count: 0, message: "Nenhuma divulgadora pendente encontrada (algumas podem ter justificativas)." };
    }

    let orgName = "Sua Organização";
    if (orgDoc.exists) {
        orgName = orgDoc.data().name;
    }

    const emailPromises = assignmentsToSend.map((assignment) => {
        const postDetails = {
            campaignName: assignment.post.campaignName,
            orgName: orgName,
        };
        return sendProofReminderEmail(assignment, postDetails);
    });

    await Promise.all(emailPromises);

    const count = assignmentsToSend.length;
    return { success: true, count: count, message: `${count} lembrete(s) enviado(s) com sucesso.` };
});

/**
 * Sends reminder emails to all promoters who have not yet confirmed a post.
 */
exports.sendPendingReminders = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists || !["admin", "superadmin", "poster"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
    }

    const { postId } = data;
    if (!postId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da publicação é obrigatório.");
    }
    
    const postDoc = await db.collection("posts").doc(postId).get();
    if (!postDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    }
    const postData = postDoc.data();
    const orgId = postData.organizationId;
    if (!orgId) {
        console.log(`[sendPendingReminders] Aborting: Post ${postId} has no organizationId.`);
        return { success: true, count: 0, message: "A publicação não pertence a uma organização." };
    }

    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (orgDoc.exists && orgDoc.data().emailRemindersEnabled === false) {
        console.log(`[sendPendingReminders] Aborting: Email reminders are disabled for organization ${orgId}.`);
        return { success: true, count: 0, message: "Lembretes por e-mail estão desabilitados para esta organização." };
    }

    const assignmentsRef = db.collection("postAssignments");
    const query = assignmentsRef
        .where("postId", "==", postId)
        .where("status", "==", "pending");

    const snapshot = await query.get();

    if (snapshot.empty) {
        return { success: true, count: 0, message: "Nenhuma divulgadora pendente de confirmação para este post." };
    }

    const assignmentsToSend = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    let orgName = "Sua Organização";
    if (orgDoc.exists) {
        orgName = orgDoc.data().name;
    }

    const emailPromises = assignmentsToSend.map((assignment) => {
        const postDetails = {
            campaignName: assignment.post.campaignName,
            eventName: assignment.post.eventName,
            orgName: orgName,
            organizationId: orgId,
        };
        return sendPendingPostReminderEmail(assignment, postDetails, assignment.promoterId);
    });

    await Promise.all(emailPromises);

    const count = assignmentsToSend.length;
    return { success: true, count: count, message: `${count} lembrete(s) para pendentes enviado(s) com sucesso.` };
});


// Placeholder for createPostAndAssignments
exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postData, assignedPromoters } = data;
    const batch = db.batch();

    // Create Post
    const postRef = db.collection("posts").doc();
    batch.set(postRef, { ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    // Create Assignments
    assignedPromoters.forEach(promoter => {
        const assignmentRef = db.collection("postAssignments").doc();
        const newAssignment = {
            postId: postRef.id,
            post: {
                ...postData,
                // Ensure denormalized fields match the main post
                skipProofRequirement: postData.skipProofRequirement || false,
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
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists || !['admin', 'superadmin', 'poster'].includes(adminDoc.data().role)) {
         throw new functions.https.HttpsError("permission-denied", "Acesso negado.");
    }

    const { postId, promoterIds } = data;
    if (!postId || !Array.isArray(promoterIds) || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "ID da publicação e lista de divulgadoras são obrigatórios.");
    }

    // Fetch Post data
    const postRef = db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    }
    const postData = postSnap.data();

    // Fetch Promoter data in chunks
    const promoters = [];
    const promoterChunks = [];
    for (let i = 0; i < promoterIds.length; i += 30) {
        promoterChunks.push(promoterIds.slice(i, i + 30));
    }

    for (const chunk of promoterChunks) {
        const promotersQuery = db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", chunk);
        const snapshot = await promotersQuery.get();
        snapshot.forEach(doc => promoters.push({ id: doc.id, ...doc.data() }));
    }

    if (promoters.length === 0) {
        throw new functions.https.HttpsError("not-found", "Nenhuma divulgadora válida foi encontrada para atribuição.");
    }
    
    // Denormalized post data to be stored in each assignment
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
    };
    
    // Batch create assignments
    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    promoters.forEach(promoter => {
        const assignmentDocRef = assignmentsCollectionRef.doc(); // Auto-generate ID
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

// Placeholder for updatePostStatus
exports.updatePostStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    // Implementation needed
});