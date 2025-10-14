
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('sib-api-v3-sdk');

admin.initializeApp();

exports.sendTestEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        // 1. Check for authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função só pode ser chamada por um usuário autenticado.');
        }
        const userEmail = context.auth.token.email;
        if (!userEmail) {
            throw new functions.https.HttpsError('invalid-argument', 'O usuário autenticado não possui um e-mail.');
        }

        // 2. Get Brevo API config from environment variables
        const brevoConfig = functions.config().brevo;
        if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email || !brevoConfig.sender_name) {
            console.error("Brevo config is missing in Firebase environment.", { brevoConfig });
            throw new functions.https.HttpsError('failed-precondition', 'A configuração da API de e-mail (Brevo) não foi encontrada no servidor. Verifique as variáveis de ambiente.');
        }

        // 3. Configure the Brevo client
        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        const apiKey = defaultClient.authentications['api-key'];
        apiKey.apiKey = brevoConfig.key;

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        // 4. Define the email content
        sendSmtpEmail.to = [{ email: userEmail }];
        sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
        sendSmtpEmail.subject = "✅ Teste de Envio de E-mail - Equipe Certa";
        sendSmtpEmail.htmlContent = `
            <html>
            <body>
                <h1>Olá!</h1>
                <p>Se você está recebendo este e-mail, a integração com o serviço de envio está <strong>funcionando corretamente!</strong></p>
                <p>Configuração utilizada:</p>
                <ul>
                    <li>Remetente: ${brevoConfig.sender_name} &lt;${brevoConfig.sender_email}&gt;</li>
                    <li>Destinatário: ${userEmail}</li>
                </ul>
                <p>Atenciosamente,<br/>Plataforma Equipe Certa</p>
            </body>
            </html>`;
        sendSmtpEmail.textContent = `Olá! Se você está recebendo este e-mail, a integração com o serviço de envio está funcionando corretamente! Remetente: ${brevoConfig.sender_name} <${brevoConfig.sender_email}>. Destinatário: ${userEmail}.`;

        // 5. Send the email
        try {
            const brevoResponse = await apiInstance.sendTransacEmail(sendSmtpEmail);
            console.log('Brevo API called successfully. Returned data: ', JSON.stringify(brevoResponse));
            return { success: true, message: `E-mail de teste enviado para ${userEmail}.` };
        } catch (error) {
            console.error("Error sending email via Brevo API: ", error.response ? error.response.body : error);
            const errorMessage = error.response?.body?.message || error.message || 'Erro desconhecido da API.';
            throw new functions.https.HttpsError('internal', `Falha ao enviar e-mail via Brevo. Detalhes: ${errorMessage}`);
        }
    });

exports.sendPromoterStatusEmail = functions
    .region("southamerica-east1")
    .firestore.document('promoters/{promoterId}')
    .onUpdate(async (change, context) => {
        const promoterId = context.params.promoterId;
        functions.logger.info(`[START] Promoter update triggered for ID: ${promoterId}`);

        try {
            const beforeData = change.before.data();
            const afterData = change.after.data();

            // Log the complete data objects for deep debugging
            functions.logger.debug("Data before change:", { promoterId, data: beforeData });
            functions.logger.debug("Data after change:", { promoterId, data: afterData });

            const beforeStatus = beforeData?.status;
            const afterStatus = afterData?.status;

            functions.logger.info(`Status change check: from '${beforeStatus}' to '${afterStatus}'.`, { promoterId });

            // Core condition: Email should only be sent on the first decision.
            const shouldSendEmail = beforeStatus === 'pending' && (afterStatus === 'approved' || afterStatus === 'rejected');

            if (!shouldSendEmail) {
                functions.logger.info(`[END] Condition not met for email dispatch. No action taken.`, { promoterId, beforeStatus, afterStatus });
                return null;
            }

            functions.logger.info(`[PASS] Condition met. Preparing to send '${afterStatus}' notification.`, { promoterId });

            // --- Data Validation ---
            if (!afterData.email || typeof afterData.email !== 'string') {
                functions.logger.error(`[FAIL] Promoter has missing or invalid email. Cannot send notification.`, { promoterId, email: afterData.email });
                return null;
            }
            if (!afterData.name) {
                functions.logger.warn(`Promoter name is missing, using a generic greeting.`, { promoterId });
            }

            // --- Brevo API Configuration ---
            const brevoConfig = functions.config().brevo;
            if (!brevoConfig?.key || !brevoConfig?.sender_email || !brevoConfig?.sender_name) {
                functions.logger.error("[FAIL] Brevo API configuration is missing in Firebase environment. Cannot send email.", { promoterId });
                return null;
            }

            // --- Fetch Organization Name ---
            let orgName = 'Nossa Equipe'; // Default name
            if (afterData.organizationId) {
                try {
                    const orgDoc = await admin.firestore().collection('organizations').doc(afterData.organizationId).get();
                    if (orgDoc.exists) {
                        orgName = orgDoc.data().name || orgName;
                        functions.logger.info(`Successfully fetched organization name: '${orgName}'`, { promoterId, orgId: afterData.organizationId });
                    } else {
                        functions.logger.warn(`Organization document not found for ID: ${afterData.organizationId}. Using default name.`, { promoterId });
                    }
                } catch (error) {
                    functions.logger.error(`Error fetching organization. Using default name.`, { promoterId, orgId: afterData.organizationId, error });
                }
            } else {
                 functions.logger.warn(`Promoter is not associated with an organizationId. Using default name.`, { promoterId });
            }

            // --- Email Content Preparation ---
            const promoter = afterData;
            const promoterName = promoter.name || 'Candidato(a)';
            const campaignName = promoter.campaignName || "nossa equipe";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;

            let subject = '';
            let htmlContent = '';

            if (afterStatus === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                    <p>Estamos muito felizes em ter você em nossa equipe!</p>
                    <p>Para continuar, você precisa acessar seu portal para ler as regras e obter o link de acesso ao grupo oficial de divulgadoras.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${promoter.email}</strong> para consultar seu status.</p>
                    <br>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            } else { // 'rejected'
                subject = `Resultado da sua candidatura para ${orgName}`;
                const reason = promoter.rejectionReason || 'Não foi fornecido um motivo específico.';
                htmlContent = `
                    <p>Olá, ${promoterName},</p>
                    <p>Agradecemos imensamente o seu interesse em fazer parte da nossa equipe de divulgadoras para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                    <p>Analisamos cuidadosamente todos os perfis e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${reason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <br>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            }

            // --- Send Email via Brevo ---
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const apiKey = defaultClient.authentications['api-key'];
            apiKey.apiKey = brevoConfig.key;
            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: promoter.email, name: promoterName }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;

            functions.logger.info(`Attempting to send email...`, {
                promoterId,
                to: promoter.email,
                from: brevoConfig.sender_email,
                subject: subject,
            });

            await apiInstance.sendTransacEmail(sendSmtpEmail);
            functions.logger.info(`[SUCCESS] Email dispatched successfully to ${promoter.email}.`, { promoterId });
            return { success: true };

        } catch (error) {
            functions.logger.error(`[FATAL] An unexpected error occurred in the function.`, {
                promoterId: promoterId,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            return null;
        }
    });
