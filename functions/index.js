const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const SibApiV3Sdk = require('sib-api-v3-sdk');

admin.initializeApp();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });


exports.sendTestEmail = onCall(async (request) => {
    // 1. Check for authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'A função só pode ser chamada por um usuário autenticado.');
    }
    const userEmail = request.auth.token.email;
    if (!userEmail) {
         throw new HttpsError('invalid-argument', 'O usuário autenticado não possui um e-mail.');
    }

    // 2. Get Brevo API config from environment variables
    const brevoConfig = functions.config().brevo;
    if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email || !brevoConfig.sender_name) {
        console.error("Brevo config is missing in Firebase environment.", { brevoConfig });
        throw new HttpsError('failed-precondition', 'A configuração da API de e-mail (Brevo) não foi encontrada no servidor. Verifique as variáveis de ambiente.');
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
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('Brevo API called successfully. Returned data: ', JSON.stringify(data));
        return { success: true, message: `E-mail de teste enviado para ${userEmail}.` };
    } catch (error) {
        console.error("Error sending email via Brevo API: ", error.response ? error.response.body : error);
        // Extract a more user-friendly error from Brevo's response if possible
        const errorMessage = error.response?.body?.message || error.message || 'Erro desconhecido da API.';
        throw new HttpsError('internal', `Falha ao enviar e-mail via Brevo. Detalhes: ${errorMessage}`);
    }
});
