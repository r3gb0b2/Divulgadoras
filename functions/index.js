const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v1/https");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");
const Brevo = require("@getbrevo/brevo");
const xml2js = require("xml2js");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = getFirestore();

// --- HELPERS ---

const requireAuth = (context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação requer autenticação.");
    }
};

const requireSuperAdmin = async (context) => {
    requireAuth(context);
    const { uid } = context.auth;
    const adminDoc = await db.collection("admins").doc(uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== "superadmin") {
        throw new functions.https.HttpsError("permission-denied", "Ação requer permissão de Super Admin.");
    }
};

// --- AUTH AND ORGANIZATION MANAGEMENT ---

const plans = {
    basic: { id: "basic", price: 4900 },
    professional: { id: "professional", price: 9900 },
};

exports.createOrganizationAndUser = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        functions.logger.info("createOrganizationAndUser called with data:", { email: data.email, orgName: data.orgName });

        const { orgName, email, password, planId, ownerName, phone, taxId } = data;

        if (!orgName || !email || !password || !planId || !ownerName || !phone || !taxId) {
            functions.logger.error("Validation failed: Missing required fields.", data);
            throw new HttpsError("invalid-argument", "Todos os campos são obrigatórios.");
        }
        if (ownerName.trim().split(/\s+/).length < 2) {
            functions.logger.error("Validation failed: Owner name is not a full name.", { ownerName });
            throw new HttpsError("invalid-argument", "Por favor, insira seu nome completo (nome e sobrenome).");
        }
        const cleanedPhone = phone.replace(/\D/g, '');
        if (cleanedPhone.length < 10 || cleanedPhone.length > 11) {
            throw new HttpsError("invalid-argument", "O telefone deve ter 10 ou 11 dígitos (DDD + número).");
        }
        const cleanedTaxId = taxId.replace(/\D/g, '');
        if (cleanedTaxId.length !== 11 && cleanedTaxId.length !== 14) {
            throw new HttpsError("invalid-argument", "O CPF deve ter 11 dígitos e o CNPJ 14 dígitos.");
        }

        let userRecord;
        try {
            userRecord = await admin.auth().createUser({ email, password });
            functions.logger.info("Successfully created auth user:", { uid: userRecord.uid, email: userRecord.email });
        } catch (error) {
            functions.logger.error("Error creating auth user:", error);
            if (error.code === 'auth/email-already-exists') {
                 throw new HttpsError("already-exists", "Este e-mail já está cadastrado. Tente fazer login.");
            }
            throw new HttpsError("internal", "Falha ao criar o usuário de autenticação.", error);
        }
        
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 3);

        const batch = db.batch();
        const orgRef = db.collection("organizations").doc();
        batch.set(orgRef, {
            name: orgName,
            ownerName: ownerName,
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
        });
        const adminRef = db.collection("admins").doc(userRecord.uid);
        batch.set(adminRef, {
            email,
            role: "admin",
            organizationId: orgRef.id,
            assignedStates: [],
        });
        try {
            await batch.commit();
            functions.logger.info("Batch commit successful for new organization.", { orgId: orgRef.id });
        } catch (error) {
            functions.logger.error("Error committing batch for new organization:", error);
            await admin.auth().deleteUser(userRecord.uid);
            functions.logger.warn("Rolled back auth user creation due to batch failure.", { uid: userRecord.uid });
            throw new HttpsError("internal", "Falha ao salvar os dados no banco de dados. O usuário não foi criado. Tente novamente.", error);
        }

        functions.logger.info("Function finished successfully.", { orgId: orgRef.id });
        return { success: true, orgId: orgRef.id };
    });

exports.createAdminRequest = functions
    .region("southamerica-east1")
    .https.onCall(async (data) => {
        const { email, password, ...appData } = data;
        const userRecord = await admin.auth().createUser({
            email,
            password,
            disabled: true,
        });
        await db.collection("adminApplications").doc(userRecord.uid).set({
            ...appData,
            email,
            createdAt: Timestamp.now(),
        });
        await admin.auth().updateUser(userRecord.uid, { disabled: false });
        return { success: true };
    });

