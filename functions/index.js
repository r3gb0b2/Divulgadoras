const functions = require("firebase-functions");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('@getbrevo/brevo');
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();

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

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const apiKey = apiInstance.authentications['apiKey'];
    apiKey.apiKey = brevoConfig.key;

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
        const FUNCTION_VERSION = "v9.0-BREVO";
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
                    const accountApi = new SibApiV3Sdk.AccountApi();
                    const apiKey = accountApi.authentications['apiKey'];
                    apiKey.apiKey = brevoConfig.key;
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
        functions.logger.info(`[TEST EMAIL TRIGGER] for user: ${userEmail}, type: ${testType}`);

        try {
            let subject = '';
            let htmlContent = '';
            const orgName = "Organização de Teste";
            const promoterName = "Divulgadora de Teste";
            const campaignName = "Evento de Teste";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            const footer = `<hr><p style="font-size: 10px; color: #888;">Este é um e-mail de teste enviado via Brevo (v9.0).</p>`;


            if (testType === 'approved') {
                subject = `✅ (TESTE) Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>teste@exemplo.com</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
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

            if (!beforeData || !afterData || beforeData.status === afterData.status) {
                return null;
            }
            
            if (beforeData.status !== 'pending' || (afterData.status !== 'approved' && afterData.status !== 'rejected')) {
                return null;
            }
            
            const finalData = {
                promoterName: String(afterData.name || 'Candidato(a)'),
                campaignName: String(afterData.campaignName || "nossa equipe"),
                recipientEmail: String(afterData.email || ''),
                rejectionReason: String(afterData.rejectionReason || 'Não foi fornecido um motivo específico.'),
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

            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';
            const footer = `<hr><p style="font-size: 10px; color: #888;">E-mail enviado via Brevo (v9.0).</p>`;

            if (afterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
                htmlContent = `...`; // Same content as before
            } else {
                subject = `Resultado da sua candidatura para ${finalData.orgName}`;
                htmlContent = `...`; // Same content as before
            }

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

        const provider = "Brevo (v9.0)";
        functions.logger.info(`[MANUAL TRIGGER] for promoterId: ${promoterId} by user: ${context.auth.token.email} via ${provider}`);

        try {
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada.');
            
            const promoterData = promoterDoc.data();
            if (promoterData.status !== 'approved' && promoterData.status !== 'rejected') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado" ou "Rejeitado".');
            }

            const finalData = {
                promoterName: String(promoterData.name || 'Candidato(a)'),
                campaignName: String(promoterData.campaignName || "nossa equipe"),
                recipientEmail: String(promoterData.email || ''),
                rejectionReason: String(promoterData.rejectionReason || 'Não foi fornecido um motivo específico.'),
                orgName: 'Nossa Equipe',
            };
            
            if (!finalData.recipientEmail) throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido.');
            
            if (promoterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(String(promoterData.organizationId)).get();
                if (orgDoc.exists) finalData.orgName = String(orgDoc.data().name);
            }

            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';
            const footer = `<hr><p style="font-size: 10px; color: #888;">E-mail enviado via Brevo (v9.0).</p>`;

            if (promoterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${finalData.recipientEmail}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            } else {
                subject = `Resultado da sua candidatura para ${finalData.orgName}`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${finalData.rejectionReason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            }
            
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