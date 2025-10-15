

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

admin.initializeApp();

/**
 * Creates a new, isolated, and freshly authenticated Mailgun API client instance.
 * @param {object} mailgunConfig - The Mailgun configuration from Firebase functions config.
 * @returns {import('mailgun.js/dist/lib/client').Mailgun} A configured API instance.
 * @throws {functions.https.HttpsError} If config is missing.
 */
const createMailgunClient = (mailgunConfig) => {
    if (!mailgunConfig || !mailgunConfig.key || !mailgunConfig.domain || !mailgunConfig.sender_email || !mailgunConfig.sender_name) {
        console.error("Mailgun config is missing in Firebase environment.", { mailgunConfig });
        throw new functions.https.HttpsError('failed-precondition', 'A configuração da API de e-mail (Mailgun) não foi encontrada no servidor.');
    }
    
    return mailgun.client({
        username: 'api',
        key: mailgunConfig.key,
    });
};

exports.sendTestEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth || !context.auth.token.email) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado com um e-mail.');
        }
        const userEmail = 'r3gb0b@gmail.com';
        const testType = data.testType || 'generic'; // Can be 'generic', 'approved', or 'rejected'
        functions.logger.info(`[TEST EMAIL TRIGGER] for user: ${userEmail}, type: ${testType}`);

        try {
            functions.logger.info(`Initializing Mailgun client for ${testType} test email.`);
            const mailgunConfig = functions.config().mailgun;
            const mg = createMailgunClient(mailgunConfig);

            let subject = '';
            let htmlContent = '';
            const orgName = "Organização de Teste";
            const promoterName = "Divulgadora de Teste";
            const campaignName = "Evento de Teste";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;

            if (testType === 'approved') {
                subject = `✅ (TESTE) Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>teste@exemplo.com</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
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
                `;
            } else { // 'generic'
                subject = "✅ Teste de Envio de E-mail - Equipe Certa";
                htmlContent = `
                    <html><body>
                        <h1>Olá!</h1>
                        <p>Se você está recebendo este e-mail, a integração com o serviço de envio (Mailgun) está <strong>funcionando corretamente!</strong> (Teste Genérico)</p>
                        <p>Atenciosamente,<br/>Plataforma Equipe Certa</p>
                    </body></html>`;
            }

            functions.logger.info(`Sending ${testType} test email to ${userEmail}...`);
            const messageData = {
                from: `${mailgunConfig.sender_name} <${mailgunConfig.sender_email}>`,
                to: [userEmail],
                subject: subject,
                html: htmlContent,
            };
            
            await mg.messages.create(mailgunConfig.domain, messageData);
            functions.logger.info(`${testType} test email sent successfully via Mailgun.`);

            return { success: true, message: `E-mail de teste (${testType}) enviado para ${userEmail}.` };
        } catch (error) {
            functions.logger.error(`FATAL ERROR in sendTestEmail (type: ${testType})`, {
                user: context.auth ? context.auth.token.email : "Unauthenticated",
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            
            const detailedMessage = error.details || error.message || "Ocorreu um erro desconhecido no servidor de e-mails.";

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
            
            // --- Hyper-Defensive Data Sanitization ---
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
                try {
                    const orgDoc = await admin.firestore().collection('organizations').doc(String(afterData.organizationId)).get();
                    if (orgDoc.exists) {
                        const orgData = orgDoc.data();
                        if (orgData && orgData.name) {
                            finalData.orgName = String(orgData.name);
                        }
                    }
                } catch (orgError) {
                    functions.logger.warn(`Could not fetch organization name for orgId ${afterData.organizationId}`, orgError);
                }
            }
            // --- End Sanitization ---

            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';

            if (afterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${finalData.recipientEmail}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            } else { // status is 'rejected'
                subject = `Resultado da sua candidatura para ${finalData.orgName}`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${finalData.rejectionReason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            }

            const mailgunConfig = functions.config().mailgun;
            const mg = createMailgunClient(mailgunConfig);

            const messageData = {
                from: `${mailgunConfig.sender_name} <${mailgunConfig.sender_email}>`,
                to: [finalData.recipientEmail],
                subject: subject,
                html: htmlContent,
            };

            await mg.messages.create(mailgunConfig.domain, messageData);
            
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

            if (promoterData.status !== 'approved' && promoterData.status !== 'rejected') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado" ou "Rejeitado".');
            }

            // --- Hyper-Defensive Data Sanitization ---
            const finalData = {
                promoterName: String(promoterData.name || 'Candidato(a)'),
                campaignName: String(promoterData.campaignName || "nossa equipe"),
                recipientEmail: String(promoterData.email || ''),
                rejectionReason: String(promoterData.rejectionReason || 'Não foi fornecido um motivo específico.'),
                orgName: 'Nossa Equipe',
            };
            
            if (!finalData.recipientEmail) {
                 throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido.');
            }
            
            if (promoterData.organizationId) {
                try {
                    const orgDoc = await admin.firestore().collection('organizations').doc(String(promoterData.organizationId)).get();
                    if (orgDoc.exists) {
                        const orgData = orgDoc.data();
                        if (orgData && orgData.name) {
                            finalData.orgName = String(orgData.name);
                        }
                    }
                } catch (orgError) {
                    functions.logger.warn(`Could not fetch organization name for orgId ${promoterData.organizationId}`, orgError);
                }
            }
            // --- End Sanitization ---

            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';

            if (promoterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${finalData.recipientEmail}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            } else { // status is 'rejected'
                subject = `Resultado da sua candidatura para ${finalData.orgName}`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${finalData.rejectionReason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            }
            
            const mailgunConfig = functions.config().mailgun;
            const mg = createMailgunClient(mailgunConfig);
            
            const messageData = {
                from: `${mailgunConfig.sender_name} <${mailgunConfig.sender_email}>`,
                to: [finalData.recipientEmail],
                subject: subject,
                html: htmlContent,
            };

            await mg.messages.create(mailgunConfig.domain, messageData);
            functions.logger.info(`[SUCCESS] Manual email sent to ${finalData.recipientEmail} for promoter ${promoterId}.`);

            return { success: true, message: `E-mail enviado com sucesso para ${finalData.recipientEmail}.` };
        } catch (error) {
            functions.logger.error("FATAL ERROR in manuallySendStatusEmail", {
                promoterId: data.promoterId,
                user: context.auth.token.email,
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            
            const detailedMessage = error.details || error.message || "Ocorreu um erro desconhecido no servidor de e-mails.";

            throw new functions.https.HttpsError('internal', 'Falha na API de envio de e-mail.', {
                originalError: detailedMessage,
            });
        }
    });