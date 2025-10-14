

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
            // --- 1. Get before and after data & Guard Clauses ---
            const beforeData = change.before.data();
            const afterData = change.after.data();

            if (!beforeData || !afterData) {
                functions.logger.info(`Data missing from change object. Exiting.`, { promoterId });
                return null;
            }
            
            const beforeStatus = beforeData.status;
            const afterStatus = afterData.status;

            if (beforeStatus === afterStatus) {
                return null; // Status didn't change, no email needed.
            }
            
            functions.logger.info(`[TRIGGER] Function triggered for promoterId: ${promoterId}. Status change: from '${beforeStatus}' to '${afterStatus}'.`);

            if (beforeStatus !== 'pending' || (afterStatus !== 'approved' && afterStatus !== 'rejected')) {
                functions.logger.info(`[EXIT] Change is not a final decision from 'pending' state. No email needed.`, { promoterId, beforeStatus, afterStatus });
                return null;
            }
            
            if (!afterData.email || typeof afterData.email !== 'string') {
                functions.logger.error(`[FATAL EXIT] Promoter has missing or invalid email. Cannot send notification.`, { promoterId, email: afterData.email });
                return null;
            }
            
            const brevoConfig = functions.config().brevo;
            if (!brevoConfig?.key || !brevoConfig?.sender_email || !brevoConfig?.sender_name) {
                functions.logger.error("[FATAL EXIT] Brevo API configuration is missing in Firebase environment.", { promoterId });
                return null;
            }

            // --- 2. Fetch Organization Name ---
            let orgName = 'Nossa Equipe'; // Default name
            if (afterData.organizationId && typeof afterData.organizationId === 'string') {
                const orgDoc = await admin.firestore().collection('organizations').doc(afterData.organizationId).get();
                if (orgDoc.exists) {
                    const orgData = orgDoc.data();
                    if (orgData && orgData.name) {
                       orgName = orgData.name;
                    }
                } else {
                    functions.logger.warn(`Organization document not found for ID: ${afterData.organizationId}.`, { promoterId });
                }
            }

            // --- 3. Prepare Email Content ---
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

            // --- 4. Send Email via Brevo ---
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const apiKey = defaultClient.authentications['api-key'];
            apiKey.apiKey = brevoConfig.key;
            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: afterData.email, name: promoterName }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;

            await apiInstance.sendTransacEmail(sendSmtpEmail);
            
            functions.logger.info(`[SUCCESS] Email dispatched successfully to ${afterData.email}.`, { promoterId });
            return { success: true };

        } catch (error) {
            const isBrevoError = !!error.response?.body;
            functions.logger.error(`[FATAL ERROR] Failed to send promoter status email.`, {
                promoterId: promoterId,
                errorSource: isBrevoError ? 'Brevo API' : 'Internal Logic/Firestore',
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error.stack,
                brevoErrorBody: error.response?.body,
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

        let promoterData;
        let orgName = 'Nossa Equipe';

        // --- 2. Fetch all required data from Firestore ---
        try {
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada no banco de dados.');
            }
            promoterData = promoterDoc.data();

            if (promoterData.organizationId && typeof promoterData.organizationId === 'string') {
                const orgDoc = await admin.firestore().collection('organizations').doc(promoterData.organizationId).get();
                if (orgDoc.exists) {
                    const orgData = orgDoc.data();
                     if (orgData && orgData.name) {
                        orgName = orgData.name;
                     }
                } else {
                    functions.logger.warn(`Organization document not found for ID: ${promoterData.organizationId}. Using default name.`, { promoterId });
                }
            }
        } catch (error) {
            functions.logger.error(`[FATAL ERROR] Firestore data fetching failed in manual trigger.`, { 
                promoterId: promoterId,
                errorMessage: error.message,
                errorStack: error.stack,
            });
            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            throw new functions.https.HttpsError('internal', `Erro no servidor ao buscar dados: ${error.message}`);
        }

        // --- 3. Guard Clauses for business logic ---
        if (promoterData.status !== 'approved' && promoterData.status !== 'rejected') {
            throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado" ou "Rejeitado".');
        }
        if (!promoterData.email || typeof promoterData.email !== 'string') {
            throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido para notificação.');
        }

        // --- 4. Get Brevo API Configuration ---
        const brevoConfig = functions.config().brevo;
        if (!brevoConfig?.key || !brevoConfig?.sender_email || !brevoConfig?.sender_name) {
            functions.logger.error("[FATAL] Brevo API configuration is missing.", { promoterId });
            throw new functions.https.HttpsError('internal', 'A configuração da API de e-mail não foi encontrada no servidor.');
        }

        // --- 5. Prepare Email Content ---
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
                <p>Estamos muito felizes em ter você em nossa equipe!</p>
                <p>Para continuar, você precisa acessar seu portal para ler as regras e obter o link de acesso ao grupo oficial de divulgadoras.</p>
                <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                <p>Lembre-se de usar o e-mail <strong>${promoterData.email}</strong> para consultar seu status.</p>
                <br>
                <p>Atenciosamente,<br/>Equipe Certa</p>
            `;
        } else { // 'rejected'
            subject = `Resultado da sua candidatura para ${orgName}`;
            const reason = promoterData.rejectionReason || 'Não foi fornecido um motivo específico.';
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
        
        // --- 6. Send Email with specific error handling ---
        try {
            // FIX: Added missing Brevo client initialization
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
            functions.logger.error("Error sending email via Brevo API in manual trigger: ", error.response ? error.response.body : error);
            const errorMessage = error.response?.body?.message || error.message || 'Erro desconhecido da API.';
            throw new functions.https.HttpsError('internal', `Falha na API de envio: ${errorMessage}`);
        }
    });