// --- PAGSEGURO PAYMENT INTEGRATION ---

exports.createPagSeguroOrder = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        requireAuth(context);
        const { orgId, planId } = data;
        if (!orgId || !planId) {
            throw new HttpsError("invalid-argument", "ID da organização e do plano são obrigatórios.");
        }
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) throw new HttpsError("not-found", "Organização não encontrada.");
        const organization = orgDoc.data();
        if (!organization.ownerName || !organization.ownerPhone || !organization.ownerTaxId) {
            throw new HttpsError("failed-precondition", "Dados do cliente (Nome, Telefone, CPF/CNPJ) estão faltando. Por favor, preencha-os na página de assinatura.");
        }
        if (organization.ownerName.trim().split(/\s+/).length < 2) {
            throw new HttpsError("invalid-argument", "O nome do responsável cadastrado está incompleto. Por favor, atualize para nome e sobrenome na página de assinatura.");
        }
        const plan = plans[planId];
        if (!plan) throw new HttpsError("not-found", "Plano não encontrado.");
        const config = functions.config();
        const pagseguroToken = config.pagseguro?.token;
        if (!pagseguroToken) {
            functions.logger.error("PagSeguro token is not configured.");
            throw new HttpsError("failed-precondition", "Credenciais do PagSeguro não configuradas no servidor.");
        }
        const taxId = (organization.ownerTaxId || "").replace(/\D/g, "");
        if (taxId.length !== 11 && taxId.length !== 14) {
            throw new HttpsError("invalid-argument", `O CPF/CNPJ cadastrado (${organization.ownerTaxId}) é inválido. Verifique o número de dígitos e tente novamente.`);
        }
        const phone = (organization.ownerPhone || "").replace(/\D/g, "");
        if (phone.length < 10 || phone.length > 11) {
            throw new HttpsError("invalid-argument", `O número de telefone cadastrado (${organization.ownerPhone}) é inválido. Deve incluir o DDD e ter 8 ou 9 dígitos.`);
        }
        const areaCode = phone.substring(0, 2);
        const phoneNumber = phone.substring(2);
        if (phoneNumber.length !== 8 && phoneNumber.length !== 9) {
            throw new HttpsError("invalid-argument", `O formato do telefone (${organization.ownerPhone}) é inválido após extrair o DDD. Verifique o número.`);
        }
        const body = {
            "reference_id": `ORG_${orgId}_${Date.now()}`,
            "customer": {
                "name": organization.ownerName,
                "email": organization.ownerEmail,
                "tax_id": taxId,
                "phones": [{ "country": "55", "area": areaCode, "number": phoneNumber, "type": "MOBILE" }]
            },
            "items": [{ "name": `Assinatura Plano ${planId}`, "quantity": 1, "unit_amount": plan.price }],
            "redirect_url": `https://${process.env.GCLOUD_PROJECT}.web.app/#/admin/settings/subscription`,
            "notification_urls": [`https://southamerica-east1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/pagSeguroWebhook`]
        };
        const response = await fetch("https://api.pagseguro.com/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pagseguroToken}` },
            body: JSON.stringify(body),
        });
        const responseData = await response.json();
        if (!response.ok) {
            functions.logger.error("PagSeguro API error:", responseData);
            const errorDetail = responseData.error_messages?.[0]?.description || "Erro desconhecido.";
            if (errorDetail.toLowerCase().includes("whitelist")) {
                 throw new HttpsError("failed-precondition", "Sua conta PagSeguro precisa ser liberada para transações via API (whitelist). Por favor, entre em contato com o suporte do PagSeguro para solicitar a liberação.");
            }
            throw new HttpsError("internal", `Falha ao criar pedido de pagamento no PagSeguro. ${errorDetail}`);
        }
        return { payLink: responseData.links.find((l) => l.rel === "PAY").href };
    });

