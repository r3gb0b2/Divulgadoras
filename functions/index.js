
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {Timestamp} = require("firebase-admin/firestore");
const xml2js = require("xml2js");

const brevo = require("@getbrevo/brevo");
const {GoogleGenAI} = require("@google/genai");

// --- INITIALIZATION ---
admin.initializeApp();
const db = admin.firestore();

// --- HELPERS ---

/**
 * Gets a configured Brevo API instance using the singleton pattern.
 * Should be called inside a cloud function with the BREVO_KEY secret.
 * @returns {brevo.TransactionalEmailsApi} A configured API instance.
 */
const getBrevoApiInstance = () => {
    const defaultClient = brevo.ApiClient.instance;
    const apiKeyAuth = defaultClient.authentications["api-key"];
    apiKeyAuth.apiKey = process.env.BREVO_KEY;
    return new brevo.TransactionalEmailsApi();
};

/**
 * Fetches the HTML content for the email template from Firestore.
 * @returns {Promise<string>} The HTML content of the email.
 */
const getEmailHtmlContent = async () => {
    const templateDocRef = db.collection("settings").doc("emailTemplates");
    const doc = await templateDocRef.get();

    if (doc.exists() && doc.data().approvedHtml) {
        return doc.data().approvedHtml;
    }
    // Fallback to the default template
    return getDefaultEmailTemplateHtml();
};

/**
 * Returns the hardcoded default HTML template.
 * @returns {string} The default HTML content.
 */
