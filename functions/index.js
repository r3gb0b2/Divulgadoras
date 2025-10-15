const functions = require("firebase-functions");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('@getbrevo/brevo');
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();

const projectId = admin.app().options.projectId;
const baseUrl = `https://${projectId}.web.app`;

/**
 * Checks if the calling user is a superadmin by reading their role from Firestore.
 * This is necessary because custom claims are not being used in this project's auth flow.
 * @param {object} auth - The context.auth object from the callable function.
 * @throws {functions.https.HttpsError} If the user is not authenticated or not a superadmin.
 */
const requireSuperAdmin = async (auth) => {
    if (!auth || !auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Ação requer autenticação.');
    }
    const adminDoc = await admin.firestore().collection('admins').doc(auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'superadmin') {
        functions.logger.warn(`Permission denied for UID: ${auth.uid}. Role is not superadmin.`);
        throw new functions.https.HttpsError('permission-denied', 'Você não tem permissão para executar esta ação.');
    }
    functions.logger.info(`Superadmin access granted for UID: ${auth.uid}.`);
};


/**
 * Generates the HTML content for an approval email.
 * @param {string} promoterName - The name of the promoter.
 * @param {string} campaignName - The name of the campaign/event.
 * @param {string} orgName - The name of the organization.
 * @param {string} recipientEmail - The promoter's email address.
 * @returns {string} The full HTML email content.
 */
const generateApprovedEmailHtml = (promoterName, campaignName, orgName, recipientEmail) => {
    const portalLink = `${baseUrl}/#/status?email=${encodeURIComponent(recipientEmail)}`;
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
                <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0;">Parabéns, ${promoterName}!</h2>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5;">
                    Temos uma ótima notícia! Sua candidatura para o evento/gênero <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi <strong>APROVADA</strong>.
                </p>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5;">
                    Estamos muito felizes em ter você em nossa equipe! Para continuar e ter acesso ao grupo oficial, siga os próximos passos no seu portal.
                </p>
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td align="center" style="padding: 20px 0;">
                            <a href="${portalLink}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: bold; color: #ffffff; background-color: #e83a93; text-decoration: none; border-radius: 5px;">
                                Acessar Portal da Divulgadora
                            </a>
                        </td>
                    </tr>
                </table>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5;">
                    Para verificar seu status a qualquer momento, use o e-mail: <strong>${recipientEmail}</strong>.
                </p>
                <p style="color: #cccccc; font-size: 16px; line-height: 1.5;">
                    Atenciosamente,<br>
                    Equipe ${orgName}
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
 * Fetches custom template or returns default, then replaces placeholders.
 * @param {string} promoterName - The name of the promoter.
 * @param {string} campaignName - The name of the campaign/event.
 * @param {string} orgName - The name of the organization.
 * @param {string} recipientEmail - The promoter's email address.
 * @returns {Promise<string>} The full HTML email content.
 */
const getApprovedEmailContent = async (promoterName, campaignName, orgName, recipientEmail) => {
    const templateDoc = await admin.firestore().collection('settings').doc('emailTemplates').get();
    let htmlContent = '';
    const portalLink = `${baseUrl}/#/status?email=${encodeURIComponent(recipientEmail)}`;

    if (templateDoc.exists && templateDoc.data().approvedPromoterHtml) {
        functions.logger.info("Using custom email template.");
        htmlContent = templateDoc.data().approvedPromoterHtml;
        // Replace all placeholders
        htmlContent = htmlContent.replace(/{{promoterName}}/g, promoterName)
                                 .replace(/{{campaignName}}/g, campaignName)
                                 .replace(/{{orgName}}/g, orgName)
                                 .replace(/{{portalLink}}/g, portalLink);
    } else {
        functions.logger.info("Using default email template.");
        htmlContent = generateApprovedEmailHtml(promoterName, campaignName, orgName, recipientEmail);
    }
    return htmlContent;
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
        } else if (errorMessage) {
            detailedMessage = errorMessage;
        }

        throw new functions.https.HttpsError('internal', `Falha na comunicação com a API de e-mail (Brevo).`, {
             originalError: detailedMessage,
        });
    }
};