exports.pagSeguroWebhook = functions
    .region("southamerica-east1")
    .https.onRequest(async (req, res) => {
        if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
        const { notificationCode } = req.body;
        if (!notificationCode) return res.status(400).send("Invalid notification.");
        try {
            const config = functions.config();
            const token = config.pagseguro.token;
            const email = config.pagseguro.email;
            const url = `https://ws.pagseguro.uol.com.br/v3/transactions/notifications/${notificationCode}?email=${email}&token=${token}`;
            const transactionResponse = await fetch(url);
            if (!transactionResponse.ok) throw new Error(`Failed to fetch transaction: ${transactionResponse.statusText}`);
            const xmlData = await transactionResponse.text();
            const result = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
            const { status, reference } = result.transaction;
            if (["3", "4"].includes(status)) {
                const orgId = reference.split("_")[1];
                const orgRef = db.collection("organizations").doc(orgId);
                const orgDoc = await orgRef.get();
                let newExpiryDate = new Date();
                if (orgDoc.exists() && orgDoc.data().planExpiresAt.toDate() > new Date()) {
                    newExpiryDate = orgDoc.data().planExpiresAt.toDate();
                }
                newExpiryDate.setDate(newExpiryDate.getDate() + 30);
                await orgRef.update({
                    status: "active",
                    planExpiresAt: Timestamp.fromDate(newExpiryDate),
                });
                functions.logger.info(`Organization ${orgId} renewed successfully.`);
            }
            return res.status(200).send("OK");
        } catch (error) {
            functions.logger.error("Error processing PagSeguro webhook:", error);
            return res.status(500).send("Webhook processing failed.");
        }
    });

// --- GEMINI AI INTEGRATION ---

exports.askGemini = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        requireAuth(context);
        const { prompt } = data;
        if (!prompt) throw new HttpsError("invalid-argument", "O prompt não pode ser vazio.");
        try {
            const ai = new GoogleGenAI({apiKey: functions.config().gemini.key});
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });
            return { text: response.text };
        } catch (error) {
            functions.logger.error("Gemini API call failed", error);
            throw new HttpsError("internal", "Falha ao comunicar com a API de IA.");
        }
    });

// --- EMAIL (BREVO) INTEGRATION & TEMPLATES ---

const defaultApprovalHtml = `<!DOCTYPE html>
<html>
<head>
<title>Aprovação de Cadastro</title>
<style>
  body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
  .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; }
  .header { font-size: 24px; font-weight: bold; color: #e83a93; text-align: center; }
  .content { margin-top: 20px; }
  .button { display: block; width: fit-content; margin: 20px auto; padding: 12px 25px; background-color: #e83a93; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">Parabéns, {{promoterName}}!</div>
    <div class="content">
      <p>Temos uma ótima notícia! Seu cadastro para o evento/gênero <strong>{{campaignName}}</strong> da organização <strong>{{orgName}}</strong> foi aprovado!</p>
      <p>Estamos muito felizes em ter você em nossa equipe. Para continuar, por favor, acesse seu portal exclusivo clicando no botão abaixo:</p>
      <a href="{{portalLink}}" class="button">Acessar Portal da Divulgadora</a>
      <p>No portal, você encontrará as regras do evento e o link para o grupo oficial no WhatsApp.</p>
      <p>Atenciosamente,<br>Equipe {{orgName}}</p>
    </div>
  </div>
</body>
</html>`;

const sendEmail = async ({ recipientEmail, subject, htmlContent }) => {
    const config = functions.config();
    const brevoKey = config.brevo?.key;
    const senderEmail = config.brevo?.sender_email;
    if (!brevoKey || !senderEmail) {
        functions.logger.error("Attempted to send email but Brevo is not configured.");
        return;
    }
    try {
        const defaultClient = Brevo.ApiClient.instance;
        const apiKeyAuth = defaultClient.authentications["api-key"];
        apiKeyAuth.apiKey = brevoKey;
        const apiInstance = new Brevo.TransactionalEmailsApi();
        const sendSmtpEmail = {
            sender: { name: "Equipe Certa", email: senderEmail },
            to: [{ email: recipientEmail }],
            subject,
            htmlContent,
        };
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        functions.logger.info(`Email sent to ${recipientEmail} with subject: ${subject}`);
    } catch (error) {
        functions.logger.error(`Failed to send email to ${recipientEmail} via Brevo:`, error.response ? error.response.body : error);
    }
};

