
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Brevo = require("@getbrevo/brevo");
// FIX: Corrected the package name from "@google/generative-ai" to "@google/genai"
// and the imported class from "GoogleGenerativeAI" to "GoogleGenAI" to match the installed package and latest SDK.
const { GoogleGenAI } = require("@google/genai");
const xml2js = require("xml2js");

admin.initializeApp();
const db = admin.firestore();

// --- Helper Functions ---

/**
 * Checks if the user is an authenticated admin.
 * @param {functions.https.CallableContext} context - The context of the function.
 * @returns {Promise<object>} The admin's data.
 * @throws Will throw an error if the user is not an authenticated admin.
 */
const getAdmin = async (context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "A função deve ser chamada por um usuário autenticado.");
    }
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists) {
        throw new functions.https.HttpsError("permission-denied", "O usuário não tem permissões de administrador.");
    }
    return { uid: context.auth.uid, ...adminDoc.data() };
};

/**
 * Initializes and returns the Brevo (Sendinblue) API client.
 * @returns {Brevo.TransactionalEmailsApi} The API client instance.
 * @throws Will throw an error if the Brevo API key is not configured.
 */
const getBrevoApi = () => {
    const apiKey = functions.config().brevo?.key;
    if (!apiKey) {
        console.error("Brevo API key is not set in Firebase Functions config.");
        throw new functions.https.HttpsError("failed-precondition", "A API de e-mail não está configurada.");
    }
    
    // Create a new, isolated ApiClient instance for each call.
    // This is safer in serverless environments than relying on a shared singleton instance.
    const apiClient = new Brevo.ApiClient();
    apiClient.authentications["api-key"].apiKey = apiKey;

    // Pass the configured client directly to the API constructor.
    return new Brevo.TransactionalEmailsApi(apiClient);
};

/**
 * Retrieves the email template from Firestore or returns the default.
 * @param {boolean} useCustom - Whether to try fetching the custom template.
 * @returns {Promise<string>} The HTML content of the email template.
 */
const getEmailTemplateInternal = async (useCustom = true) => {
    const defaultHtml = `<!DOCTYPE html>
    <html>
    <head>
      <title>Parabéns!</title>
    </head>
    <body>
      <h1>Olá, {{promoterName}}!</h1>
      <p>Temos uma ótima notícia! Seu cadastro para o evento/gênero <strong>{{campaignName}}</strong> na organização <strong>{{orgName}}</strong> foi aprovado!</p>
      <p>Para continuar, acesse seu portal exclusivo no link abaixo para ver as regras e entrar no grupo oficial:</p>
      <a href="{{portalLink}}">Acessar Meu Portal</a>
      <p>Atenciosamente,<br>Equipe {{orgName}}</p>
    </body>
    </html>`;

    if (!useCustom) return defaultHtml;

    try {
        const doc = await db.collection("settings").doc("emailTemplate").get();
        if (doc.exists && doc.data().htmlContent) {
            return doc.data().htmlContent;
        }
    } catch (error) {
        console.error("Error fetching custom email template, falling back to default.", error);
    }
    return defaultHtml;
};

/**
 * Sends the approval email to a single promoter.
 * @param {FirebaseFirestore.DocumentSnapshot} promoterDoc - The promoter document snapshot.
 * @returns {Promise<void>}
 * @throws Will throw if sending fails.
 */
const sendApprovalEmail = async (promoterDoc) => {
    const promoterData = promoterDoc.data();
    if (!promoterData || promoterData.status !== "approved") {
        console.log(`Skipping email for promoter ${promoterDoc.id}, status is not 'approved'.`);
        return;
    }

    const orgDoc = await db.collection("organizations").doc(promoterData.organizationId).get();
    const orgName = orgDoc.exists() ? orgDoc.data().name : "Nossa Organização";

    let htmlContent = await getEmailTemplateInternal(true);

    const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;

    htmlContent = htmlContent
        .replace(/{{promoterName}}/g, promoterData.name)
        .replace(/{{promoterEmail}}/g, promoterData.email)
        .replace(/{{campaignName}}/g, promoterData.campaignName || "Geral")
        .replace(/{{orgName}}/g, orgName)
        .replace(/{{portalLink}}/g, portalLink);

    const senderEmail = functions.config().brevo?.sender_email;
    if (!senderEmail) {
        throw new functions.https.HttpsError("failed-precondition", "E-mail do remetente não configurado.");
    }

    const brevoApi = getBrevoApi();
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = `Parabéns! Você foi aprovada como divulgadora! - ${orgName}`;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: orgName, email: senderEmail };
    sendSmtpEmail.to = [{ email: promoterData.email, name: promoterData.name }];

    await brevoApi.sendTransacEmail(sendSmtpEmail);
};


// --- Callable Functions ---

/**
 * Sends a single approval email manually.
 */
exports.manuallySendStatusEmail = functions.https.onCall(async (data, context) => {
    await getAdmin(context); // Auth check
    const { promoterId } = data;

    if (!promoterId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
    }

    const promoterDoc = await db.collection("promoters").doc(promoterId).get();
    if (!promoterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
    }

    try {
        await sendApprovalEmail(promoterDoc);
        return { success: true, message: "E-mail de aprovação enviado com sucesso." };
    } catch (error) {
        console.error("Error in manuallySendStatusEmail:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", "Falha ao enviar e-mail.");
    }
});

