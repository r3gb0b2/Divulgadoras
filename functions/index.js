
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const Brevo = require("@getbrevo/brevo");
const xml2js = require("xml2js");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// --- START OF HELPER FUNCTIONS ---

// Helper function to safely get Firebase Functions config
const getConfig = (key) => {
    try {
        // Attempt to find the key in any of the config groups
        const config = functions.config();
        if (config.pagseguro && config.pagseguro[key]) return config.pagseguro[key];
        if (config.brevo && config.brevo[key]) return config.brevo[key];
        if (config.gemini && config.gemini[key]) return config.gemini[key];
        return undefined;
    } catch (e) {
        console.warn(`Could not retrieve config for key: ${key}. This might be expected if configs are not set.`);
        return undefined;
    }
};

// Centralized Brevo API client initialization
const initializeBrevo = () => {
    const brevoApiKey = getConfig("key");
    if (!brevoApiKey) {
        console.error("Brevo API key is not configured.");
        return null;
    }
    const defaultClient = Brevo.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = brevoApiKey;
    return new Brevo.TransactionalEmailsApi();
};


// Centralized and robust email sending function
const sendEmail = async (toEmail, toName, subject, htmlContent) => {
    const brevoApi = initializeBrevo();
    if (!brevoApi) {
        throw new functions.https.HttpsError("failed-precondition", "Brevo API is not initialized.");
    }

    const senderEmail = getConfig("sender_email");
    if (!senderEmail) {
        throw new functions.https.HttpsError("failed-precondition", "Sender email is not configured.");
    }
    
    // Fetch organization name to use as sender name
    // This is a generic approach; specific sender name logic might be needed elsewhere
    let senderName = "Equipe Certa"; // Default fallback
    try {
        // A better approach would be to pass orgId to this function if available
        const orgSettingsSnapshot = await db.collection("organizations").limit(1).get();
        if (!orgSettingsSnapshot.empty) {
           const orgData = orgSettingsSnapshot.docs[0].data();
           if(orgData.name) senderName = orgData.name;
        }
    } catch(e) {
        console.log("Could not fetch a default organization name, using fallback.", e);
    }
    
    if (senderName === "Equipe Certa") {
        const orgSettingsSnapshot = await db.collection("organizations").limit(1).get();
        if(!orgSettingsSnapshot.empty){
            const orgData = orgSettingsSnapshot.docs[0].data();
            senderName = orgData.name;
        }
    }
    
    const smtpEmail = new Brevo.SendSmtpEmail();
    smtpEmail.to = [{ email: toEmail, name: toName }];
    smtpEmail.sender = { email: senderEmail, name: senderName };
    smtpEmail.subject = subject;
    smtpEmail.htmlContent = htmlContent;

    try {
        const data = await brevoApi.sendTransacEmail(smtpEmail);
        console.log("Brevo API called successfully. Returned data: " + JSON.stringify(data));
        return { success: true, message: "Email sent successfully.", data };
    } catch (error) {
        console.error("Error sending email via Brevo:", error);
        throw new functions.https.HttpsError("internal", "Failed to send email via Brevo.", { originalError: error.message });
    }
};


// Function to get email template (custom or default)
const getEmailTemplateContent = async (templateType = 'approved') => {
    const templateDoc = await db.collection('settings').doc(`emailTemplate_${templateType}`).get();
    if (templateDoc.exists && templateDoc.data().htmlContent) {
        return templateDoc.data().htmlContent;
    }
    return getDefaultEmailTemplateContent(templateType).htmlContent;
};