const getApprovalEmailHtml = async (promoter, organization) => {
    const templateDoc = await db.collection("settings").doc("emailTemplates").get();
    let htmlTemplate = defaultApprovalHtml;
    if (templateDoc.exists() && templateDoc.data().approvedHtml) {
        htmlTemplate = templateDoc.data().approvedHtml;
    }
    const portalLink = `https://${process.env.GCLOUD_PROJECT}.web.app/#/status?email=${encodeURIComponent(promoter.email)}`;
    return htmlTemplate
        .replace(/{{promoterName}}/g, promoter.name)
        .replace(/{{campaignName}}/g, promoter.campaignName || "Geral")
        .replace(/{{orgName}}/g, organization.name)
        .replace(/{{portalLink}}/g, portalLink);
};

exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        if (before.status !== "pending" || after.status === "pending") {
            return null;
        }
        
        const { organizationId, campaignName, name, email, rejectionReason } = after;
        
        if (!organizationId) {
            functions.logger.warn(`Promoter ${context.params.promoterId} has no organizationId. Skipping email.`);
            return null;
        }
        const orgDoc = await db.collection("organizations").doc(organizationId).get();
        if (!orgDoc.exists) {
            functions.logger.error(`Organization ${organizationId} not found for promoter ${context.params.promoterId}.`);
            return null;
        }
        const organization = orgDoc.data();

        if (after.status === "approved") {
            const finalHtml = await getApprovalEmailHtml(after, organization);
            await sendEmail({
                recipientEmail: email,
                subject: `Parabéns! Você foi aprovada - ${organization.name}`,
                htmlContent: finalHtml,
            });
        } else if (after.status === "rejected") {
            const finalRejectionReason = rejectionReason || "Agradecemos o seu interesse, mas no momento seu perfil não foi selecionado.";
            const htmlContent = `
                <p>Olá ${name},</p>
                <p>Analisamos seu cadastro para ${campaignName || "a vaga de divulgadora"} na organização ${organization.name}.</p>
                <p>Motivo: ${finalRejectionReason}</p>
                <p>Agradecemos seu tempo e desejamos boa sorte no futuro.</p>
                <p>Atenciosamente,<br>Equipe ${organization.name}</p>
            `;
            await sendEmail({
                recipientEmail: email,
                subject: `Retorno sobre seu cadastro - ${organization.name}`,
                htmlContent: htmlContent,
            });
        }
        return null;
    });

exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        requireAuth(context);
        const { promoterId } = data;
        if (!promoterId) {
            throw new HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
        }
        const promoterDoc = await db.collection("promoters").doc(promoterId).get();
        if (!promoterDoc.exists) {
            throw new HttpsError("not-found", "Divulgadora não encontrada.");
        }
        const promoter = promoterDoc.data();
        if (promoter.status !== "approved") {
            throw new HttpsError("failed-precondition", "Apenas divulgadoras aprovadas podem ser notificadas manualmente.");
        }
        const { organizationId, email } = promoter;
        const orgDoc = await db.collection("organizations").doc(organizationId).get();
        if (!orgDoc.exists) {
            throw new HttpsError("not-found", "Organização da divulgadora não foi encontrada.");
        }
        const organization = orgDoc.data();
        const finalHtml = await getApprovalEmailHtml(promoter, organization);

        const config = functions.config();
        const brevoKey = config.brevo?.key;
        const senderEmail = config.brevo?.sender_email;
        if (!brevoKey || !senderEmail) {
            throw new HttpsError("failed-precondition", "Credenciais do provedor de e-mail (Brevo) não configuradas.");
        }
        try {
            const defaultClient = Brevo.ApiClient.instance;
            const apiKeyAuth = defaultClient.authentications["api-key"];
            apiKeyAuth.apiKey = brevoKey;
            const apiInstance = new Brevo.TransactionalEmailsApi();
            const sendSmtpEmail = {
                sender: { name: organization.name, email: senderEmail },
                to: [{ email }],
                subject: `Parabéns! Você foi aprovada - ${organization.name}`,
                htmlContent: finalHtml,
            };
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            return { success: true, message: `E-mail de aprovação enviado para ${email}.` };
        } catch (error) {
            functions.logger.error(`Manual notification failed for ${promoterId}:`, error.response ? error.response.body : error);
            const errorMessage = error.response?.body?.message || error.message || "Erro desconhecido";
            throw new HttpsError("internal", "Falha ao enviar e-mail através do provedor.", { originalError: errorMessage });
        }
    });