/**
 * Sends approval emails to a batch of promoters.
 */
exports.batchNotifyPromoters = functions.https.onCall(async (data, context) => {
    await getAdmin(context); // Auth check
    const { promoterIds } = data;

    if (!Array.isArray(promoterIds) || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "A lista de IDs de divulgadoras é obrigatória.");
    }

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    // Firestore 'in' queries support up to 30 elements. Chunk the array.
    const chunks = [];
    for (let i = 0; i < promoterIds.length; i += 30) {
        chunks.push(promoterIds.slice(i, i + 30));
    }

    for (const chunk of chunks) {
        try {
            const querySnapshot = await db.collection("promoters")
                .where(admin.firestore.FieldPath.documentId(), "in", chunk)
                .get();

            const emailPromises = [];
            querySnapshot.forEach((doc) => {
                emailPromises.push(
                    sendApprovalEmail(doc)
                        .then(() => successCount++)
                        .catch((e) => {
                            console.error(`Failed to send email to ${doc.id}:`, e.message);
                            failureCount++;
                            errors.push(`Falha para ${doc.data().email}: ${e.message}`);
                        })
                );
            });
            await Promise.all(emailPromises);
        } catch (error) {
            console.error("Error fetching promoter chunk:", error);
            failureCount += chunk.length;
            errors.push(`Erro ao buscar lote de ${chunk.length} divulgadoras.`);
        }
    }

    const message = `Processo concluído. E-mails enviados: ${successCount}. Falhas: ${failureCount}.`;
    if (failureCount > 0) {
        console.error("Batch notification errors:", errors.join("; "));
    }
    return { success: failureCount === 0, message };
});


// --- Placeholder/Stub Functions ---
// These functions are called by the frontend but their implementation is not provided.
// They are added here as stubs to prevent deployment errors.

exports.getSystemStatus = functions.https.onCall((data, context) => {
    // This is a placeholder. A real implementation would check Brevo credentials.
    const brevoKey = functions.config().brevo?.key;
    const brevoEmail = functions.config().brevo?.sender_email;
    const configured = !!(brevoKey && brevoEmail);
    return {
        configured,
        message: configured ? "Sistema configurado com Brevo." : "A chave de API do Brevo ou o e-mail do remetente não estão configurados.",
        emailProvider: "Brevo",
        functionVersion: "v1.0 (Stub)",
    };
});

exports.sendTestEmail = functions.https.onCall(async (data, context) => {
    await getAdmin(context);
    const adminEmail = context.auth.token.email;
    // This is a placeholder for sending a test email.
    console.log(`Sending test email of type '${data.testType}' to ${adminEmail}`);
    return { success: true, message: `E-mail de teste enviado para ${adminEmail}. (Simulado)` };
});

exports.createOrganizationAndUser = functions.https.onCall(async (data, context) => {
    // This is a complex function involving user creation and Firestore writes.
    // This is a placeholder.
    console.log("Simulating organization creation for:", data.orgName);
    return { success: true, message: "Organização criada (simulado)." };
});

exports.askGemini = functions.https.onCall(async (data, context) => {
    await getAdmin(context);
    // This is a placeholder.
    const { prompt } = data;
    console.log("Received prompt for Gemini:", prompt);
    return { text: `Esta é uma resposta simulada do Gemini para o prompt: "${prompt}"` };
});

exports.createPagSeguroOrder = functions.https.onCall((data, context) => {
    // Placeholder
    return { payLink: "https://pagseguro.uol.com.br/v2/checkout/payment.html?code=SIMULATED_CODE" };
});

exports.getPagSeguroStatus = functions.https.onCall((data, context) => {
    // Placeholder
    return { configured: false, token: false, email: false };
});

exports.getMercadoPagoStatus = functions.https.onCall((data, context) => {
    // Placeholder
    return { configured: false, publicKey: false, token: false, webhookSecret: false };
});

exports.getEmailTemplate = functions.https.onCall(async (data, context) => {
    await getAdmin(context);
    const htmlContent = await getEmailTemplateInternal(true);
    return { htmlContent };
});

exports.getDefaultEmailTemplate = functions.https.onCall(async (data, context) => {
    await getAdmin(context);
    const htmlContent = await getEmailTemplateInternal(false);
    return { htmlContent };
});

exports.setEmailTemplate = functions.https.onCall(async (data, context) => {
    await getAdmin(context);
    const { htmlContent } = data;
    await db.collection("settings").doc("emailTemplate").set({ htmlContent }, { merge: true });
    return { success: true };
});

exports.resetEmailTemplate = functions.https.onCall(async (data, context) => {
    await getAdmin(context);
    await db.collection("settings").doc("emailTemplate").delete();
    return { success: true };
});

exports.createAdminRequest = functions.https.onCall(async (data, context) => {
    // Placeholder for a complex user creation flow.
    console.log("Simulating admin request for:", data.email);
    return { success: true };
});