exports.getSystemStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const FUNCTION_VERSION = "v9.2-BREVO-FIX-2";
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
                if (!brevoConfig) {
                    status.details.push("O grupo de configuração 'brevo' está ausente.");
                } else {
                    if (!brevoConfig.key) status.details.push("A variável 'brevo.key' está faltando.");
                    if (!brevoConfig.sender_email) status.details.push("A variável 'brevo.sender_email' está faltando.");
                }
                status.message = "Configuração do Brevo incompleta. Verifique as variáveis: " + (status.details.join(' ') || 'N/A');
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
        if (!context.auth || !context.auth.token.email) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado com um e-mail.');
        }
        const userEmail = 'r3gb0b@gmail.com';
        const testType = data.testType || 'generic';
        const customHtmlContent = data.customHtmlContent; // For template editor testing
        functions.logger.info(`[TEST EMAIL TRIGGER] for user: ${userEmail}, type: ${testType}`);

        try {
            let subject = '';
            let htmlContent = '';
            const orgName = "Organização de Teste";
            const promoterName = "Divulgadora de Teste";
            const campaignName = "Evento de Teste";
            const footer = `<hr><p style="font-size: 10px; color: #888;">Este é um e-mail de teste enviado via Brevo (v9.2).</p>`;


            if (testType === 'approved') {
                subject = `✅ (TESTE) Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = await getApprovedEmailContent(promoterName, campaignName, orgName, userEmail);
            } else if (testType === 'custom_approved' && customHtmlContent) {
                 subject = `✅ (TESTE DO EDITOR) Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                 const portalLink = `${baseUrl}/#/status?email=${encodeURIComponent(userEmail)}`;
                 htmlContent = customHtmlContent.replace(/{{promoterName}}/g, promoterName)
                                                .replace(/{{campaignName}}/g, campaignName)
                                                .replace(/{{orgName}}/g, orgName)
                                                .replace(/{{portalLink}}/g, portalLink);
            } else if (testType === 'rejected') {
                subject = `(TESTE) Resultado da sua candidatura para ${orgName}`;
                const reasonText = String("Este é um motivo de rejeição de teste.\nEle pode ter múltiplas linhas.");
                htmlContent = `
                    <p>Olá, ${promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${reasonText.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            } else { // 'generic'
                subject = "✅ Teste de Envio de E-mail - Equipe Certa (Brevo)";
                htmlContent = `
                    <html><body>
                        <h1>Olá!</h1>
                        <p>Se você está recebendo este e-mail, a integração com o <strong>Brevo</strong> está <strong>funcionando corretamente!</strong></p>
                        <p>Atenciosamente,<br/>Plataforma Equipe Certa</p>
                        ${footer.replace('Este é um e-mail de teste enviado', 'E--mail enviado')}
                    </body></html>`;
            }

            functions.logger.info(`Sending ${testType} test email to ${userEmail}...`);
            await sendBrevoEmail(userEmail, subject, htmlContent);
            functions.logger.info(`${testType} test email sent successfully via Brevo.`);

            return { success: true, message: `E-mail de teste (${testType}) enviado para ${userEmail}.` };
        } catch (error) {
            functions.logger.error(`FATAL ERROR in sendTestEmail (type: ${testType})`, {
                user: context.auth ? context.auth.token.email : "Unauthenticated",
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) throw error;
            
            const detailedMessage = error.details?.originalError || error.message || "Ocorreu um erro desconhecido no servidor de e-mails.";

            throw new functions.https.HttpsError('internal', 'Falha ao enviar e-mail de teste.', {
                originalError: detailedMessage,
            });
        }
    });

exports.sendPromoterStatusEmail = functions
    .region("southamerica-east1")
    .firestore.document('promoters/{promoterId}')
    .onUpdate(async (change, context) => {
        const promoterId = context.params.promoterId;
        
        try {
            const beforeData = change.before.data();
            const afterData = change.after.data();

            // Exit if status hasn't changed
            if (!beforeData || !afterData || beforeData.status === afterData.status) {
                return null;
            }
            
            // Only send email when status changes from 'pending' to 'approved'
            if (beforeData.status !== 'pending' || afterData.status !== 'approved') {
                functions.logger.info(`Not sending email for status change from ${beforeData.status} to ${afterData.status} for promoter ${promoterId}.`);
                return null;
            }
            
            const finalData = {
                promoterName: String(afterData.name || 'Candidato(a)'),
                campaignName: String(afterData.campaignName || "nossa equipe"),
                recipientEmail: String(afterData.email || ''),
                orgName: 'Nossa Equipe',
            };

            if (!finalData.recipientEmail) {
                functions.logger.error(`[FATAL EXIT] Promoter ${promoterId} has no valid email.`);
                return null;
            }
            
            if (afterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(String(afterData.organizationId)).get();
                if (orgDoc.exists) finalData.orgName = String(orgDoc.data().name);
            }

            const subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
            const htmlContent = await getApprovedEmailContent(
                finalData.promoterName,
                finalData.campaignName,
                finalData.orgName,
                finalData.recipientEmail
            );

            await sendBrevoEmail(finalData.recipientEmail, subject, htmlContent);
            
            functions.logger.info(`[SUCCESS] Email dispatched to ${finalData.recipientEmail} for promoter ${promoterId}.`);
            return { success: true };
        } catch (error) {
             functions.logger.error(`[FATAL ERROR] Failed to send promoter status email for promoterId: ${promoterId}.`, {
                rawErrorObject: error,
            });
            return null;
        }
    });

exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'A função só pode ser chamada por um usuário autenticado.');
        const { promoterId } = data;
        if (!promoterId) throw new functions.https.HttpsError('invalid-argument', 'O ID da divulgadora é obrigatório.');

        const provider = "Brevo (v9.2)";
        functions.logger.info(`[MANUAL TRIGGER] for promoterId: ${promoterId} by user: ${context.auth.token.email} via ${provider}`);

        try {
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada.');
            
            const promoterData = promoterDoc.data();
            if (promoterData.status !== 'approved') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado".');
            }

            const finalData = {
                promoterName: String(promoterData.name || 'Candidato(a)'),
                campaignName: String(promoterData.campaignName || "nossa equipe"),
                recipientEmail: String(promoterData.email || ''),
                orgName: 'Nossa Equipe',
            };
            
            if (!finalData.recipientEmail) throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido.');
            
            if (promoterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(String(promoterData.organizationId)).get();
                if (orgDoc.exists) finalData.orgName = String(orgDoc.data().name);
            }
            
            const subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
            const htmlContent = await getApprovedEmailContent(
                finalData.promoterName,
                finalData.campaignName,
                finalData.orgName,
                finalData.recipientEmail
            );
            
            await sendBrevoEmail(finalData.recipientEmail, subject, htmlContent);
            functions.logger.info(`[SUCCESS] Manual email sent to ${finalData.recipientEmail} for promoter ${promoterId}.`);

            return { success: true, message: `E-mail enviado com sucesso para ${finalData.recipientEmail}.`, provider };
        } catch (error) {
            functions.logger.error("FATAL ERROR in manuallySendStatusEmail", { promoterId: data.promoterId, user: context.auth.token.email, rawErrorObject: error });
            if (error instanceof functions.https.HttpsError) {
                error.details = { ...error.details, provider };
                throw error;
            }
            const detailedMessage = error.details?.originalError || error.message || "Ocorreu um erro desconhecido no servidor de e-mails.";
            throw new functions.https.HttpsError('internal', 'Falha na API de envio de e-mail.', { originalError: detailedMessage, provider });
        }
    });

exports.askGemini = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
        }

        const prompt = data.prompt;
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new functions.https.HttpsError('invalid-argument', 'O comando (prompt) não pode estar vazio.');
        }

        const geminiConfig = functions.config().gemini;
        if (!geminiConfig || !geminiConfig.key) {
            console.error("Gemini API key is missing in Firebase environment.", { geminiConfig });
            throw new functions.https.HttpsError('failed-precondition', 'A chave da API Gemini não foi configurada no servidor.');
        }

        try {
            const ai = new GoogleGenAI({ apiKey: geminiConfig.key });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            if (response.promptFeedback?.blockReason) {
                const blockReason = response.promptFeedback.blockReason;
                throw new functions.https.HttpsError('invalid-argument', `Sua solicitação foi bloqueada por motivos de segurança: ${blockReason}.`);
            }
            
            const text = response.text;
            
            if (text === undefined || text === null || text.trim() === '') {
                 const finishReason = response.candidates?.[0]?.finishReason;
                 if (finishReason && finishReason !== 'STOP') {
                     throw new functions.https.HttpsError('internal', `A API finalizou a geração por um motivo inesperado: ${finishReason}.`);
                 }
            }

            return { text: text || '' };

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            let userMessage = 'Ocorreu um erro ao se comunicar com o assistente de IA.';
            const originalMessage = error.message || '';

            if (originalMessage.toLowerCase().includes('api key not valid')) {
                userMessage = 'A chave da API Gemini configurada no servidor é inválida.';
            } else if (originalMessage.includes('billing')) {
                userMessage = 'O projeto do Google Cloud associado não tem faturamento ativo.';
            } else if (error.code === 'invalid-argument') {
                userMessage = originalMessage;
            }
            
            throw new functions.https.HttpsError('internal', userMessage, {
                originalError: error.toString(),
            });
        }
    });

// === EMAIL TEMPLATE FUNCTIONS ===

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context.auth);

    const templateDoc = await admin.firestore().collection('settings').doc('emailTemplates').get();
    if (templateDoc.exists && templateDoc.data().approvedPromoterHtml) {
        return { htmlContent: templateDoc.data().approvedPromoterHtml };
    }
    
    // Return default template if no custom one is found
    const defaultHtml = generateApprovedEmailHtml('{{promoterName}}', '{{campaignName}}', '{{orgName}}', '{{recipientEmail}}');
    return { htmlContent: defaultHtml };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context.auth);

    const { htmlContent } = data;
    if (typeof htmlContent !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'O conteúdo do template é inválido.');
    }

    await admin.firestore().collection('settings').doc('emailTemplates').set({
        approvedPromoterHtml: htmlContent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
    }, { merge: true });

    return { success: true, message: "Template de e-mail salvo com sucesso." };
});

exports.resetEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context.auth);
    
    // Deletes the field, making the system fall back to the default template.
    await admin.firestore().collection('settings').doc('emailTemplates').update({
        approvedPromoterHtml: admin.firestore.FieldValue.delete()
    });
    
    return { success: true, message: "Template de e-mail redefinido para o padrão." };
});