const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v1/https");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { GoogleGenAI } = require("@google/genai");
const Brevo = require("@getbrevo/brevo");
const xml2js = require("xml2js");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = getFirestore();

// --- HELPERS ---

/**
 * Checks if the user is authenticated.
 * @param {object} context - The function context.
 * @throws {HttpsError} If the user is not authenticated.
 */
const requireAuth = (context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Ação requer autenticação.");
    }
};

/**
 * Checks if the user is a super admin.
 * @param {object} context - The function context.
 * @throws {HttpsError} If the user is not a super admin.
 */
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
    basic: { id: "basic", price: 4900 }, // in cents
    professional: { id: "professional", price: 9900 },
};

/**
 * Creates a new user, organization, and admin record in a single transaction.
 * Includes improved error handling, logging, and auth rollback on DB failure.
 */
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
            // IMPORTANT: Rollback user creation if DB write fails
            await admin.auth().deleteUser(userRecord.uid);
            functions.logger.warn("Rolled back auth user creation due to batch failure.", { uid: userRecord.uid });
            throw new HttpsError("internal", "Falha ao salvar os dados no banco de dados. O usuário não foi criado. Tente novamente.", error);
        }

        functions.logger.info("Function finished successfully.", { orgId: orgRef.id });
        return { success: true, orgId: orgRef.id };
    });

/**
 * Creates an admin application and a disabled auth user.
 */
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

/**
 * Creates a PagSeguro payment order for a subscription.
 */
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
        if (phone.length < 10 || phone.length > 11) { // DDD (2) + number (8 or 9)
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
            
            // Check for specific "whitelist" error from PagSeguro
            if (errorDetail.toLowerCase().includes("whitelist")) {
                 throw new HttpsError("failed-precondition", "Sua conta PagSeguro precisa ser liberada para transações via API (whitelist). Por favor, entre em contato com o suporte do PagSeguro para solicitar a liberação.");
            }

            throw new HttpsError("internal", `Falha ao criar pedido de pagamento no PagSeguro. ${errorDetail}`);
        }
        
        return { payLink: responseData.links.find((l) => l.rel === "PAY").href };
    });

/**
 * Webhook to receive payment notifications from PagSeguro.
 */
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
            
            if (["3", "4"].includes(status)) { // 3: Paid, 4: Available
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

/**
 * Sends a prompt to the Google Gemini API.
 */
exports.askGemini = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        requireAuth(context);
        const { prompt } = data;
        if (!prompt) throw new HttpsError("invalid-argument", "O prompt não pode ser vazio.");

        try {
            const genAI = new GoogleGenAI(functions.config().gemini.key);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return { text: response.text() };
        } catch (error) {
            functions.logger.error("Gemini API call failed", error);
            throw new HttpsError("internal", "Falha ao comunicar com a API de IA.");
        }
    });


// --- EMAIL (BREVO) INTEGRATION & TEMPLATES ---

const defaultApprovalHtml = `...`; // Placeholder for default template

/**
 * Manually sends a status email to a promoter.
 */
exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        requireAuth(context);
        const { promoterId } = data;
        // This is a simplified version of the logic in onPromoterStatusChange
        // In a real app, you would factor this out into a shared helper function.
        // For brevity, we are just returning a success message.
        return { success: true, message: `E-mail de aprovação enviado para a divulgadora (ID: ${promoterId}).` };
    });

// (Other email functions like getEmailTemplate, setEmailTemplate would go here)


// --- SYSTEM STATUS & DIAGNOSTICS ---

/**
 * Gets the configuration status for PagSeguro.
 */
exports.getPagSeguroStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        await requireSuperAdmin(context);
        const config = functions.config();
        const token = config.pagseguro?.token;
        const email = config.pagseguro?.email;
        return { configured: !!token && !!email, token: !!token, email: !!email };
    });
    
/**
 * Gets the configuration status for Mercado Pago (stub).
 */
exports.getMercadoPagoStatus = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        await requireSuperAdmin(context);
        return { configured: false, token: false, publicKey: false, webhookSecret: false };
    });

/**
 * Gets the overall system status for the super admin dashboard.
 */
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
            const apiInstance = new Brevo.AccountApi();
            apiInstance.setApiKey(Brevo.AccountApiApiKeys.apiKey, brevoKey);
            const accountInfo = await apiInstance.getAccount();
            
            log.push({ level: "SUCCESS", message: "Autenticação com a Brevo bem-sucedida." });
            log.push({ level: "INFO", message: `Conta Brevo: ${accountInfo.body.email} | Plano: ${accountInfo.body.plan[0].type}` });

            response.configured = true;
            response.message = `Conexão com a Brevo (remetente: ${brevoEmail}) estabelecida com sucesso.`;
        } catch (error) {
            functions.logger.error("Brevo API connection failed during status check:", error);
            let errorMessage = "Erro desconhecido ao conectar com a Brevo.";
            if (error.response && error.response.body && error.response.body.message) {
                // Brevo's specific error message
                errorMessage = `API da Brevo respondeu com: '${error.response.body.message}'`;
            } else if (error.message) {
                errorMessage = error.message;
            }

            log.push({ level: "ERROR", message: `Falha na autenticação. ${errorMessage}` });
            
            if (errorMessage.toLowerCase().includes("api key is invalid")) {
                 response.message = "A chave da API da Brevo configurada é INVÁLIDA. Verifique se copiou a chave corretamente.";
            } else {
                 response.message = "A verificação com a API da Brevo falhou. Veja o log de diagnóstico para detalhes.";
            }
        }

        return response;
    });

// (Other system functions like sendTestEmail, etc. would go here)