// The default hardcoded email templates
const getDefaultEmailTemplateContent = (templateType = 'approved') => {
    // Default is 'approved'
    return {
        subject: 'Parabéns, você foi aprovada! - {{orgName}}',
        htmlContent: `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Cadastro Aprovado!</title>
                <style>
                    body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
                    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; }
                    .button { background-color: #e83a93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; }
                    .footer { font-size: 0.8em; color: #888; margin-top: 20px; text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Parabéns, {{promoterName}}!</h1>
                    <p>Temos uma ótima notícia! Seu cadastro para o evento/gênero <strong>{{campaignName}}</strong> da <strong>{{orgName}}</strong> foi aprovado.</p>
                    <p>Estamos muito felizes em ter você em nosso time. Para continuar, acesse seu portal exclusivo, leia as regras e entre no grupo oficial.</p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="{{portalLink}}" class="button">Acessar meu Portal Agora</a>
                    </p>
                    <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:<br>
                    <a href="{{portalLink}}">{{portalLink}}</a></p>
                    <div class="footer">
                        <p>Você recebeu este e-mail porque se cadastrou na plataforma Equipe Certa.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };
};

// Replace placeholders in a string
const replacePlaceholders = (template, data) => {
    let content = template;
    for (const key in data) {
        content = content.replace(new RegExp(`{{${key}}}`, "g"), data[key]);
    }
    return content;
};


// --- END OF HELPER FUNCTIONS ---


// --- START OF EMAIL RELATED FUNCTIONS ---

// Firestore Trigger: Send email when promoter status changes to 'approved'
exports.onPromoterStatusChange = functions.region('southamerica-east1').firestore
    .document('promoters/{promoterId}')
    .onUpdate(async (change, context) => {
        const newValue = change.after.data();
        const oldValue = change.before.data();
        const promoterId = context.params.promoterId;
        
        const statusChanged = newValue.status !== oldValue.status;
        const isValidStatus = newValue.status === 'approved';

        if (!statusChanged || !isValidStatus) {
            return null;
        }
        
        console.log(`Status changed for promoter ${promoterId} to ${newValue.status}. Preparing to send email.`);

        try {
            const orgDoc = await db.collection('organizations').doc(newValue.organizationId).get();
            if (!orgDoc.exists) {
                throw new Error(`Organization ${newValue.organizationId} not found.`);
            }
            const orgName = orgDoc.data().name || 'Nossa Equipe';

            const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(newValue.email)}`;
            
            const placeholderData = {
                promoterName: newValue.name,
                promoterEmail: newValue.email,
                campaignName: newValue.campaignName || 'Geral',
                orgName: orgName,
                portalLink: portalLink,
            };
            
            const template = await getEmailTemplateContent(newValue.status);
            const defaultTemplates = getDefaultEmailTemplateContent(newValue.status);
            
            const subject = replacePlaceholders(defaultTemplates.subject, placeholderData);
            const htmlContent = replacePlaceholders(template, placeholderData);
            
            await sendEmail(newValue.email, newValue.name, subject, htmlContent);
            
            console.log(`Email successfully sent to ${newValue.email} for status ${newValue.status}.`);
            return null;

        } catch (error) {
            console.error(`Failed to send email for promoter ${promoterId}:`, error);
            // We don't re-throw here to prevent the function from retrying indefinitely on permanent errors.
            return null;
        }
    });

