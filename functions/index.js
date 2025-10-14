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
        const beforeData = change.before.data();
        const afterData = change.after.data();

        const beforeStatus = beforeData.status;
        const afterStatus = afterData.status;
        
        console.log(`[${promoterId}] Status change detected: From '${beforeStatus}' to '${afterStatus}'.`);

        // We only want to send an email on the FIRST decision (from pending to a final state).
        const isFirstDecision = beforeStatus === 'pending' && (afterStatus === 'approved' || afterStatus === 'rejected');

        if (!isFirstDecision) {
            console.log(`[${promoterId}] This change does not qualify for an email notification. No action taken.`);
            return null;
        }

        console.log(`[${promoterId}] First decision condition met. Preparing to send '${afterStatus}' email.`);

        // Get Brevo API config
        const brevoConfig = functions.config().brevo;
        if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email || !brevoConfig.sender_name) {
            console.error(`[${promoterId}] Brevo config is missing in Firebase environment. Cannot send email.`);
            return null;
        }
        
        // Fetch organization name
        let orgName = 'Nossa Equipe';
        if (afterData.organizationId) {
            try {
                const orgDoc = await admin.firestore().collection('organizations').doc(afterData.organizationId).get();
                if (orgDoc.exists) {
                    orgName = orgDoc.data().name;
                    console.log(`[${promoterId}] Fetched organization name: ${orgName}`);
                } else {
                    console.warn(`[${promoterId}] Organization document with ID '${afterData.organizationId}' not found.`);
                }
            } catch (error) {
                console.error(`[${promoterId}] Failed to fetch organization '${afterData.organizationId}'. Error:`, error);
            }
        }
        
        // Prepare email content
        const promoter = afterData;
        let subject = '';
        let htmlContent = '';
        let textContent = '';

        const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
        const campaignName = promoter.campaignName || "nossa equipe";

        if (promoter.status === 'approved') {
            subject = `Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
            htmlContent = `
                <p>Olá, ${promoter.name}!</p>
                <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                <p>Estamos muito felizes em ter você em nossa equipe!</p>
                <p>Para continuar, você precisa acessar seu portal para ler as regras e obter o link de acesso ao grupo oficial de divulgadoras.</p>
                <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                <p>Lembre-se de usar o e-mail <strong>${promoter.email}</strong> para consultar seu status.</p>
                <br>
                <p>Atenciosamente,<br/>Equipe Certa</p>
            `;
            textContent = `Olá, ${promoter.name}!\nTemos uma ótima notícia! Sua candidatura para ${campaignName} da organização ${orgName} foi APROVADA.\nEstamos muito felizes em ter você em nossa equipe!\nPara continuar, você precisa acessar seu portal para ler as regras e obter o link de acesso ao grupo oficial de divulgadoras.\nAcesse aqui: ${portalLink}\nLembre-se de usar o e-mail ${promoter.email} para consultar seu status.\nAtenciosamente,\nEquipe Certa`;
        } else if (promoter.status === 'rejected') {
            subject = `Resultado da sua candidatura para ${orgName}`;
            const reason = promoter.rejectionReason || 'Não especificado.';
            htmlContent = `
                <p>Olá, ${promoter.name},</p>
                <p>Agradecemos imensamente o seu interesse em fazer parte da nossa equipe de divulgadoras para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                <p>Analisamos cuidadosamente todos os perfis e, neste momento, não poderemos seguir com a sua candidatura.</p>
                <p><strong>Motivo informado:</strong><br/>${reason.replace(/\n/g, '<br/>')}</p>
                <p>Desejamos sucesso em suas futuras oportunidades!</p>
                <br>
                <p>Atenciosamente,<br/>Equipe Certa</p>
            `;
            textContent = `Olá, ${promoter.name},\nAgradecemos imensamente o seu interesse em fazer parte da nossa equipe de divulgadoras para ${campaignName} da organização ${orgName}.\nAnalisamos cuidadosamente todos os perfis e, neste momento, não poderemos seguir com a sua candidatura.\nMotivo informado:\n${reason}\nDesejamos sucesso em suas futuras oportunidades!\nAtenciosamente,\nEquipe Certa`;
        } 
        
        if (!subject) {
             console.log(`[${promoterId}] Status is '${afterStatus}', which has no email template. No email sent.`);
             return null;
        }

        // Configure and send email
        try {
            console.log(`[${promoterId}] Attempting to send email to ${promoter.email}...`);
            const defaultClient = SibApiV3Sdk.ApiClient.instance;
            const apiKey = defaultClient.authentications['api-key'];
            apiKey.apiKey = brevoConfig.key;

            const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

            sendSmtpEmail.to = [{ email: promoter.email, name: promoter.name }];
            sendSmtpEmail.sender = { email: brevoConfig.sender_email, name: brevoConfig.sender_name };
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;
            sendSmtpEmail.textContent = textContent;

            await apiInstance.sendTransacEmail(sendSmtpEmail);
            console.log(`[${promoterId}] Email sent successfully to ${promoter.email}.`);
            return { success: true };
        } catch (error) {
            console.error(`[${promoterId}] Error sending email via Brevo API: `, error.response ? error.response.body : error);
            return null;
        }
    });