exports.sendTestEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        await requireSuperAdmin(context);
        const { testType, customHtmlContent } = data;
        const recipientEmail = context.auth.token.email;
        const config = functions.config();
        const brevoKey = config.brevo?.key;
        const senderEmail = config.brevo?.sender_email;
        if (!brevoKey || !senderEmail) {
            throw new HttpsError("failed-precondition", "As credenciais do provedor de e-mail (Brevo) não estão configuradas no servidor.");
        }
        let subject = "";
        let htmlContent = "";
        const placeholderData = {
            promoterName: "Maria Exemplo",
            campaignName: "Evento de Teste",
            orgName: "Sua Organização",
            portalLink: `https://${process.env.GCLOUD_PROJECT}.web.app/#/status?email=maria@exemplo.com`,
        };
        switch (testType) {
        case "generic":
            subject = "Teste de Conexão - Equipe Certa";
            htmlContent = "<p>Se você recebeu este e-mail, a conexão com a Brevo está funcionando corretamente!</p>";
            break;
        case "approved":
        case "custom_approved": {
            const templateDoc = await db.collection("settings").doc("emailTemplates").get();
            const hasCustomTemplate = templateDoc.exists() && templateDoc.data().approvedHtml;
            if (testType === 'custom_approved') {
                 if (!customHtmlContent) throw new HttpsError("invalid-argument", "Conteúdo HTML customizado é necessário para este tipo de teste.");
                 htmlContent = customHtmlContent;
                 subject = "Teste: E-mail de Aprovação (Customizado)";
            } else {
                 htmlContent = hasCustomTemplate ? templateDoc.data().approvedHtml : defaultApprovalHtml;
                 subject = `Teste: E-mail de Aprovação (${hasCustomTemplate ? "Custom" : "Padrão"})`;
            }
            break;
        }
        case "rejected":
            subject = "Teste: E-mail de Rejeição";
            htmlContent = "<p>Este é um e-mail de teste para uma candidata não aprovada.</p><p><b>Motivo Exemplo:</b> Perfil inadequado para a vaga.</p>";
            break;
        default:
            throw new HttpsError("invalid-argument", "Tipo de teste de e-mail inválido fornecido.");
        }
        for (const key in placeholderData) {
            htmlContent = htmlContent.replace(new RegExp(`{{${key}}}`, "g"), placeholderData[key]);
        }
        try {
            const defaultClient = Brevo.ApiClient.instance;
            const apiKeyAuth = defaultClient.authentications["api-key"];
            apiKeyAuth.apiKey = brevoKey;
            const apiInstance = new Brevo.TransactionalEmailsApi();
            const sendSmtpEmail = {
                sender: { name: "Equipe Certa (Teste)", email: senderEmail },
                to: [{ email: recipientEmail }],
                subject,
                htmlContent,
            };
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            functions.logger.info(`Test email '${testType}' sent to ${recipientEmail}`);
            return { success: true, message: `E-mail de teste '${testType}' enviado para ${recipientEmail}.` };
        } catch (error) {
            functions.logger.error("Failed to send test email via Brevo:", error.response ? error.response.body : error);
            const errorMessage = error.response?.body?.message || error.message || "Erro desconhecido";
            throw new HttpsError("internal", "Falha ao enviar e-mail através do provedor.", { originalError: errorMessage });
        }
    });

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context);
    const docRef = db.collection("settings").doc("emailTemplates");
    const docSnap = await docRef.get();
    if (docSnap.exists() && docSnap.data().approvedHtml) {
        return { htmlContent: docSnap.data().approvedHtml };
    }
    return { htmlContent: defaultApprovalHtml };
});

