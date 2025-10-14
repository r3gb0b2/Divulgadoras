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
        <p>Temos uma ótima notícia! Sua candidatura para <strong>${promoter.campaignName || 'divulgadora'}</strong> na organização <strong>${promoter.organizationName || ''}</strong> foi <strong>APROVADA</strong>.</p>
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
        <p>Agradecemos imensamente o seu interesse em fazer parte da nossa equipe de divulgadoras para <strong>${promoter.campaignName || ''}</strong> na organização <strong>${promoter.organizationName || ''}</strong>.</p>
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
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Exit if status has not changed
    if (beforeData.status === afterData.status) {
      return null;
    }

    logger.info(`Status changed for promoter ${context.params.promoterId} from ${beforeData.status} to ${afterData.status}`);

    try {
        let organizationName = "Nossa Equipe";
        if (afterData.organizationId) {
            const orgDoc = await db.collection('organizations').doc(afterData.organizationId).get();
            if (orgDoc.exists) {
                organizationName = orgDoc.data().name;
            }
        }
        
        const promoterData = { ...afterData, organizationName };

        if (afterData.status === 'approved') {
            const subject = `Parabéns! Sua candidatura para ${promoterData.organizationName} foi aprovada!`;
            const html = createApprovedEmailHtml(promoterData);
            await sendEmail(promoterData.email, subject, html);
            logger.info(`Approval email queued for ${promoterData.email}`);

        } else if (afterData.status === 'rejected') {
            const subject = `Resultado da sua candidatura para ${promoterData.organizationName}`;
            const html = createRejectedEmailHtml(promoterData);
            await sendEmail(promoterData.email, subject, html);
            logger.info(`Rejection email queued for ${promoterData.email}`);
        }

    } catch (error) {
        logger.error("Failed to send status change email", error);
        // We don't re-throw the error, as that could cause infinite retries.
        // The error is logged for monitoring.
    }

    return null;
  });
