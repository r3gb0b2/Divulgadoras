
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('@getbrevo/brevo');
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();

/**
 * Checks if the calling user is a superadmin.
 * @param {object} auth - The context.auth object from the callable function.
 * @throws {functions.https.HttpsError} If the user is not authenticated or not a superadmin.
 */
const requireSuperAdmin = async (auth) => {
    if (!auth || !auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Ação requer autenticação.');
    }
    const adminDocRef = admin.firestore().collection('admins').doc(auth.uid);
    const adminDoc = await adminDocRef.get();

    if (adminDoc.exists) {
        const adminData = adminDoc.data();
        if (adminData && adminData.role === 'superadmin') {
            functions.logger.info(`Superadmin access granted for UID: ${auth.uid}.`);
            return;
        }
    } else {
        // Doc doesn't exist, check for hardcoded superadmin email for first-time setup.
        if (auth.token && auth.token.email === 'r3gb0b@gmail.com') {
            functions.logger.warn(`Admin doc for superadmin email ${auth.token.email} not found. Creating it now.`);
            const superAdminPayload = {
                email: auth.token.email,
                role: 'superadmin',
                assignedStates: [],
            };
            await adminDocRef.set(superAdminPayload);
            functions.logger.info(`Superadmin doc created for UID: ${auth.uid}. Granting access.`);
            return;
        }
    }

    // If we reach this point, access is denied. Log the reason for debugging.
    const adminDataIfPresent = adminDoc.exists ? adminDoc.data() : null;
    const role = adminDataIfPresent ? adminDataIfPresent.role : 'documento não encontrado';
    functions.logger.warn(`Permission denied for UID: ${auth.uid}. Role is '${role}'.`);
    throw new functions.https.HttpsError('permission-denied', 'Você não tem permissão para executar esta ação.');
};

// --- Centralized Email Logic ---

/**
 * Creates the default HTML for an 'approved' status email.
 * This is the fallback if no custom template is set.
 * @returns {string} The full default HTML email content with placeholders.
 */
