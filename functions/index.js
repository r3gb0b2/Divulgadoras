const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/onCall");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

/**
 * Creates and sends an email document to the `mail` collection
 * which is then picked up by the 'Trigger Email' Firebase Extension.
 * @param {string} email The recipient's email address.
 * @param {string} subject The subject of the email.
 * @param {string} html The HTML content of the email.
 */
const sendEmail = (email, subject, html) => {
  return db.collection("mail").add({
    to: [email],
    message: {
      subject,
      html,
    },
  });
};

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
 * If a promoter's status changes, it triggers an email notification.
 */
exports.onPromoterStatusChange = functions.firestore
  .document("promoters/{promoterId}")
  .onUpdate(async (change, context) => {
    const { promoterId } = context.params;
    const logPrefix = `[Func: onPromoterStatusChange][ID: ${promoterId}]`;
    logger.info(`${logPrefix} Execution started.`);

    const beforeData = change.before.data();
    const afterData = change.after.data();

    // 1. Exit if status has not changed
    if (beforeData.status === afterData.status) {
      logger.info(`${logPrefix} Status unchanged ('${afterData.status}'). Exiting.`);
      return null;
    }

    logger.info(`${logPrefix} Status changed from '${beforeData.status}' to '${afterData.status}'.`);
    
    // 2. Exit if the new status should not trigger an email
    const shouldSendEmail = afterData.status === 'approved' || afterData.status === 'rejected';
    if (!shouldSendEmail) {
        logger.info(`${logPrefix} New status '${afterData.status}' does not trigger an email. Exiting.`);
        return null;
    }

    // 3. Validate essential promoter data
    if (!afterData.email || !afterData.name) {
      logger.error(`${logPrefix} Promoter document is missing required fields 'email' or 'name'. Cannot send notification. Data:`, afterData);
      return null;
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

    // 7. Create the final mail document object to be sent to the extension
    const mailDocument = {
        to: [promoterData.email],
        message: {
            subject,
            html,
        },
    };
    
    logger.info(`${logPrefix} Final mail document to be created:`, JSON.stringify(mailDocument));

    // 8. Write the document to the 'mail' collection for the extension to pick up
    try {
        const mailResult = await db.collection("mail").add(mailDocument);
        logger.info(`${logPrefix} SUCCESS! Created mail document with ID: ${mailResult.id}. The 'Trigger Email' extension should now process it.`);
    } catch (error) {
        logger.error(`${logPrefix} CRITICAL ERROR! Failed to write mail document to Firestore collection 'mail'. The email was NOT sent.`, error);
    }
    
    return null;
  });