const getDefaultEmailTemplateHtml = () => {
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Parabéns, você foi aprovada!</title>
        <style>
            /* Estilos gerais */
            body { margin: 0; padding: 0; background-color: #1a1a2e; font-family: Arial, sans-serif; }
            .container { max-width: 600px; margin: 20px auto; background-color: #16213e; color: #e0e0e0; border-radius: 8px; overflow: hidden; }
            .header { background-color: #e83a93; padding: 20px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; }
            .content { padding: 30px; }
            .content p { font-size: 16px; line-height: 1.6; }
            .button-container { text-align: center; margin-top: 30px; }
            .button { background-color: #e83a93; color: #ffffff; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
            .footer { background-color: #1a1a2e; text-align: center; padding: 15px; font-size: 12px; color: #888888; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Cadastro Aprovado!</h1>
            </div>
            <div class="content">
                <p>Olá, {{promoterName}}!</p>
                <p>Temos uma ótima notícia! Seu cadastro para o evento <strong>{{campaignName}}</strong> na organização <strong>{{orgName}}</strong> foi aprovado com sucesso.</p>
                <p>Estamos muito felizes em ter você em nosso time de divulgadoras. Para dar os próximos passos, acesse seu portal exclusivo clicando no botão abaixo:</p>
                <div class="button-container">
                    <a href="{{portalLink}}" class="button">Acessar Portal da Divulgadora</a>
                </div>
                <p style="margin-top: 30px;">Lá você encontrará as regras, o link para o grupo oficial e todas as informações importantes.</p>
                <p>Atenciosamente,<br>Equipe {{orgName}}</p>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} {{orgName}}. Todos os direitos reservados.</p>
            </div>
        </div>
    </body>
    </html>`;
};

/**
 * Sends an email using the Brevo API.
 * @param {object} options The email options.
 * @returns {Promise<any>} The result from the Brevo API.
 */
const sendEmail = async ({to, subject, htmlContent, params}) => {
    if (!process.env.BREVO_KEY || !process.env.BREVO_SENDER_EMAIL) {
        throw new HttpsError("failed-precondition", "A API de e-mail não está configurada no servidor (Brevo).");
    }

    const brevoApi = getBrevoApiInstance();
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = to;
    sendSmtpEmail.sender = {email: process.env.BREVO_SENDER_EMAIL, name: "Equipe Certa"};
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.params = params;

    try {
        const data = await brevoApi.sendTransacEmail(sendSmtpEmail);
        logger.info("Email sent successfully via Brevo.", {result: data});
        return data;
    } catch (error) {
        logger.error("Error sending email via Brevo:", error);
        const errorMessage = error.response?.body?.message || error.message || "Erro desconhecido";
        throw new HttpsError("internal", `Falha ao enviar e-mail: ${errorMessage}`, {provider: "Brevo"});
    }
};

/**
 * Replaces placeholders in the HTML content with actual data.
 * @param {string} html The HTML template string.
 * @param {object} data The data to insert.
 * @returns {string} The HTML string with placeholders replaced.
 */
const replacePlaceholders = (html, data) => {
    let result = html;
    for (const key in data) {
        const regex = new RegExp(`{{${key}}}`, "g");
        result = result.replace(regex, data[key]);
    }
    return result;
};


// --- TRIGGERS ---

/**
 * Triggered when a promoter's status changes to 'approved' for the first time.
 */
exports.onPromoterStatusChange = onDocumentCreated(
    {document: "promoters/{promoterId}"},
    async (event) => {
        const promoterData = event.data.data();
        const promoterId = event.params.promoterId;
        logger.info(`Promoter created: ${promoterId}`, promoterData);
        // This function is onDocumentCreated, so it only runs once.
        // We will send notifications manually or in batch.
        return null;
    },
);


// --- CALLABLE FUNCTIONS ---

/**
 * Creates an organization and its owner/admin user.
 */
exports.createOrganizationAndUser = onCall(async (request) => {
    const {orgName, ownerName, phone, taxId, email, password, planId} = request.data;
    if (!email || !password || !orgName || !ownerName || !planId) {
        throw new HttpsError("invalid-argument", "Dados insuficientes para criar a organização.");
    }

    try {
        const userRecord = await admin.auth().createUser({email, password});
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 3);

        const orgData = {
            name: orgName,
            ownerName,
            ownerEmail: email,
            ownerUid: userRecord.uid,
            ownerPhone: phone,
            ownerTaxId: taxId,
            status: "trial",
            planId,
            planExpiresAt: Timestamp.fromDate(trialEndDate),
            createdAt: Timestamp.now(),
            public: true,
            assignedStates: [],
        };
        await db.collection("organizations").doc(userRecord.uid).set(orgData);

        const adminData = {
            email,
            role: "admin",
            organizationId: userRecord.uid,
            assignedStates: [],
        };
        await db.collection("admins").doc(userRecord.uid).set(adminData);

        return {success: true, orgId: userRecord.uid};
    } catch (error) {
        logger.error("Error creating organization and user:", error);
        throw new HttpsError("internal", error.message, error);
    }
});

/**
 * Manually sends a status notification email to a single promoter.
 */
exports.manuallySendStatusEmail = onCall(async (request) => {
    const {promoterId} = request.data;
    if (!promoterId) {
        throw new HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
    }

    const promoterRef = db.collection("promoters").doc(promoterId);
    const promoterDoc = await promoterRef.get();
    if (!promoterDoc.exists) {
        throw new HttpsError("not-found", "Divulgadora não encontrada.");
    }

    const promoter = promoterDoc.data();
    if (promoter.status !== "approved") {
        throw new HttpsError("failed-precondition", "Apenas divulgadoras aprovadas podem ser notificadas.");
    }

    const orgDoc = await db.collection("organizations").doc(promoter.organizationId).get();
    const orgName = orgDoc.exists() ? orgDoc.data().name : "Nossa Equipe";

    const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoter.email)}`;
    const emailHtml = await getEmailHtmlContent();
    const finalHtml = replacePlaceholders(emailHtml, {
        promoterName: promoter.name,
        promoterEmail: promoter.email,
        campaignName: promoter.campaignName || "Geral",
        orgName,
        portalLink,
    });

    await sendEmail({
        to: [{email: promoter.email, name: promoter.name}],
        subject: `Parabéns, você foi aprovada - ${orgName}`,
        htmlContent: finalHtml,
    });

    return {success: true, message: "Notificação enviada com sucesso."};
});

/**
 * Sends status notification emails to a batch of promoters.
 */
exports.batchNotifyPromoters = onCall(async (request) => {
    const {promoterIds} = request.data;
    if (!promoterIds || !Array.isArray(promoterIds) || promoterIds.length === 0) {
        throw new HttpsError("invalid-argument", "A lista de IDs de divulgadoras é obrigatória.");
    }

    const promoterDocs = await db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", promoterIds).get();
    if (promoterDocs.empty) {
        throw new HttpsError("not-found", "Nenhuma divulgadora encontrada para os IDs fornecidos.");
    }

    let successCount = 0;
    const errors = [];
    const emailHtml = await getEmailHtmlContent();

    for (const doc of promoterDocs.docs) {
        const promoter = doc.data();
        try {
            if (promoter.status !== "approved") continue;

            const orgDoc = await db.collection("organizations").doc(promoter.organizationId).get();
            const orgName = orgDoc.exists() ? orgDoc.data().name : "Nossa Equipe";

            const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoter.email)}`;
            const finalHtml = replacePlaceholders(emailHtml, {
                promoterName: promoter.name,
                promoterEmail: promoter.email,
                campaignName: promoter.campaignName || "Geral",
                orgName,
                portalLink,
            });

            await sendEmail({
                to: [{email: promoter.email, name: promoter.name}],
                subject: `Parabéns, você foi aprovada - ${orgName}`,
                htmlContent: finalHtml,
            });
            successCount++;
        } catch (error) {
            logger.error(`Failed to notify promoter ${doc.id}`, error);
            errors.push({id: doc.id, error: error.message});
        }
    }

    return {success: true, message: `${successCount} de ${promoterIds.length} notificações enviadas.`, errors};
});

/**
 * Sends a test email.
 */
exports.sendTestEmail = onCall(async (request) => {
    const {testType, customHtmlContent} = request.data;

    let subject = "E-mail de Teste - Equipe Certa";
    let htmlContent = "<h1>Olá!</h1><p>Este é um e-mail de teste da plataforma Equipe Certa. Se você o recebeu, a conexão com o provedor de e-mail está funcionando.</p>";
    const testRecipient = process.env.BREVO_SENDER_EMAIL;

    if (testType === "approved" || testType === "custom_approved") {
        subject = "TESTE: Parabéns, você foi aprovada!";
        htmlContent = testType === "custom_approved" ? customHtmlContent : await getEmailHtmlContent();
        htmlContent = replacePlaceholders(htmlContent, {
            promoterName: "Divulgadora Teste",
            promoterEmail: testRecipient,
            campaignName: "Evento de Teste",
            orgName: "Organização Teste",
            portalLink: "https://divulgadoras.vercel.app/",
        });
    }

    await sendEmail({
        to: [{email: testRecipient, name: "Admin Teste"}],
        subject,
        htmlContent,
    });
    return {success: true, message: `E-mail de teste enviado para ${testRecipient}.`};
});

/**
 * Gets the system status, especially for email configuration.
 */
exports.getSystemStatus = onCall(async () => {
    const log = [];
    let configured = true;
    let message = "Configuração de e-mail parece estar correta.";

    if (process.env.BREVO_KEY) {
        log.push({level: "SUCCESS", message: "Variável BREVO_KEY encontrada."});
    } else {
        configured = false;
        log.push({level: "ERROR", message: "Variável de ambiente BREVO_KEY não encontrada."});
    }

    if (process.env.BREVO_SENDER_EMAIL) {
        log.push({level: "SUCCESS", message: "Variável BREVO_SENDER_EMAIL encontrada."});
    } else {
        configured = false;
        log.push({level: "ERROR", message: "Variável de ambiente BREVO_SENDER_EMAIL não encontrada."});
    }

    if (!configured) {
        message = "Faltam variáveis de ambiente para o envio de e-mails. Configure-as no Firebase.";
    }

    return {
        functionVersion: "19.0",
        emailProvider: "Brevo",
        configured,
        message,
        log,
    };
});

/**
 * Creates an admin application and a disabled auth user.
 */
exports.createAdminRequest = onCall(async (request) => {
    const {email, password, name, phone, message} = request.data;
    if (!email || !password || !name || !phone) {
        throw new HttpsError("invalid-argument", "Dados insuficientes para a solicitação.");
    }
    try {
        const userRecord = await admin.auth().createUser({email, password, disabled: true});
        const appData = {name, email, phone, message, createdAt: Timestamp.now()};
        await db.collection("adminApplications").doc(userRecord.uid).set(appData);
        await admin.auth().updateUser(userRecord.uid, {displayName: name});
        return {success: true};
    } catch (error) {
        logger.error("Error creating admin request:", error);
        throw new HttpsError("internal", error.message, error);
    }
});


/**
 * Creates a PagSeguro order for subscription.
 */
exports.createPagSeguroOrder = onCall(async (request) => {
    const {orgId, planId} = request.data;
    if (!orgId || !planId) throw new HttpsError("invalid-argument", "ID da organização e do plano são obrigatórios.");

    const token = process.env.PAGSEGURO_TOKEN;
    const email = process.env.PAGSEGURO_EMAIL;
    if (!token || !email) throw new HttpsError("failed-precondition", "Credenciais do PagSeguro não configuradas.");

    // Fetch organization details
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) throw new HttpsError("not-found", "Organização não encontrada.");
    const orgData = orgDoc.data();

    const planDetails = {
        basic: {id: "basic", amount: "49.00", description: "Plano Básico - Equipe Certa"},
        professional: {id: "professional", amount: "99.00", description: "Plano Profissional - Equipe Certa"},
    };

    const plan = planDetails[planId];
    if (!plan) throw new HttpsError("invalid-argument", "Plano inválido.");
    
    const url = `https://ws.pagseguro.uol.com.br/v2/checkout?email=${email}&token=${token}`;
    const body = `currency=BRL&itemId1=${plan.id}&itemDescription1=${encodeURIComponent(plan.description)}&itemAmount1=${plan.amount}&itemQuantity1=1&reference=${orgId}`;
    
    try {
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(url, {
            method: "POST",
            body,
            headers: {"Content-Type": "application/x-www-form-urlencoded; charset=ISO-8859-1"},
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error("PagSeguro API error response:", errorText);
            throw new Error(`Erro do PagSeguro: ${response.statusText}`);
        }

        const responseText = await response.text();
        const parsed = await xml2js.parseStringPromise(responseText);
        const checkoutCode = parsed.checkout.code[0];
        const payLink = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${checkoutCode}`;
        
        return {payLink};
    } catch (error) {
        logger.error("Error creating PagSeguro order:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * Gets PagSeguro configuration status.
 */
exports.getPagSeguroStatus = onCall(() => {
    return {
        configured: !!process.env.PAGSEGURO_TOKEN && !!process.env.PAGSEGURO_EMAIL,
        token: !!process.env.PAGSEGURO_TOKEN,
        email: !!process.env.PAGSEGURO_EMAIL,
    };
});

/**
 * Interacts with the Gemini API.
 */
exports.askGemini = onCall(async (request) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new HttpsError("failed-precondition", "A API do Gemini não está configurada no servidor.");
    }

    const {prompt} = request.data;
    if (!prompt) {
        throw new HttpsError("invalid-argument", "O prompt não pode ser vazio.");
    }

    try {
        const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return {text: response.text};
    } catch (error) {
        logger.error("Error calling Gemini API:", error);
        throw new HttpsError("internal", "Falha ao comunicar com a API do Gemini.");
    }
});

// --- Email Template Functions ---
exports.getEmailTemplate = onCall(async () => ({htmlContent: await getEmailHtmlContent()}));
exports.getDefaultEmailTemplate = onCall(() => ({htmlContent: getDefaultEmailTemplateHtml()}));
exports.setEmailTemplate = onCall(async (request) => {
    if (request.auth.token.role !== "superadmin") {
        throw new HttpsError("permission-denied", "Apenas Super Admins podem alterar o template.");
    }
    await db.collection("settings").doc("emailTemplates").set({approvedHtml: request.data.htmlContent});
    return {success: true};
});
exports.resetEmailTemplate = onCall(async (request) => {
    if (request.auth.token.role !== "superadmin") {
        throw new HttpsError("permission-denied", "Apenas Super Admins podem redefinir o template.");
    }
    await db.collection("settings").doc("emailTemplates").delete();
    return {success: true};
});
