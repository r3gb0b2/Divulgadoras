// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Brevo (for emails)
const brevo = require("@getbrevo/brevo");

// Stripe (for payments)
// Stripe is initialized inside the functions that need it.

// Google Gemini AI (for AI assistant)
const { GoogleGenerativeAI } = require("@google/genai");


// --- UTILITY FUNCTIONS ---

/**
 * Validates if the user making the call is an admin or superadmin.
 * Throws an error if not authorized.
 * @param {object} context - The function context.
 * @returns {Promise<object>} The user's custom claims (auth record).
 */
const checkAdmin = async (context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "A solicitação deve ser autenticada.",
    );
  }
  const user = await auth.getUser(context.auth.uid);
  const role = user.customClaims?.role;
  if (role !== "admin" && role !== "superadmin" && role !== "poster") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "O usuário não tem permissão para realizar esta ação.",
    );
  }
  return user;
};

/**
 * Validates if the user making the call is a superadmin.
 * Throws an error if not authorized.
 * @param {object} context - The function context.
 */
const checkSuperAdmin = async (context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "A solicitação deve ser autenticada.",
    );
  }
  const user = await auth.getUser(context.auth.uid);
  if (user.customClaims?.role !== "superadmin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Apenas Super Admins podem realizar esta ação.",
    );
  }
};

let isBrevoInitialized = false;
/**
 * Initializes the Brevo API client if it hasn't been already.
 * This lazy initialization prevents errors on function startup.
 */
const initializeBrevo = () => {
    if (isBrevoInitialized) return;

    const brevoConfig = functions.config().brevo;
    if (brevoConfig && brevoConfig.key) {
        const defaultClient = brevo.ApiClient.instance;
        const apiKey = defaultClient.authentications["api-key"];
        apiKey.apiKey = brevoConfig.key;
        isBrevoInitialized = true;
    } else {
        console.warn("Brevo API key not configured. Email functions will fail.");
    }
};


/**
 * Sends a transactional email using the Brevo API.
 * @param {string} toEmail - The recipient's email.
 * @param {string} toName - The recipient's name.
 * @param {string} subject - The email subject.
 * @param {string} htmlContent - The HTML content of the email.
 * @returns {Promise<object>} The Brevo API response.
 */
const sendEmail = async (toEmail, toName, subject, htmlContent) => {
  initializeBrevo();
  const brevoConfig = functions.config().brevo;
  const senderEmail = brevoConfig.sender_email;

  if (!senderEmail) {
    throw new Error("O e-mail do remetente não está configurado.");
  }

  const apiInstance = new brevo.TransactionalEmailsApi();
  const sendSmtpEmail = new brevo.SendSmtpEmail();

  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = { name: "Equipe Certa", email: senderEmail };
  sendSmtpEmail.to = [{ email: toEmail, name: toName }];

  return apiInstance.sendTransacEmail(sendSmtpEmail);
};


// --- EMAIL TEMPLATES ---