const generateDefaultApprovedEmailHtml = () => {
    const currentYear = new Date().getFullYear();
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sua candidatura foi aprovada!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #16213e; color: #f0f0f0;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <h1 style="color: #e83a93; font-size: 28px; margin: 0;">Equipe Certa</h1>
            </td>
        </tr>
        <tr>
            <td bgcolor="#1a1a2e" style="padding: 40px 30px; border-radius: 8px;">
                <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Parabéns, {{promoterName}}!</h2>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5;">
                    Temos uma ótima notícia! Sua candidatura para o evento/gênero <strong>{{campaignName}}</strong> da organização <strong>{{orgName}}</strong> foi <strong>APROVADA</strong>.
                </p>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5;">
                    Estamos muito felizes em ter você em nossa equipe! Clique no botão abaixo para acessar seu portal, ver os próximos passos e entrar no grupo oficial.
                </p>
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td align="center" style="padding: 20px 0;">
                            <!-- PORTAL_BUTTON -->
                        </td>
                    </tr>
                </table>
                <p style="color: #b3b3b3; font-size: 14px; line-height: 1.5; text-align: center;">
                    O link já está configurado com seu e-mail de acesso.
                </p>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5; margin-top: 20px;">
                    Atenciosamente,<br>
                    Equipe {{orgName}}
                </p>
            </td>
        </tr>
        <tr>
            <td align="center" style="padding: 20px 0; font-size: 12px; color: #888;">
                <p>&copy; ${currentYear} Equipe Certa. Todos os direitos reservados.</p>
                <p>E-mail enviado via Brevo (v9.2).</p>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

/**
 * [ROBUST] Fetches the raw HTML template for approved emails.
 * This function now ALWAYS returns the default template, ignoring Firestore.
 * @returns {Promise<string>} The raw HTML template string with placeholders.
 */
const getRawApprovedEmailTemplate = async () => {
    functions.logger.info("Using default email template.");
    return generateDefaultApprovedEmailHtml();
};


/**
 * Replaces placeholders in an HTML string with actual data.
 * @param {string} htmlContent - The raw HTML with placeholders.
 * @param {object} data - An object containing data like promoterName, etc.
 * @returns {string} The populated HTML string.
 */
const populateTemplate = (htmlContent, data) => {
    // Construct the correct portal link with the encoded recipient email.
    const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(data.recipientEmail || '')}`;
    
    // Define the full HTML for the button. This will replace the comment placeholder in the default template.
    const portalButtonHtml = `<a href="${portalLink}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: bold; color: #ffffff; background-color: #e83a93; text-decoration: none; border-radius: 5px;">Acessar Portal da Divulgadora</a>`;
    
    let populatedHtml = String(htmlContent);
    
    // Replace standard placeholders
    populatedHtml = populatedHtml.replace(/{{promoterName}}/g, data.promoterName || '');
    populatedHtml = populatedHtml.replace(/{{campaignName}}/g, data.campaignName || '');
    populatedHtml = populatedHtml.replace(/{{orgName}}/g, data.orgName || '');
    populatedHtml = populatedHtml.replace(/{{recipientEmail}}/g, data.recipientEmail || '');
    
    // New replacement for the default template's placeholder comment.
    populatedHtml = populatedHtml.replace('<!-- PORTAL_BUTTON -->', portalButtonHtml);
    
    // For backward compatibility with custom templates that might still use {{portalLink}}, we replace it with just the URL.
    populatedHtml = populatedHtml.replace(/{{portalLink}}/g, portalLink);
    
    return populatedHtml;
};

/**
 * [CENTRALIZED] Gets the raw template and populates it with data.
 * @param {object} promoterData - Data object for populating the template.
 * @returns {Promise<{htmlContent: string, subject: string}>} The final email content and subject.
 */
const getPopulatedApprovedEmail = async (promoterData) => {
    const rawHtml = await getRawApprovedEmailTemplate();
    const htmlContent = populateTemplate(rawHtml, promoterData);
    const subject = `✅ Parabéns! Sua candidatura para ${promoterData.orgName} foi aprovada!`;
    return { htmlContent, subject };
};

/**
 * Sends an email using the Brevo (Sendinblue) API.
 * @param {string} recipientEmail - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 * @param {string} htmlContent - The HTML body of the email.
 * @throws {functions.https.HttpsError} If config is missing or API call fails.
 */
const sendBrevoEmail = async (recipientEmail, subject, htmlContent) => {
    const brevoConfig = functions.config().brevo;
    if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email) {
        console.error("Brevo config is missing in Firebase environment.", { brevoConfig });
        throw new functions.https.HttpsError('failed-precondition', 'A configuração da API de e-mail (Brevo) não foi encontrada no servidor.');
    }

    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = brevoConfig.key;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: "Equipe Certa", email: brevoConfig.sender_email };
    sendSmtpEmail.to = [{ email: recipientEmail }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        functions.logger.info(`Email sent successfully to ${recipientEmail} via Brevo.`);
    } catch (error) {
        console.error("Failed to send email via Brevo:", error.body || error.message);
        const errorMessage = error.body ? JSON.stringify(error.body) : error.message;
        
        let detailedMessage = "Ocorreu um erro desconhecido na API do Brevo.";
        if (errorMessage.includes("Invalid API key")) {
            detailedMessage = "A chave da API Brevo configurada é inválida.";
        } else if (errorMessage.includes("Sender not authorized")) {
            detailedMessage = `O e-mail remetente '${brevoConfig.sender_email}' não foi validado na sua conta Brevo.`;
        } else {
            detailedMessage = errorMessage;
        }

        throw new functions.https.HttpsError('internal', `Falha na comunicação com a API de e-mail (Brevo).`, {
             originalError: detailedMessage,
        });
    }
};

// --- System & Diagnostic Functions ---

exports.getSystemStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const FUNCTION_VERSION = "9.2-REFACTOR-3";
        try {
            if (!context.auth) {
                throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
            }

            const brevoConfig = functions.config().brevo;
            const status = {
                functionVersion: FUNCTION_VERSION,
                emailProvider: "Brevo",
                configured: false,
                message: "Configuração da API Brevo incompleta ou ausente.",
                details: []
            };

            if (brevoConfig && brevoConfig.key && brevoConfig.sender_email) {
                try {
                    const defaultClient = SibApiV3Sdk.ApiClient.instance;
                    const apiKey = defaultClient.authentications['api-key'];
                    apiKey.apiKey = brevoConfig.key;
                    
                    const accountApi = new SibApiV3Sdk.AccountApi();
                    await accountApi.getAccount();

                    status.configured = true;
                    status.message = "API da Brevo configurada e chave VÁLIDA.";
                } catch (validationError) {
                    console.error("Brevo API key validation failed:", validationError.body || validationError.message);
                    status.configured = false;
                    status.message = "A chave da API Brevo configurada parece ser INVÁLIDA.";
                    status.details.push(validationError.body ? JSON.stringify(validationError.body) : validationError.message);
                }
            } else {
                if (!brevoConfig) status.details.push("O grupo 'brevo' está ausente.");
                else {
                    if (!brevoConfig.key) status.details.push("A variável 'brevo.key' está faltando.");
                    if (!brevoConfig.sender_email) status.details.push("A variável 'brevo.sender_email' está faltando.");
                }
            }
            return status;
        } catch (error) {
            console.error(`CRITICAL ERROR in getSystemStatus (v${FUNCTION_VERSION})`, error);
            return {
                functionVersion: FUNCTION_VERSION,
                emailProvider: "Erro no Servidor",
                configured: false,
                message: "A função de verificação do sistema falhou no servidor.",
                details: [error.message, `Stack: ${error.stack}`]
            };
        }
    });

exports.sendTestEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const userEmail = 'r3gb0b@gmail.com';
        const { testType } = data;
        functions.logger.info(`[TEST EMAIL TRIGGER] for user: ${userEmail}, type: ${testType}`);

        try {
            const testData = {
                promoterName: "Divulgadora de Teste",
                campaignName: "Evento de Teste",
                orgName: "Organização de Teste",
                recipientEmail: userEmail,
            };
            const footer = `<hr><p style="font-size: 10px; color: #888;">Este é um e-mail de teste enviado via Brevo (v9.2).</p>`;
            let subject = '';
            let htmlContent = '';

            switch (testType) {
                case 'approved': {
                    const populated = await getPopulatedApprovedEmail(testData);
                    subject = `✅ (TESTE) ${populated.subject}`;
                    htmlContent = populated.htmlContent;
                    break;
                }
                case 'rejected': {
                    subject = `(TESTE) Resultado da sua candidatura para ${testData.orgName}`;
                    htmlContent = `<p>Olá, ${testData.promoterName},</p><p>Este é um teste do e-mail de rejeição.</p><p>Atenciosamente,<br/>Equipe Certa</p>${footer}`;
                    break;
                }
                default: { // generic
                    subject = "✅ Teste de Conexão - Equipe Certa (Brevo)";
                    htmlContent = `<h1>Olá!</h1><p>Se você recebeu este e-mail, a conexão com o <strong>Brevo</strong> está <strong>funcionando!</strong></p>${footer}`;
                }
            }

            await sendBrevoEmail(userEmail, subject, htmlContent);
            return { success: true, message: `E-mail de teste (${testType}) enviado para ${userEmail}.` };
        } catch (error) {
            functions.logger.error(`FATAL ERROR in sendTestEmail (type: ${testType})`, { error });
            if (error instanceof functions.https.HttpsError) throw error;
            throw new functions.https.HttpsError('internal', 'Falha ao enviar e--mail de teste.', { originalError: error.message });
        }
    });

// --- Main Email Automation Functions ---

exports.sendPromoterStatusEmail = functions
    .region("southamerica-east1")
    .firestore.document('promoters/{promoterId}')
    .onUpdate(async (change, context) => {
        const promoterId = context.params.promoterId;
        const beforeData = change.before.data();
        const afterData = change.after.data();

        if (beforeData?.status !== 'pending' || afterData?.status !== 'approved') {
            return null;
        }

        try {
            const orgDoc = await admin.firestore().collection('organizations').doc(afterData.organizationId).get();
            const promoterData = {
                promoterName: afterData.name || 'Candidato(a)',
                campaignName: afterData.campaignName || "nossa equipe",
                recipientEmail: afterData.email,
                orgName: orgDoc.exists ? orgDoc.data().name : 'Nossa Equipe',
            };
            if (!promoterData.recipientEmail) throw new Error(`Promoter ${promoterId} has no email.`);

            const { htmlContent, subject } = await getPopulatedApprovedEmail(promoterData);
            
            await sendBrevoEmail(promoterData.recipientEmail, subject, htmlContent);
            functions.logger.info(`[SUCCESS] Approval email sent to ${promoterData.recipientEmail}.`);
            return { success: true };
        } catch (error) {
             functions.logger.error(`[FATAL ERROR] sendPromoterStatusEmail for ${promoterId}.`, { error });
            return null;
        }
    });

exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Ação requer autenticação.');
        const { promoterId } = data;
        if (!promoterId) throw new functions.https.HttpsError('invalid-argument', 'O ID da divulgadora é obrigatório.');

        const provider = "Brevo (v9.2)";
        functions.logger.info(`[MANUAL TRIGGER] for promoterId: ${promoterId} by ${context.auth.token.email}`);

        try {
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada.');
            
            const promoterData = promoterDoc.data();
            if (promoterData.status !== 'approved') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar candidaturas aprovadas.');
            }
            if (!promoterData.email) throw new functions.https.HttpsError('failed-precondition', 'Divulgadora sem e-mail válido.');

            const orgDoc = await admin.firestore().collection('organizations').doc(promoterData.organizationId).get();
            const finalData = {
                promoterName: promoterData.name,
                campaignName: promoterData.campaignName,
                recipientEmail: promoterData.email,
                orgName: orgDoc.exists ? orgDoc.data().name : 'Nossa Equipe',
            };

            const { htmlContent, subject } = await getPopulatedApprovedEmail(finalData);
            
            await sendBrevoEmail(finalData.recipientEmail, subject, htmlContent);
            return { success: true, message: `E-mail enviado para ${finalData.recipientEmail}.`, provider };
        } catch (error) {
            functions.logger.error("FATAL ERROR in manuallySendStatusEmail", { promoterId, error });
            if (error instanceof functions.https.HttpsError) throw error;
            throw new functions.https.HttpsError('internal', 'Falha na API de envio de e-mail.', { originalError: error.message, provider });
        }
    });

// --- Gemini AI Function ---

exports.askGemini = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Ação requer autenticação.');
        const { prompt } = data;
        if (!prompt) throw new functions.https.HttpsError('invalid-argument', 'O comando (prompt) não pode estar vazio.');

        const geminiConfig = functions.config().gemini;
        if (!geminiConfig || !geminiConfig.key) {
            throw new functions.https.HttpsError('failed-precondition', 'A chave da API Gemini não foi configurada no servidor.');
        }

        try {
            const ai = new GoogleGenAI({ apiKey: geminiConfig.key });
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            
            if (response.promptFeedback?.blockReason) {
                throw new functions.https.HttpsError('invalid-argument', `Sua solicitação foi bloqueada: ${response.promptFeedback.blockReason}.`);
            }
            if (!response.text || response.text.trim() === '') {
                 throw new functions.https.HttpsError('internal', `A API finalizou por um motivo inesperado: ${response.candidates?.[0]?.finishReason}.`);
            }
            return { text: response.text };
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            const userMessage = error.message.includes('API key not valid') ? 'A chave da API Gemini é inválida.' : 'Erro ao comunicar com o assistente de IA.';
            throw new functions.https.HttpsError('internal', userMessage, { originalError: error.toString() });
        }
    });
