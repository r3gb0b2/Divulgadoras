
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
        
        try {
            // --- 1. Get before and after data ---
            const beforeData = change.before.data();
            const afterData = change.after.data();

            if (!beforeData || !afterData) {
                functions.logger.error("Data missing from change object. Exiting.", { promoterId });
                return null;
            }
            
            const beforeStatus = beforeData.status;
            const afterStatus = afterData.status;

            functions.logger.info(`[TRIGGER] Function triggered for promoterId: ${promoterId}. Status change: from '${beforeStatus}' to '${afterStatus}'.`);

            // --- 2. Guard Clause: Check if the status has actually changed ---
            if (beforeStatus === afterStatus) {
                functions.logger.info(`[EXIT] Status has not changed. No email needed.`, { promoterId });
                return null;
            }

            // --- 3. Guard Clause: Check if the change is from 'pending' to a final state ---
            if (beforeStatus !== 'pending' || (afterStatus !== 'approved' && afterStatus !== 'rejected')) {
                functions.logger.info(`[EXIT] Change is not a final decision from 'pending' state. No email needed.`, { promoterId, beforeStatus, afterStatus });
                return null;
            }

            functions.logger.info(`[PASS] Condition met. Proceeding to send '${afterStatus}' email.`, { promoterId });

            // --- 4. Guard Clause: Validate essential data for the email ---
            if (!afterData.email || typeof afterData.email !== 'string') {
                functions.logger.error(`[FATAL EXIT] Promoter has missing or invalid email. Cannot send notification.`, { promoterId, email: afterData.email });
                return null;
            }

            // --- 5. Get Brevo API Configuration ---
            const brevoConfig = functions.config().brevo;
            if (!brevoConfig?.key || !brevoConfig?.sender_email || !brevoConfig?.sender_name) {
                functions.logger.error("[FATAL EXIT] Brevo API configuration is missing in Firebase environment. Cannot send email.", { promoterId });
                return null;
            }

            // --- 6. Fetch Organization Name ---
            let orgName = 'Nossa Equipe'; // Default name
            if (afterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(afterData.organizationId).get();
                if (orgDoc.exists) {
                    orgName = orgDoc.data().name || orgName;
                    functions.logger.info(`Successfully fetched organization name: '${orgName}'`, { promoterId, orgId: afterData.organizationId });
                } else {
                    functions.logger.warn(`Organization document not found for ID: ${afterData.organizationId}. Using default name.`, { promoterId });
                }
            } else {
                 functions.logger.warn(`Promoter is not associated with an organizationId. Using default name.`, { promoterId });
            }

            // --- 7. Prepare Email Content ---
            const promoterName = afterData.name || 'Candidato(a)';
            const campaignName = afterData.campaignName || "nossa equipe";
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
                    <p>Lembre-se de usar o e-mail <strong>${afterData.email}</strong> para consultar seu status.</p>
                    <br>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            } else { // 'rejected'
                subject = `Resultado da sua candidatura para ${orgName}`;
                const reason = afterData.rejectionReason || 'Não foi fornecido um motivo específico.';
                htmlContent = `
                    <p>Olá, ${promoterName},</p>
                    <p>Agradecemos imensamente o seu interesse em fazer parte da nossa equipe para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                    <p>Analisamos cuidadosamente todos os perfis e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${reason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <br>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                `;
            }

            // --- 8. Send Email via Brevo ---
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const apiKey = defaultClient.authentications['api-key'];
            apiKey.apiKey = brevoConfig.key;
            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: afterData.email, name: promoterName }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;

            functions.logger.info(`Attempting to send email to ${afterData.email}`, { promoterId });

            await apiInstance.sendTransacEmail(sendSmtpEmail);
            
            functions.logger.info(`[SUCCESS] Email dispatched successfully to ${afterData.email}.`, { promoterId });
            return { success: true };

        } catch (error) {
            functions.logger.error(`[FATAL ERROR] An unexpected error occurred in the function.`, {
                promoterId: promoterId,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                brevoError: error.response?.body
            });
            return null;
        }
    });

exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        // --- 1. Authenticate & Validate Input ---
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função só pode ser chamada por um usuário autenticado.');
        }
        const { promoterId } = data;
        if (!promoterId) {
            throw new functions.https.HttpsError('invalid-argument', 'O ID da divulgadora é obrigatório.');
        }

        functions.logger.info(`[MANUAL TRIGGER] for promoterId: ${promoterId} by user: ${context.auth.token.email}`);

        try {
            // --- 2. Fetch Promoter Data ---
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada.');
            }
            const promoterData = promoterDoc.data();

            // --- 3. Guard Clauses ---
            if (promoterData.status !== 'approved' && promoterData.status !== 'rejected') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado" ou "Rejeitado".');
            }
            if (!promoterData.email || typeof promoterData.email !== 'string') {
                functions.logger.error(`[FATAL EXIT] Promoter has missing or invalid email.`, { promoterId });
                throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido para notificação.');
            }

            // --- 4. Get Brevo API Configuration ---
            const brevoConfig = functions.config().brevo;
            if (!brevoConfig?.key || !brevoConfig?.sender_email || !brevoConfig?.sender_name) {
                functions.logger.error("[FATAL] Brevo API configuration is missing.", { promoterId });
                throw new functions.https.HttpsError('internal', 'A configuração da API de e-mail não foi encontrada no servidor.');
            }

            // --- 5. Fetch Organization Name ---
            let orgName = 'Nossa Equipe';
            if (promoterData.organizationId) {
                const orgDoc = await admin.firestore().collection('organizations').doc(promoterData.organizationId).get();
                if (orgDoc.exists) orgName = orgDoc.data().name || orgName;
            }

            // --- 6. Prepare Email Content ---
            const promoterName = promoterData.name || 'Candidato(a)';
            const campaignName = promoterData.campaignName || "nossa equipe";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';

            if (promoterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `<p>Olá, ${promoterName}!</p><p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p><p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p><p><a href="${portalLink}">Clique aqui para acessar seu portal</a></p><p>Lembre-se de usar o e-mail <strong>${promoterData.email}</strong> para consultar seu status.</p><br><p>Atenciosamente,<br/>Equipe Certa</p>`;
            } else { // 'rejected'
                subject = `Resultado da sua candidatura para ${orgName}`;
                const reason = promoterData.rejectionReason || 'Não foi fornecido um motivo específico.';
                htmlContent = `<p>Olá, ${promoterName},</p><p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p><p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p><p><strong>Motivo:</strong><br/>${reason.replace(/\n/g, '<br/>')}</p><p>Desejamos sucesso!</p><br><p>Atenciosamente,<br/>Equipe Certa</p>`;
            }
            
            // --- 7. Send Email ---
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const apiKey = defaultClient.authentications['api-key'];
            apiKey.apiKey = brevoConfig.key;
            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: promoterData.email, name: promoterName }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;

            await apiInstance.sendTransacEmail(sendSmtpEmail);

            return { success: true, message: `E-mail enviado com sucesso para ${promoterData.email}.` };

        } catch (error) {
            functions.logger.error(`[FATAL ERROR] Manual email trigger failed.`, {
                promoterId: promoterId,
                errorMessage: error instanceof Error ? error.message : String(error),
                isHttpsError: error instanceof functions.https.HttpsError,
            });
            // Re-throw HttpsError to be caught by the client, otherwise throw a generic one
            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            throw new functions.https.HttpsError('internal', 'Ocorreu um erro inesperado ao tentar enviar o e-mail.');
        }
    });