const DEFAULT_APPROVED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f4f4f4; color: #333; }
    .container { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #fff; border-radius: 8px; }
    .header { color: #e83a93; font-size: 24px; font-weight: bold; text-align: center; }
    .content { margin-top: 20px; line-height: 1.6; }
    .button { display: inline-block; padding: 12px 24px; margin: 20px 0; background-color: #e83a93; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; }
    .footer { margin-top: 20px; font-size: 12px; color: #777; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">Parabéns, {{promoterName}}!</div>
    <div class="content">
      <p>Temos o prazer de informar que seu cadastro foi <strong>APROVADO</strong> para o evento <strong>{{campaignName}}</strong> na organização <strong>{{orgName}}</strong>!</p>
      <p>Para continuar, acesse seu portal exclusivo clicando no botão abaixo. Lá você encontrará as regras do evento e o link para o grupo do WhatsApp.</p>
      <div style="text-align: center;">
        <a href="{{portalLink}}" class="button">Acessar Portal da Divulgadora</a>
      </div>
      <p>Seja bem-vindo(a) à equipe!</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Equipe Certa. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
`;


// --- DATABASE TRIGGERS ---

/**
 * Firestore trigger that runs when a promoter's status is updated.
 * It sends an email notification if the status changes to 'approved'.
 */
exports.onPromoterStatusChange = functions.firestore
  .document("promoters/{promoterId}")
  .onUpdate(async (change, context) => {
    const newValue = change.after.data();
    const oldValue = change.before.data();

    // If status didn't change, do nothing.
    if (newValue.status === oldValue.status) {
      return null;
    }

    // Send email on approval
    if (newValue.status === "approved") {
      try {
        const orgDoc = await db.collection("organizations").doc(newValue.organizationId).get();
        if (!orgDoc.exists) {
            console.error(`Organization ${newValue.organizationId} not found for promoter ${context.params.promoterId}`);
            return null;
        }
        const orgName = orgDoc.data().name || 'Nossa Equipe';

        // Fetch custom template or use default
        const templateDoc = await db.collection("settings").doc("emailTemplate_approved").get();
        let htmlTemplate = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE;
        
        // Dynamic link to status check page
        const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(newValue.email)}`;

        // Replace placeholders
        let htmlContent = htmlTemplate
            .replace(/{{promoterName}}/g, newValue.name)
            .replace(/{{promoterEmail}}/g, newValue.email)
            .replace(/{{campaignName}}/g, newValue.campaignName || "nosso time")
            .replace(/{{orgName}}/g, orgName)
            .replace(/{{portalLink}}/g, portalLink);

        await sendEmail(
          newValue.email,
          newValue.name,
          `✅ Cadastro Aprovado - ${newValue.campaignName || orgName}`,
          htmlContent,
        );
        console.log(`Approval email sent to ${newValue.email}`);
      } catch (error) {
        console.error("Failed to send approval email:", error);
      }
    }
    return null;
  });


// --- CALLABLE FUNCTIONS (ADMIN ACTIONS) ---

/**
 * Creates a Firebase Auth user and a corresponding application document in Firestore.
 * This function should be called by an unauthenticated user submitting a request.
 */
exports.createAdminRequest = functions.https.onCall(async (data, context) => {
    const { email, password, name, phone, message } = data;

    if (!email || !password || !name || !phone) {
        throw new functions.https.HttpsError("invalid-argument", "Todos os campos obrigatórios devem ser preenchidos.");
    }
    if (password.length < 6) {
        throw new functions.https.HttpsError("invalid-argument", "A senha deve ter pelo menos 6 caracteres.");
    }

    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: name,
            disabled: true, // User is disabled until approved by a superadmin
        });
        
        await db.collection("adminApplications").doc(userRecord.uid).set({
            name: name,
            email: email,
            phone: phone,
            message: message || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        return { success: true, message: "Solicitação enviada com sucesso." };
    } catch (error) {
        console.error("Error creating admin request:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError("already-exists", "Este e-mail já está em uso na plataforma.");
        }
        throw new functions.https.HttpsError("internal", "Não foi possível criar a solicitação.");
    }
});

/**
 * Manually triggers the status email for a promoter.
 * Useful if the automatic trigger failed or needs to be resent.
 */
