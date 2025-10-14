
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Brevo = require('@getbrevo/brevo');

admin.initializeApp();

/**
 * Creates a new, isolated, and freshly authenticated Brevo API client instance.
 * @param {object} brevoConfig - The Brevo configuration from Firebase functions config.
 * @returns {Brevo.TransactionalEmailsApi} A configured API instance.
 * @throws {functions.https.HttpsError} If config is missing.
 */
const createBrevoClient = (brevoConfig) => {
    if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email || !brevoConfig.sender_name) {
        console.error("Brevo config is missing in Firebase environment.", { brevoConfig });
        throw new functions.https.HttpsError('failed-precondition', 'A configuração da API de e-mail (Brevo) não foi encontrada no servidor.');
    }
    
    const apiInstance = new Brevo.TransactionalEmailsApi();
    const apiKeyAuth = apiInstance.authentications['api-key'];
    apiKeyAuth.apiKey = brevoConfig.key;
    
    return apiInstance;
};

exports.sendTestEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth || !context.auth.token.email) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado com um e-mail.');
        }
        const userEmail = context.auth.token.email;
        functions.logger.info(`[TEST EMAIL TRIGGER] for user: ${userEmail}`);

        try {
            functions.logger.info("Initializing Brevo client for test email.");
            const brevoConfig = functions.config().brevo;
            const apiInstance = createBrevoClient(brevoConfig);
            const sendSmtpEmail = new Brevo.SendSmtpEmail();

            functions.logger.info("Preparing test email content.");
            sendSmtpEmail.to = [{ email: userEmail }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = "✅ Teste de Envio de E-mail - Equipe Certa";
            sendSmtpEmail.htmlContent = `
                <html><body>
                    <h1>Olá!</h1>
                    <p>Se você está recebendo este e-mail, a integração com o serviço de envio está <strong>funcionando corretamente!</strong></p>
                    <p>Atenciosamente,<br/>Plataforma Equipe Certa</p>
                </body></html>`;
            
            functions.logger.info(`Sending test email to ${userEmail}...`);
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            functions.logger.info("Test email sent successfully via Brevo.");

            return { success: true, message: `E-mail de teste enviado para ${userEmail}.` };
        } catch (error) {
            functions.logger.error("FATAL ERROR in sendTestEmail", {
                user: context.auth ? context.auth.token.email : "Unauthenticated",
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            
            let detailedMessage = "Ocorreu um erro desconhecido no servidor de e-mails.";
            
            try {
                const errorBody = error?.response?.body || error?.body;
                if (errorBody) {
                    const bodyStr = Buffer.isBuffer(errorBody) ? errorBody.toString('utf-8') : String(errorBody);
                    try {
                        const parsed = JSON.parse(bodyStr);
                        detailedMessage = parsed.message || parsed.code || bodyStr;
                    } catch (jsonError) {
                        detailedMessage = bodyStr;
                    }
                } else if (error?.message) {
                    detailedMessage = error.message;
                }
            } catch (parsingError) {
                functions.logger.error("Could not parse the original error object in sendTestEmail.", { parsingError });
                detailedMessage = error?.message || "Erro ao processar a resposta da API de e-mail.";
            }

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
            
            functions.logger.info(`[TRIGGER] Promoter update for ${promoterId}. Status: ${beforeData.status} -> ${afterData.status}.`);

            if (beforeData.status !== 'pending' || (afterData.status !== 'approved' && afterData.status !== 'rejected')) {
                functions.logger.info(`[EXIT] Not a final decision from 'pending'. No email needed.`);
                return null;
            }
            
            if (!afterData.email) {
                functions.logger.error(`[FATAL EXIT] Promoter ${promoterId} has no email.`);
                return null;
            }
            
            let orgName = 'Nossa Equipe';
            if (afterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(afterData.organizationId).get();
                if (orgDoc.exists && orgDoc.data().name) {
                   orgName = orgDoc.data().name;
                }
            }

            const promoterName = afterData.name || 'Candidato(a)';
            const campaignName = afterData.campaignName || "nossa equipe";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';

            if (afterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${afterData.email}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            } else {
                subject = `Resultado da sua candidatura para ${orgName}`;
                const reason = afterData.rejectionReason || 'Não foi fornecido um motivo específico.';
                htmlContent = `
                    <p>Olá, ${promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${reason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            }

            const brevoConfig = functions.config().brevo;
            const apiInstance = createBrevoClient(brevoConfig);
            const sendSmtpEmail = new Brevo.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: afterData.email, name: promoterName }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;

            await apiInstance.sendTransacEmail(sendSmtpEmail);
            
            functions.logger.info(`[SUCCESS] Email dispatched to ${afterData.email} for promoter ${promoterId}.`);
            return { success: true };
        } catch (error) {
             functions.logger.error(`[FATAL ERROR] Failed to send promoter status email for promoterId: ${promoterId}.`, {
                error, // Log raw object
                errorMessage: error ? error.message : "No message",
                errorBody: error ? error.body : "No body",
                errorResponse: error ? error.response : "No response",
                stringifiedError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            });
            return null; // Gracefully exit, do not retry
        }
    });

exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função só pode ser chamada por um usuário autenticado.');
        }
        const { promoterId } = data;
        if (!promoterId) {
            throw new functions.https.HttpsError('invalid-argument', 'O ID da divulgadora é obrigatório.');
        }

        functions.logger.info(`[MANUAL TRIGGER] for promoterId: ${promoterId} by user: ${context.auth.token.email}`);

        try {
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada.');
            }
            const promoterData = promoterDoc.data();

            let orgName = 'Nossa Equipe';
            if (promoterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(promoterData.organizationId).get();
                if (orgDoc.exists && orgDoc.data().name) {
                    orgName = orgDoc.data().name;
                }
            }

            if (promoterData.status !== 'approved' && promoterData.status !== 'rejected') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado" ou "Rejeitado".');
            }
            if (!promoterData.email) {
                throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido.');
            }

            const promoterName = promoterData.name || 'Candidato(a)';
            const campaignName = promoterData.campaignName || "nossa equipe";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';

            if (promoterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${promoterData.email}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            } else {
                subject = `Resultado da sua candidatura para ${orgName}`;
                const reason = promoterData.rejectionReason || 'Não foi fornecido um motivo específico.';
                htmlContent = `
                    <p>Olá, ${promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${reason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            }
            
            const brevoConfig = functions.config().brevo;
            const apiInstance = createBrevoClient(brevoConfig);
            const sendSmtpEmail = new Brevo.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: promoterData.email, name: promoterName }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;

            await apiInstance.sendTransacEmail(sendSmtpEmail);
            functions.logger.info(`[SUCCESS] Manual email sent to ${promoterData.email} for promoter ${promoterId}.`);

            return { success: true, message: `E-mail enviado com sucesso para ${promoterData.email}.` };
        } catch (error) {
            functions.logger.error("FATAL ERROR in manuallySendStatusEmail", {
                promoterId: data.promoterId,
                user: context.auth.token.email,
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            
            let detailedMessage = "Ocorreu um erro desconhecido no servidor de e-mails.";

            try {
                const errorBody = error?.response?.body || error?.body;
                if (errorBody) {
                    const bodyStr = Buffer.isBuffer(errorBody) ? errorBody.toString('utf-8') : String(errorBody);
                    try {
                        const parsed = JSON.parse(bodyStr);
                        detailedMessage = parsed.message || parsed.code || bodyStr;
                    } catch (jsonError) {
                        detailedMessage = bodyStr;
                    }
                } else if (error?.message) {
                    detailedMessage = error.message;
                }
            } catch (parsingError) {
                functions.logger.error("Could not parse the original error object in manuallySendStatusEmail.", { parsingError });
                detailedMessage = error?.message || "Erro ao processar a resposta da API de e-mail.";
            }

            throw new functions.https.HttpsError('internal', 'Falha na API de envio de e-mail.', {
                originalError: detailedMessage,
            });
        }
    });