exports.getDefaultEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context);
    return { htmlContent: defaultApprovalHtml };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context);
    const { htmlContent } = data;
    if (typeof htmlContent !== 'string') {
        throw new HttpsError("invalid-argument", "htmlContent deve ser uma string.");
    }
    await db.collection("settings").doc("emailTemplates").set({ approvedHtml: htmlContent }, { merge: true });
    return { success: true };
});

exports.resetEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await requireSuperAdmin(context);
    await db.collection("settings").doc("emailTemplates").update({ approvedHtml: FieldValue.delete() });
    return { success: true };
});

// --- SYSTEM STATUS & DIAGNOSTICS ---

exports.getPagSeguroStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        await requireSuperAdmin(context);
        const config = functions.config();
        const token = config.pagseguro?.token;
        const email = config.pagseguro?.email;
        return { configured: !!token && !!email, token: !!token, email: !!email };
    });

exports.getMercadoPagoStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        await requireSuperAdmin(context);
        return { configured: false, token: false, publicKey: false, webhookSecret: false };
    });

exports.getSystemStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        await requireSuperAdmin(context);
        const config = functions.config();
        const brevoKey = config.brevo?.key;
        const brevoEmail = config.brevo?.sender_email;
        const log = [];
        const response = {
            functionVersion: process.env.K_REVISION,
            emailProvider: "Brevo",
            configured: false,
            message: "",
            log: log,
        };
        log.push({ level: "INFO", message: "Iniciando verificação do sistema de e-mail..." });
        if (!brevoKey) {
            log.push({ level: "ERROR", message: "A variável 'brevo.key' não foi encontrada na configuração." });
            response.message = "Configuração incompleta. A chave da API (brevo.key) está faltando.";
            return response;
        }
        log.push({ level: "SUCCESS", message: "Variável 'brevo.key' encontrada." });
        if (!brevoEmail) {
            log.push({ level: "ERROR", message: "A variável 'brevo.sender_email' não foi encontrada." });
            response.message = "Configuração incompleta. O e-mail do remetente (brevo.sender_email) está faltando.";
            return response;
        }
        log.push({ level: "SUCCESS", message: `Variável 'brevo.sender_email' encontrada: ${brevoEmail}` });
        try {
            log.push({ level: "INFO", message: "Tentando autenticar com a API da Brevo..." });
            const defaultClient = Brevo.ApiClient.instance;
            const apiKeyAuth = defaultClient.authentications["api-key"];
            apiKeyAuth.apiKey = brevoKey;
            const apiInstance = new Brevo.AccountApi();
            const accountInfo = await apiInstance.getAccount();
            log.push({ level: "SUCCESS", message: "Autenticação com a Brevo bem-sucedida." });
            if (accountInfo && accountInfo.email && accountInfo.plan) {
                 log.push({ level: "INFO", message: `Conta Brevo: ${accountInfo.email} | Plano: ${accountInfo.plan[0].type}` });
            }
            response.configured = true;
            response.message = `Conexão com a Brevo (remetente: ${brevoEmail}) estabelecida com sucesso.`;
        } catch (error) {
            functions.logger.error("Brevo API connection failed during status check:", error);
            let errorMessage = "Erro desconhecido ao conectar com a Brevo.";
            if (error.response && error.response.body && error.response.body.message) {
                errorMessage = `API da Brevo respondeu com: '${error.response.body.message}'`;
            } else if (error.message) {
                errorMessage = error.message;
            }
            log.push({ level: "ERROR", message: `Falha na autenticação. ${errorMessage}` });
            if (String(errorMessage).toLowerCase().includes("api key is invalid")) {
                 response.message = "A chave da API da Brevo configurada é INVÁLIDA. Verifique se copiou a chave corretamente.";
            } else {
                 response.message = "A verificação com a API da Brevo falhou. Veja o log de diagnóstico para detalhes.";
            }
        }
        return response;
    });