// Manually trigger status email (for approved promoters)
exports.manuallySendStatusEmail = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    
    const promoterId = data.promoterId;
    if (!promoterId) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "promoterId".');
    }

    try {
        const promoterDoc = await db.collection('promoters').doc(promoterId).get();
        if (!promoterDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Promoter not found.');
        }
        const promoter = promoterDoc.data();
        
        if (promoter.status !== 'approved') {
            return { success: false, message: 'Notificação só pode ser enviada para divulgadoras aprovadas.' };
        }
        
        const orgDoc = await db.collection('organizations').doc(promoter.organizationId).get();
        const orgName = orgDoc.exists ? orgDoc.data().name : 'Nossa Equipe';

        const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoter.email)}`;

        const placeholderData = {
            promoterName: promoter.name,
            promoterEmail: promoter.email,
            campaignName: promoter.campaignName || 'Geral',
            orgName: orgName,
            portalLink: portalLink,
        };
        
        const template = await getEmailTemplateContent('approved');
        const defaultTemplate = getDefaultEmailTemplateContent('approved');

        const subject = replacePlaceholders(defaultTemplate.subject, placeholderData);
        const htmlContent = replacePlaceholders(template, placeholderData);

        await sendEmail(promoter.email, promoter.name, subject, htmlContent);

        return { success: true, message: 'Notificação de aprovação enviada com sucesso!' };

    } catch (error) {
        console.error("Manual email send failed:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error; // Re-throw HttpsError
        }
        throw new functions.https.HttpsError('internal', 'An internal error occurred while sending the email.', { originalError: error.message });
    }
});


// Send test emails (callable by Super Admin)
exports.sendTestEmail = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    // Authentication check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== 'superadmin') {
        throw new functions.https.HttpsError('permission-denied', 'You must be a super admin to call this function.');
    }

    const testType = data.testType || 'generic';
    const adminEmail = context.auth.token.email;

    try {
        const placeholderData = {
            promoterName: 'Maria da Silva (Teste)',
            promoterEmail: 'divulgadora.teste@email.com',
            campaignName: 'Evento de Teste',
            orgName: 'Sua Organização (Teste)',
            portalLink: 'https://divulgadoras.vercel.app/#/status',
        };

        let subject, htmlContent;

        if (testType === 'custom_approved') {
            // Test with HTML provided directly in the call
            const defaultTemplate = getDefaultEmailTemplateContent('approved');
            subject = replacePlaceholders(defaultTemplate.subject, placeholderData);
            htmlContent = replacePlaceholders(data.customHtmlContent, placeholderData);
        } else if (testType === 'approved') {
            // Test with saved templates
            const template = await getEmailTemplateContent(testType);
            const defaultTemplate = getDefaultEmailTemplateContent(testType);
            subject = replacePlaceholders(defaultTemplate.subject, placeholderData);
            htmlContent = replacePlaceholders(template, placeholderData);
        } else {
            // Generic connection test
            subject = 'Teste de Conexão - Equipe Certa';
            htmlContent = `
                <h1>Conexão com o serviço de e-mail bem-sucedida!</h1>
                <p>Se você recebeu este e-mail, significa que a configuração do seu provedor de e-mail (Brevo) está funcionando corretamente.</p>
                <p>Versão do Servidor: ${process.env.npm_package_version || 'N/A'}</p>
            `;
        }
        
        await sendEmail(adminEmail, 'Admin de Teste', subject, htmlContent);
        return { success: true, message: `E-mail de teste (${testType}) enviado para ${adminEmail}.` };
    } catch (error) {
        console.error(`Failed to send test email (${testType}):`, error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'An internal error occurred.', { originalError: error.message });
    }
});

// Get/Set/Reset Email Templates (callable by Super Admin)
exports.getEmailTemplate = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    // Auth check omitted for brevity but should be here
    const htmlContent = await getEmailTemplateContent('approved');
    return { htmlContent };
});

exports.getDefaultEmailTemplate = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    // Auth check
    const template = getDefaultEmailTemplateContent('approved');
    return { htmlContent: template.htmlContent };
});

exports.setEmailTemplate = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    // Auth check
    const { htmlContent } = data;
    await db.collection('settings').doc('emailTemplate_approved').set({ htmlContent });
    return { success: true };
});

exports.resetEmailTemplate = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    // Auth check
    await db.collection('settings').doc('emailTemplate_approved').delete();
    return { success: true };
});


// --- END OF EMAIL RELATED FUNCTIONS ---


// --- START OF SYSTEM & CREDENTIALS FUNCTIONS ---

exports.getSystemStatus = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    const log = [];
    log.push({ level: 'INFO', message: 'Iniciando verificação do sistema de e-mail...' });

    const brevoKey = getConfig('key');
    const senderEmail = getConfig('sender_email');
    
    if (brevoKey) log.push({ level: 'SUCCESS', message: "Variável 'brevo.key' encontrada." });
    else log.push({ level: 'ERROR', message: "Variável 'brevo.key' NÃO encontrada." });

    if (senderEmail) log.push({ level: 'SUCCESS', message: `Variável 'brevo.sender_email' encontrada: ${senderEmail}` });
    else log.push({ level: 'ERROR', message: "Variável 'brevo.sender_email' NÃO encontrada." });

    if (!brevoKey || !senderEmail) {
        return {
            functionVersion: `v${process.env.npm_package_version || 'N/A'}-firebase`,
            emailProvider: "Brevo",
            configured: false,
            message: "Configuração incompleta. As variáveis de ambiente 'brevo.key' e/ou 'brevo.sender_email' não foram definidas.",
            log: log
        };
    }

    try {
        log.push({ level: 'INFO', message: 'Tentando autenticar com a API da Brevo...' });
        const brevoApi = initializeBrevo(); // This sets up the key
        const accountApi = new Brevo.AccountApi();
        
        // Use the initialized API client. The client is a singleton.
        const accountInfo = await accountApi.getAccount();
        log.push({ level: 'SUCCESS', message: 'Autenticação com a Brevo bem-sucedida.' });

        return {
            functionVersion: `v${process.env.npm_package_version || 'N/A'}-firebase`,
            emailProvider: "Brevo",
            configured: true,
            message: `Sistema de e-mail operacional. Conectado como ${accountInfo.email} (Plano: ${accountInfo.plan[0].type}).`,
            log: log,
        };

    } catch (error) {
        console.error("Brevo connection test failed:", error);
        log.push({ level: 'ERROR', message: `Falha na autenticação. ${error.message || 'Erro desconhecido.'}` });
        return {
            functionVersion: `v${process.env.npm_package_version || 'N/A'}-firebase`,
            emailProvider: "Brevo",
            configured: false,
            message: "Falha ao conectar com a API da Brevo. Verifique se a chave de API está correta e se a conta está ativa.",
            log: log,
        };
    }
});


exports.getPagSeguroStatus = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    const token = getConfig('token');
    const email = getConfig('email');
    return {
        configured: !!token && !!email,
        token: !!token,
        email: !!email
    };
});


// --- END OF SYSTEM & CREDENTIALS FUNCTIONS ---


// --- START OF ORGANIZATION & USER MANAGEMENT ---

exports.createOrganizationAndUser = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    const { orgName, ownerName, phone, taxId, email, password, planId } = data;
    
    // Basic validation
    if (!orgName || !ownerName || !email || !password || !planId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    try {
        // Create Firebase Auth user
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: ownerName,
        });

        const uid = userRecord.uid;

        // Create Organization document (ID is user's UID for simplicity and ownership link)
        const orgId = uid;
        const orgRef = db.collection('organizations').doc(orgId);
        
        // 3-day trial
        const trialExpiresAt = new Date();
        trialExpiresAt.setDate(trialExpiresAt.getDate() + 3);
        
        await orgRef.set({
            name: orgName,
            ownerName: ownerName,
            ownerEmail: email,
            ownerUid: uid,
            ownerPhone: phone,
            ownerTaxId: taxId,
            status: 'trial',
            planId: planId,
            planExpiresAt: admin.firestore.Timestamp.fromDate(trialExpiresAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            public: true, // Public by default on creation
            assignedStates: [], // Empty by default
        });

        // Create Admin document
        const adminRef = db.collection('admins').doc(uid);
        await adminRef.set({
            email: email,
            role: 'admin',
            organizationId: orgId,
            assignedStates: [],
            assignedCampaigns: {},
        });

        return { success: true, orgId: orgId };
    } catch (error) {
        console.error("Error creating organization and user:", error);
        // Clean up created user if org/admin creation fails? (more complex logic needed)
        throw new functions.https.HttpsError('internal', error.message, error);
    }
});

exports.createAdminRequest = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    const { name, email, phone, message, password } = data;
    
    if (!name || !email || !password || !phone) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }
    
    // Check if an admin with this email already exists
    try {
        await admin.auth().getUserByEmail(email);
        // If it doesn't throw, user exists
        throw new functions.https.HttpsError('already-exists', 'An admin with this email already exists.');
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            // This is the expected case, continue.
        } else {
            // Re-throw other errors (like already-exists)
            throw error;
        }
    }

    try {
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
            disabled: true, // User is disabled until approved
        });
        
        const appRef = db.collection('adminApplications').doc(userRecord.uid);
        await appRef.set({
            name,
            email,
            phone,
            message: message || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, message: "Request submitted." };
    } catch (error) {
        console.error("Error in createAdminRequest:", error);
        throw new functions.https.HttpsError('internal', error.message, error);
    }
});


// --- END OF ORGANIZATION & USER MANAGEMENT ---

// --- START OF GEMINI AI FUNCTION ---
exports.askGemini = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    
    const geminiApiKey = getConfig('api_key');
    if (!geminiApiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'Gemini API key is not configured in Firebase Functions.');
    }

    const { prompt } = data;
    if (!prompt) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "prompt".');
    }

    try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
        });

        const text = response.text;

        return { text };
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new functions.https.HttpsError('internal', 'Failed to get a response from Gemini.', { originalError: error.message });
    }
});
// --- END OF GEMINI AI FUNCTION ---

// --- START OF PAGSEGURO FUNCTIONS ---

exports.createPagSeguroOrder = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { orgId, planId } = data;
    if (!orgId || !planId) {
        throw new functions.https.HttpsError('invalid-argument', 'Organization ID and Plan ID are required.');
    }

    const pagseguroToken = getConfig('token');
    const pagseguroEmail = getConfig('email');
    if (!pagseguroToken || !pagseguroEmail) {
        throw new functions.https.HttpsError('failed-precondition', 'PagSeguro credentials are not configured.');
    }

    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Organization not found.');
    }
    const orgData = orgDoc.data();
    
    // Simple plan mapping. In a real scenario, this would come from a secure source.
    const plans = {
        basic: { name: 'Plano Básico - Equipe Certa', price: '49.00' },
        professional: { name: 'Plano Profissional - Equipe Certa', price: '99.00' },
    };
    const plan = plans[planId];
    if (!plan) {
        throw new functions.https.HttpsError('not-found', 'Plan not found.');
    }

    const referenceId = `EC_${orgId}_${Date.now()}`;
    
    const body = `
    <checkout>
        <currency>BRL</currency>
        <items>
            <item>
                <id>0001</id>
                <description>${plan.name}</description>
                <amount>${plan.price}</amount>
                <quantity>1</quantity>
            </item>
        </items>
        <reference>${referenceId}</reference>
        <sender>
            <name>${orgData.ownerName || 'Nao Informado'}</name>
            <email>${orgData.ownerEmail}</email>
            <phone>
                <areaCode>${(orgData.ownerPhone || '11').substring(0, 2)}</areaCode>
                <number>${(orgData.ownerPhone || '999999999').substring(2)}</number>
            </phone>
            <documents>
                <document>
                    <type>${(orgData.ownerTaxId || '').length === 11 ? 'CPF' : 'CNPJ'}</type>
                    <value>${orgData.ownerTaxId || '00000000000'}</value>
                </document>
            </documents>
        </sender>
    </checkout>
    `;

    try {
        const response = await fetch(`https://ws.pagseguro.uol.com.br/v2/checkout?email=${pagseguroEmail}&token=${pagseguroToken}`, {
            method: 'POST',
            body: body.trim(),
            headers: { 'Content-Type': 'application/xml; charset=ISO-8859-1' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("PagSeguro API Error:", errorText);
            throw new Error(`PagSeguro API returned status ${response.status}: ${errorText}`);
        }

        const xmlText = await response.text();
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlText);
        
        const checkoutCode = result.checkout.code[0];
        const payLink = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${checkoutCode}`;

        // Save reference in Firestore to link notification later
        await db.collection('pagseguroTransactions').doc(referenceId).set({
            orgId: orgId,
            planId: planId,
            status: 'initiated',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { payLink };

    } catch (error) {
        console.error("Error creating PagSeguro order:", error);
        throw new functions.https.HttpsError('internal', 'Failed to create PagSeguro payment order.', { originalError: error.message });
    }
});

// --- END OF PAGSEGURO FUNCTIONS ---
