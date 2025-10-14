const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const SibApiV3Sdk = require("sib-api-v3-sdk");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

/**
 * Email template for approved promoters.
 * @param {object} promoter The promoter's data object.
 * @returns {string} The HTML email content.
 */
const createApprovedEmailHtml = (promoter) => {
  const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
  return `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h1 style="color: #e83a93; text-align: center;">Parabéns, ${promoter.name}!</h1>
        <p>Temos uma ótima notícia! Sua candidatura para <strong>${promoter.campaignName}</strong> na organização <strong>${promoter.organizationName}</strong> foi <strong>APROVADA</strong>.</p>
        <p>Estamos muito felizes em ter você em nossa equipe!</p>
        <p>Para continuar, você precisa acessar seu portal para ler as regras e obter o link de acesso ao grupo oficial de divulgadoras.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${portalLink}" style="background-color: #e83a93; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Portal da Divulgadora</a>
        </div>
        <p>Lembre-se de usar o e-mail <strong>${promoter.email}</strong> para consultar seu status.</p>
        <p>Atenciosamente,<br/>Equipe Certa</p>
      </div>
    </div>
  `;
};

/**
 * Email template for rejected promoters.
 * @param {object} promoter The promoter's data object.
 * @returns {string} The HTML email content.
 */
const createRejectedEmailHtml = (promoter) => {
  return `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h1 style="color: #333; text-align: center;">Resultado da sua candidatura</h1>
        <p>Olá, ${promoter.name},</p>
        <p>Agradecemos imensamente o seu interesse em fazer parte da nossa equipe de divulgadoras para <strong>${promoter.campaignName}</strong> na organização <strong>${promoter.organizationName}</strong>.</p>
        <p>Analisamos cuidadosamente todos os perfis e, neste momento, não poderemos seguir com a sua candidatura. O processo seletivo é bastante concorrido e diversos fatores são levados em consideração.</p>
        <p>Desejamos sucesso em suas futuras oportunidades!</p>
        <p>Atenciosamente,<br/>Equipe Certa</p>
      </div>
    </div>
  `;
};


/**
 * Listens for updates on any document in the 'promoters' collection.
 * If a promoter's status changes, it triggers an email notification via the Brevo API.
 */
exports.onPromoterStatusChange = onDocumentUpdated("promoters/{promoterId}", async (event) => {
    const { promoterId } = event.params;
    const logPrefix = `[Func: onPromoterStatusChange][ID: ${promoterId}]`;
    logger.info(`${logPrefix} Execution started.`);

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // 1. Exit if status has not changed
    if (beforeData.status === afterData.status) {
      logger.info(`${logPrefix} Status unchanged ('${afterData.status}'). Exiting.`);
      return;
    }

    logger.info(`${logPrefix} Status changed from '${beforeData.status}' to '${afterData.status}'.`);
    
    // 2. Exit if the new status should not trigger an email
    const shouldSendEmail = afterData.status === 'approved' || afterData.status === 'rejected';
    if (!shouldSendEmail) {
        logger.info(`${logPrefix} New status '${afterData.status}' does not trigger an email. Exiting.`);
        return;
    }

    // 3. Validate essential promoter data
    if (!afterData.email || typeof afterData.email !== "string" || !afterData.name) {
      logger.error(`${logPrefix} Promoter document is missing required fields 'email' or 'name'. Cannot send notification. Data:`, afterData);
      return;
    }
    
    // 4. Prepare promoter data with defaults for templates
    const promoterData = {
        name: afterData.name,
        email: afterData.email,
        campaignName: afterData.campaignName || "nossa equipe",
        organizationId: afterData.organizationId,
        organizationName: "Nossa Equipe", // Default name
    };

    // 5. Fetch the organization name for a more personalized email
    if (promoterData.organizationId) {
        try {
            const orgDocRef = db.collection('organizations').doc(promoterData.organizationId);
            const orgDoc = await orgDocRef.get();
            if (orgDoc.exists) {
                promoterData.organizationName = orgDoc.data().name || "Nossa Equipe";
                logger.info(`${logPrefix} Fetched organization name: '${promoterData.organizationName}'.`);
            } else {
                logger.warn(`${logPrefix} Organization document with ID '${promoterData.organizationId}' not found.`);
            }
        } catch (orgError) {
            logger.error(`${logPrefix} Error fetching organization '${promoterData.organizationId}'. Will use default name.`, orgError);
        }
    } else {
         logger.warn(`${logPrefix} Promoter document has no 'organizationId'. Using default name.`);
    }

    // 6. Prepare email content based on new status
    let subject = "";
    let html = "";
    
    if (afterData.status === 'approved') {
        subject = `Parabéns! Sua candidatura para ${promoterData.organizationName} foi aprovada!`;
        html = createApprovedEmailHtml(promoterData);
        logger.info(`${logPrefix} Prepared 'approved' email content for ${promoterData.email}.`);
    } else { // status === 'rejected'
        subject = `Resultado da sua candidatura para ${promoterData.organizationName}`;
        html = createRejectedEmailHtml(promoterData);
        logger.info(`${logPrefix} Prepared 'rejected' email content for ${promoterData.email}.`);
    }

    // 7. Send email using Brevo (Sendinblue) API
    try {
        const brevoApiKey = functions.config().brevo?.key;
        const senderEmail = functions.config().brevo?.sender_email;
        const senderName = functions.config().brevo?.sender_name;

        if (!brevoApiKey || !senderEmail || !senderName) {
            logger.error(`${logPrefix} CRITICAL: Brevo API key or sender info not configured in Firebase environment. Run 'firebase functions:config:set brevo.key=... brevo.sender_email=... brevo.sender_name=...' and redeploy.`);
            return;
        }

        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        const apiKey = defaultClient.authentications["api-key"];
        apiKey.apiKey = brevoApiKey;

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html;
        sendSmtpEmail.sender = { name: senderName, email: senderEmail };
        sendSmtpEmail.to = [{ email: promoterData.email, name: promoterData.name }];

        logger.info(`${logPrefix} Sending transactional email via Brevo to ${promoterData.email}...`);
        
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        
        logger.info(`${logPrefix} SUCCESS! Brevo API responded successfully. Message ID:`, data.body.messageId);

    } catch (error) {
        // Brevo API errors often have a useful response body
        const errorBody = error.response ? JSON.stringify(error.response.body, null, 2) : error;
        logger.error(`${logPrefix} CRITICAL ERROR! Failed to send email via Brevo. Details:`, errorBody);
    }
  });