exports.manuallySendStatusEmail = functions.https.onCall(async (data, context) => {
    await checkAdmin(context); // Ensure only admins can call this

    const { promoterId } = data;
    if (!promoterId) {
        throw new functions.https.HttpsError("invalid-argument", "O ID da divulgadora é obrigatório.");
    }
    
    try {
        const promoterDoc = await db.collection("promoters").doc(promoterId).get();
        if (!promoterDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        }
        const promoter = promoterDoc.data();
        
        if (promoter.status !== "approved") {
            throw new functions.https.HttpsError("failed-precondition", "Apenas divulgadoras com status 'Aprovado' podem ser notificadas manualmente.");
        }

        const orgDoc = await db.collection("organizations").doc(promoter.organizationId).get();
        const orgName = orgDoc.exists ? orgDoc.data().name : 'Nossa Equipe';

        const templateDoc = await db.collection("settings").doc("emailTemplate_approved").get();
        let htmlTemplate = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE;

        const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoter.email)}`;

        let htmlContent = htmlTemplate
            .replace(/{{promoterName}}/g, promoter.name)
            .replace(/{{promoterEmail}}/g, promoter.email)
            .replace(/{{campaignName}}/g, promoter.campaignName || "nosso time")
            .replace(/{{orgName}}/g, orgName)
            .replace(/{{portalLink}}/g, portalLink);
            
        await sendEmail(
            promoter.email,
            promoter.name,
            `✅ Cadastro Aprovado - ${promoter.campaignName || orgName}`,
            htmlContent,
        );

        return { success: true, message: "Notificação enviada com sucesso!" };

    } catch (error) {
        console.error("Failed to manually send notification:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", error.message);
    }
});


// --- SYSTEM DIAGNOSTIC FUNCTIONS ---

/**
 * Checks the system's configuration status, especially for email sending.
 * Only callable by a superadmin.
 */
exports.getSystemStatus = functions.https.onCall(async (data, context) => {
    await checkSuperAdmin(context);

    let log = [];
    const brevoConfig = functions.config().brevo || {};
    const functionVersion = process.env.K_REVISION || 'indefinido';
    log.push({ level: 'INFO', message: `Versão da função: ${functionVersion}` });
    
    if (!brevoConfig.key || !brevoConfig.sender_email) {
        log.push({ level: 'ERROR', message: "A chave da API Brevo (brevo.key) ou o e-mail do remetente (brevo.sender_email) não estão configurados." });
        return {
            functionVersion,
            emailProvider: "Brevo (v9.2)",
            configured: false,
            message: "O sistema de envio de e-mails não está configurado. As notificações automáticas não funcionarão.",
            log: log
        };
    }
    
    log.push({ level: 'SUCCESS', message: "Configurações de ambiente para Brevo encontradas." });

    return {
        functionVersion,
        emailProvider: "Brevo (v9.2)",
        configured: true,
        message: "O sistema de e-mail parece estar configurado corretamente.",
        log: log,
    };
});

/**
 * Sends a test email to the superadmin who called the function.
 * Allows for testing different email scenarios.
 */
exports.sendTestEmail = functions.https.onCall(async (data, context) => {
    const user = await checkAdmin(context); // Allow admins to test email too
    const superAdminEmail = user.email;
    const superAdminName = user.displayName || 'Admin Teste';

    const { testType, customHtmlContent } = data;

    try {
        let subject = "";
        let htmlContent = "";

        if (testType === 'generic') {
            subject = "Teste de Conexão - Equipe Certa";
            htmlContent = `<p>Olá, ${superAdminName}. Se você recebeu este e-mail, a conexão com o provedor de e-mail está funcionando corretamente.</p>`;
        } else if (testType === 'approved' || testType === 'custom_approved') {
            const orgName = "Sua Organização (Teste)";
            const campaignName = "Evento de Teste";
            const promoterName = "Divulgadora de Teste";
            const portalLink = "https://divulgadoras.vercel.app/#/status?email=teste@exemplo.com";

            subject = `[TESTE] Cadastro Aprovado - ${campaignName}`;
            
            if (testType === 'custom_approved' && customHtmlContent) {
                 htmlContent = customHtmlContent;
            } else {
                const templateDoc = await db.collection("settings").doc("emailTemplate_approved").get();
                htmlContent = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE;
            }

            htmlContent = htmlContent
                .replace(/{{promoterName}}/g, promoterName)
                .replace(/{{campaignName}}/g, campaignName)
                .replace(/{{orgName}}/g, orgName)
                .replace(/{{portalLink}}/g, portalLink);
        } else {
            throw new functions.https.HttpsError("invalid-argument", "Tipo de teste inválido.");
        }

        await sendEmail(superAdminEmail, superAdminName, subject, htmlContent);

        return { success: true, message: `E-mail de teste '${testType}' enviado para ${superAdminEmail}.` };
    } catch (error) {
        console.error(`Failed to send test email type ${testType}:`, error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});


// --- ORGANIZATION & SUBSCRIPTION MANAGEMENT ---

/**
 * Creates a new organization, a corresponding owner admin user, and sets up a trial period.
 */
exports.createOrganizationAndUser = functions.https.onCall(async (data, context) => {
    const { orgName, ownerName, phone, taxId, email, password, planId } = data;

    if (!orgName || !ownerName || !email || !password || !planId) {
        throw new functions.https.HttpsError("invalid-argument", "Todos os campos devem ser preenchidos.");
    }
    
    // Create the user in Firebase Auth
    let userRecord;
    try {
        userRecord = await auth.createUser({ email, password, displayName: ownerName });
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError("already-exists", "Este e-mail já está em uso.");
        }
        throw new functions.https.HttpsError("internal", "Falha ao criar o usuário.");
    }

    const trialDays = 3;
    const now = new Date();
    const expiryDate = new Date(now.setDate(now.getDate() + trialDays));

    const newOrg = {
        name: orgName,
        ownerName,
        ownerEmail: email,
        ownerUid: userRecord.uid,
        ownerPhone: phone,
        ownerTaxId: taxId,
        status: "trial",
        planId,
        planExpiresAt: admin.firestore.Timestamp.fromDate(expiryDate),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        public: false, // Default to private
        assignedStates: [],
    };
    
    // Create the organization document
    const orgRef = db.collection("organizations").doc(); // Auto-generate ID
    await orgRef.set(newOrg);

    // Create the admin document and set custom claims
    const adminDoc = {
        email: email,
        role: "admin",
        organizationId: orgRef.id,
        assignedStates: [],
        assignedCampaigns: {},
    };
    await db.collection("admins").doc(userRecord.uid).set(adminDoc);
    await auth.setCustomUserClaims(userRecord.uid, { role: "admin", organizationId: orgRef.id });

    return { success: true, orgId: orgRef.id };
});


// --- AI (GEMINI) FUNCTIONS ---

/**
 * A callable function to proxy requests to the Google Gemini AI.
 * Requires the Gemini API key to be set in Firebase config.
 */
exports.askGemini = functions.https.onCall(async (data, context) => {
    await checkAdmin(context);
    
    const { prompt } = data;
    if (!prompt) {
        throw new functions.https.HttpsError("invalid-argument", "O prompt não pode estar vazio.");
    }
    
    try {
        const geminiApiKey = functions.config().gemini.api_key;
        if (!geminiApiKey) {
            throw new functions.https.HttpsError("failed-precondition", "A chave de API para o Gemini não está configurada no servidor.");
        }
        
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return { text };
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new functions.https.HttpsError("internal", "Falha ao comunicar com a API do Gemini.");
    }
});


// --- EMAIL TEMPLATE MANAGEMENT ---

exports.getEmailTemplate = functions.https.onCall(async (data, context) => {
    await checkSuperAdmin(context);
    const docRef = db.collection("settings").doc("emailTemplate_approved");
    const doc = await doc.get();
    if (doc.exists) {
        return { htmlContent: doc.data().htmlContent };
    }
    return { htmlContent: DEFAULT_APPROVED_TEMPLATE };
});

exports.getDefaultEmailTemplate = functions.https.onCall(async(data, context) => {
    await checkSuperAdmin(context);
    return { htmlContent: DEFAULT_APPROVED_TEMPLATE };
});

exports.setEmailTemplate = functions.https.onCall(async (data, context) => {
    await checkSuperAdmin(context);
    const { htmlContent } = data;
    if (typeof htmlContent !== 'string') {
        throw new functions.https.HttpsError("invalid-argument", "O conteúdo do template deve ser uma string.");
    }
    await db.collection("settings").doc("emailTemplate_approved").set({ htmlContent });
    return { success: true };
});

exports.resetEmailTemplate = functions.https.onCall(async (data, context) => {
    await checkSuperAdmin(context);
    await db.collection("settings").doc("emailTemplate_approved").delete();
    return { success: true };
});

// --- POSTS MANAGEMENT ---

exports.createPostAndNotify = functions.https.onCall(async (data, context) => {
    await checkAdmin(context);
    const { postData, assignedPromoters } = data;

    if (!postData || !assignedPromoters || assignedPromoters.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados da publicação ou divulgadoras inválidos.");
    }

    const batch = db.batch();

    // 1. Create the main Post document
    const postRef = db.collection('posts').doc();
    batch.set(postRef, { ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    // 2. Create denormalized PostAssignment documents
    const denormalizedPost = {
        type: postData.type,
        mediaUrl: postData.mediaUrl || null,
        textContent: postData.textContent || null,
        instructions: postData.instructions,
        campaignName: postData.campaignName,
        isActive: postData.isActive,
        expiresAt: postData.expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    for (const promoter of assignedPromoters) {
        const assignmentRef = db.collection('postAssignments').doc();
        batch.set(assignmentRef, {
            postId: postRef.id,
            post: denormalizedPost,
            organizationId: postData.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: 'pending',
            confirmedAt: null,
            proofImageUrls: [],
            proofSubmittedAt: null,
        });
    }

    await batch.commit();

    // 3. Send emails (after batch commit)
    const portalLink = "https://divulgadoras.vercel.app/#/posts";
    const subject = `Nova Publicação: ${postData.campaignName}`;
    const htmlContent = `
        <p>Olá {{promoterName}},</p>
        <p>Uma nova publicação para o evento <strong>${postData.campaignName}</strong> foi designada para você.</p>
        <p>Acesse o portal de divulgadoras para ver os detalhes e confirmar a postagem.</p>
        <a href="${portalLink}">Ver Minhas Publicações</a>
    `;

    // We do this 'serially' to avoid hitting email sending limits too quickly.
    // For a large number of promoters, a more robust queueing system would be better.
    for (const promoter of assignedPromoters) {
        try {
            const personalizedHtml = htmlContent.replace('{{promoterName}}', promoter.name);
            await sendEmail(promoter.email, promoter.name, subject, personalizedHtml);
        } catch (emailError) {
            console.error(`Failed to send post notification to ${promoter.email}:`, emailError);
            // Continue to the next promoter even if one email fails
        }
    }

    return { success: true, postId: postRef.id };
});

exports.updatePostStatus = functions.https.onCall(async (data, context) => {
    await checkAdmin(context);
    const { postId, updateData } = data;
    if (!postId || !updateData) {
        throw new functions.https.HttpsError('invalid-argument', 'ID da publicação e dados de atualização são obrigatórios.');
    }

    const batch = db.batch();
    const postRef = db.collection('posts').doc(postId);
    batch.update(postRef, updateData);
    
    // Prepare denormalized data
    const denormalizedUpdate = {};
    if (updateData.isActive !== undefined) denormalizedUpdate['post.isActive'] = updateData.isActive;
    if (updateData.expiresAt !== undefined) denormalizedUpdate['post.expiresAt'] = updateData.expiresAt;
    if (updateData.textContent !== undefined) denormalizedUpdate['post.textContent'] = updateData.textContent;
    if (updateData.mediaUrl !== undefined) denormalizedUpdate['post.mediaUrl'] = updateData.mediaUrl;
    if (updateData.instructions !== undefined) denormalizedUpdate['post.instructions'] = updateData.instructions;
    
    // If there's something to update in assignments
    if (Object.keys(denormalizedUpdate).length > 0) {
        const assignmentsQuery = db.collection('postAssignments').where('postId', '==', postId);
        const assignmentsSnapshot = await assignmentsQuery.get();
        assignmentsSnapshot.forEach(doc => {
            batch.update(doc.ref, denormalizedUpdate);
        });
    }

    await batch.commit();
    return { success: true };
});

exports.addAssignmentsToPost = functions.https.onCall(async (data, context) => {
    await checkAdmin(context);
    const { postId, promoterIds } = data;
    if (!postId || !promoterIds || !Array.isArray(promoterIds) || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "ID da publicação e lista de divulgadoras são obrigatórios.");
    }
    
    const postRef = db.collection("posts").doc(postId);
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    }
    const postData = postDoc.data();
    
    // Fetch promoter data for the emails
    const promotersRef = db.collection("promoters");
    const promotersQuery = promotersRef.where(admin.firestore.FieldPath.documentId(), 'in', promoterIds);
    const promotersSnapshot = await promotersQuery.get();
    const promoters = promotersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const batch = db.batch();
    const denormalizedPost = {
        type: postData.type,
        mediaUrl: postData.mediaUrl || null,
        textContent: postData.textContent || null,
        instructions: postData.instructions,
        campaignName: postData.campaignName,
        isActive: postData.isActive,
        expiresAt: postData.expiresAt,
        createdAt: postData.createdAt,
    };

    for (const promoter of promoters) {
        const assignmentRef = db.collection('postAssignments').doc();
        batch.set(assignmentRef, {
            postId: postId,
            post: denormalizedPost,
            organizationId: postData.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: 'pending',
            confirmedAt: null,
            proofImageUrls: [],
            proofSubmittedAt: null,
        });
    }
    await batch.commit();

    // Send emails
    const portalLink = "https://divulgadoras.vercel.app/#/posts";
    const subject = `Nova Publicação: ${postData.campaignName}`;
    const htmlContent = `
        <p>Olá {{promoterName}},</p>
        <p>Uma nova publicação para o evento <strong>${postData.campaignName}</strong> foi designada para você.</p>
        <p>Acesse o portal de divulgadoras para ver os detalhes e confirmar a postagem.</p>
        <a href="${portalLink}">Ver Minhas Publicações</a>
    `;

    for (const promoter of promoters) {
        try {
            await sendEmail(promoter.email, promoter.name, subject, htmlContent.replace('{{promoterName}}', promoter.name));
        } catch (emailError) {
            console.error(`Failed to send post notification to ${promoter.email}:`, emailError);
        }
    }
    return { success: true };
});

exports.sendPostReminder = functions.https.onCall(async (data, context) => {
    await checkAdmin(context);
    const { postId } = data;
    if (!postId) {
        throw new functions.https.HttpsError('invalid-argument', 'ID da publicação é obrigatório.');
    }

    const q = db.collection('postAssignments')
        .where('postId', '==', postId)
        .where('status', '==', 'confirmed');
    
    const snapshot = await q.get();
    
    // Filter in memory for docs where proofSubmittedAt is not set
    const pendingProofAssignments = snapshot.docs.filter(doc => !doc.data().proofSubmittedAt);

    if (pendingProofAssignments.length === 0) {
        return { count: 0, message: "Nenhuma comprovação pendente encontrada." };
    }

    const portalLink = "https://divulgadoras.vercel.app/#/posts";
    const subject = `Lembrete: Comprovação de Postagem Pendente`;
    const htmlContent = `
        <p>Olá {{promoterName}},</p>
        <p>Este é um lembrete para enviar o print de comprovação da sua publicação para o evento <strong>{{campaignName}}</strong>.</p>
        <p>Por favor, acesse o portal para enviar.</p>
        <a href="${portalLink}">Ver Minhas Publicações</a>
    `;

    let sentCount = 0;
    for (const doc of pendingProofAssignments) {
        const assignment = doc.data();
        try {
            const personalizedHtml = htmlContent
                .replace('{{promoterName}}', assignment.promoterName)
                .replace('{{campaignName}}', assignment.post.campaignName);
            await sendEmail(assignment.promoterEmail, assignment.promoterName, subject, personalizedHtml);
            sentCount++;
        } catch (emailError) {
            console.error(`Failed to send reminder to ${assignment.promoterEmail}:`, emailError);
        }
    }
    
    return { count: sentCount, message: `${sentCount} lembretes enviados com sucesso.` };
});


// --- STRIPE INTEGRATION ---

exports.getStripePublishableKey = functions.https.onCall((data, context) => {
    // No auth check needed, this key is public
    try {
        const key = functions.config().stripe.publishable_key;
        if (!key) {
            throw new Error("Publishable Key não configurada.");
        }
        return { publishableKey: key };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.createStripeCheckoutSession = functions.https.onCall(async (data, context) => {
    await checkAdmin(context); // Only admins can create a session for their org
    const { orgId, planId } = data;
    if (!orgId || !planId) {
        throw new functions.https.HttpsError("invalid-argument", "ID da organização e do plano são obrigatórios.");
    }
    
    const stripeConfig = functions.config().stripe;
    if (!stripeConfig || !stripeConfig.secret_key) {
         throw new functions.https.HttpsError("internal", "A chave secreta do Stripe não está configurada.");
    }

    const priceId = stripeConfig[`${planId}_price_id`];
    if (!priceId) {
         throw new functions.https.HttpsError("internal", `O Price ID para o plano '${planId}' não está configurado.`);
    }

    // Explicitly validate that the price ID has the correct format
    if (!priceId.startsWith("price_")) {
        const errorMessage = `Configuração inválida detectada. O ID para o plano '${planId}' é '${priceId}', mas deveria começar com 'price_'. Por favor, corrija a configuração no Firebase.`;
        console.error(errorMessage);
        throw new functions.https.HttpsError("failed-precondition", errorMessage);
    }

    try {
        const stripe = require("stripe")(stripeConfig.secret_key);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `https://divulgadoras.vercel.app/#/admin`,
            cancel_url: `https://divulgadoras.vercel.app/#/admin/settings/subscription`,
            client_reference_id: orgId, // Pass orgId to the webhook
            metadata: {
                organizationId: orgId, // Also in metadata for redundancy
                planId: planId
            }
        });
        return { sessionId: session.id };
    } catch (error) {
        console.error("Stripe session creation failed:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});


exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
    const stripeConfig = functions.config().stripe;
    if (!stripeConfig || !stripeConfig.secret_key || !stripeConfig.webhook_secret) {
        console.error("Stripe config missing.");
        return res.status(400).send("Webhook Error: Stripe configuration is missing on the server.");
    }
    const stripe = require("stripe")(stripeConfig.secret_key);
    const webhookSecret = stripeConfig.webhook_secret;
    const sig = req.headers['stripe-signature'];
    
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orgId = session.client_reference_id || session.metadata.organizationId;
        const planId = session.metadata.planId;
        
        if (!orgId) {
            console.error("Webhook Error: Missing organizationId in checkout session.");
            return res.status(400).send("Webhook Error: Missing organizationId.");
        }
        
        // Update organization status to 'active' and set new expiry date
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const newExpiryDate = new Date(subscription.current_period_end * 1000);
        
        await db.collection('organizations').doc(orgId).update({
            status: 'active',
            planId: planId, // Update planId in case they changed it
            planExpiresAt: admin.firestore.Timestamp.fromDate(newExpiryDate),
        });
        
        console.log(`Successfully activated subscription for organization ${orgId}.`);
    }
    
    res.json({received: true});
});


exports.getStripeStatus = functions.https.onCall(async (data, context) => {
    await checkSuperAdmin(context);
    const config = functions.config().stripe || {};
    return {
        configured: !!config.secret_key && !!config.publishable_key && !!config.webhook_secret && !!config.basic_price_id && !!config.professional_price_id,
        secretKey: !!config.secret_key,
        publishableKey: !!config.publishable_key,
        webhookSecret: !!config.webhook_secret,
        basicPriceId: !!config.basic_price_id,
        professionalPriceId: !!config.professional_price_id,
    };
});

exports.getEnvironmentConfig = functions.https.onCall(async (data, context) => {
    await checkSuperAdmin(context);
    // This securely returns the config as seen by the functions environment
    return {
        stripe: functions.config().stripe,
    };
});