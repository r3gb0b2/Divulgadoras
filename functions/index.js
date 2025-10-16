/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { HttpsError } = require("firebase-functions/v2/https");

// Brevo (formerly Sendinblue) SDK for sending transactional emails
const Brevo = require("@getbrevo/brevo");

// xml2js for parsing PagSeguro responses
const xml2js = require("xml2js");


// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();


// --- Brevo API Client Initialization ---
// The API key and sender email are configured in the Firebase environment.
// Use the command:
// firebase functions:config:set brevo.key="YOUR_API_KEY" brevo.sender_email="your@verified-sender.com"
const brevoConfig = functions.config().brevo;
let brevoApiInstance;
if (brevoConfig && brevoConfig.key) {
  const defaultClient = Brevo.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = brevoConfig.key;
  brevoApiInstance = new Brevo.TransactionalEmailsApi();
}

/**
 * Helper function to extract detailed error messages from the Brevo SDK.
 * @param {any} error - The error object caught from a Brevo API call.
 * @return {string} A detailed error message.
 */
const getBrevoErrorDetails = (error) => {
  let details = "An unknown Brevo API error occurred.";
  if (error.response && error.response.body) {
    try {
      // Brevo SDK might return the body as a buffer or string
      const bodyString = error.response.body.toString();
      const bodyJson = JSON.parse(bodyString);
      details = `[${bodyJson.code}] ${bodyJson.message}`;
    } catch (parseError) {
      details = `Could not parse error response. Raw: ${error.response.body.toString()}`;
    }
  } else if (error.message) {
    details = error.message;
  }
  return details;
};


// --- Firestore Triggers ---

/**
 * Triggered when a promoter's status is updated.
 * If the new status is 'approved' or 'rejected', it sends a notification email.
 */
exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();

      // Check if status has changed to 'approved' or 'rejected' from another state
      const statusChanged = newValue.status !== oldValue.status;
      const isApprovalOrRejection =
      newValue.status === "approved" || newValue.status === "rejected";

      if (statusChanged && isApprovalOrRejection) {
        try {
          await sendStatusChangeEmail(newValue);
        } catch (error) {
          console.error(`[Email Trigger] Failed to send status change email for promoter ${context.params.promoterId}:`, error);
          // We log the error but don't re-throw, as we don't want to
          // fail the entire Firestore update if the email fails.
        }
      }
    });

/**
 * Sends a status change email to a promoter.
 * @param {object} promoterData The promoter document data.
 */
async function sendStatusChangeEmail(promoterData) {
  if (!brevoApiInstance) {
    console.error("Brevo API key not configured. Cannot send email.");
    return;
  }
  if (!promoterData || !promoterData.email) {
    console.error("Promoter data or email is missing.");
    return;
  }

  // Define email parameters based on status
  const templateId = promoterData.status === "approved" ? 10 : 11;
  const subject =
    promoterData.status === "approved" ?
      "Parabéns, seu cadastro foi aprovado!" :
      "Atualização sobre seu cadastro";

  const { orgName, campaignRules, campaignLink } =
    await getOrgAndCampaignDetails(
        promoterData.organizationId,
        promoterData.state,
        promoterData.campaignName,
    );

  const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.templateId = templateId;
  sendSmtpEmail.to = [{ email: promoterData.email, name: promoterData.name }];
  sendSmtpEmail.sender = {
    name: orgName || "Equipe de Eventos",
    email: brevoConfig.sender_email,
  };
  sendSmtpEmail.params = {
    promoterName: promoterData.name,
    promoterEmail: promoterData.email,
    campaignName: promoterData.campaignName || "nosso time",
    rejectionReason: promoterData.rejectionReason || "",
    orgName: orgName || "Nossa Organização",
    campaignRules: campaignRules || "N/A",
    campaignLink: campaignLink || "#",
    portalLink: portalLink,
  };

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`Email for status '${promoterData.status}' sent to ${promoterData.email}`);
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send email to ${promoterData.email}. Details: ${detailedError}`);
    // Re-throwing allows the calling function to know about the failure.
    throw new Error(`Brevo API Error: ${detailedError}`);
  }
}

/**
 * Fetches organization and campaign details for personalizing emails.
 * @param {string} organizationId - The ID of the organization.
 * @param {string} stateAbbr - The state abbreviation for the campaign.
 * @param {string} campaignName - The name of the campaign.
 * @return {Promise<object>} An object with orgName, campaignRules, and campaignLink.
 */
async function getOrgAndCampaignDetails(organizationId, stateAbbr, campaignName) {
  let orgName = "Equipe de Eventos";
  let campaignRules = "";
  let campaignLink = "#";

  if (organizationId) {
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (orgDoc.exists) {
      orgName = orgDoc.data().name || orgName;
    }
  }

  if (stateAbbr && campaignName && organizationId) {
    const campaignsQuery = db
        .collection("campaigns")
        .where("organizationId", "==", organizationId)
        .where("stateAbbr", "==", stateAbbr)
        .where("name", "==", campaignName)
        .limit(1);

    const snapshot = await campaignsQuery.get();
    if (!snapshot.empty) {
      const campaignDoc = snapshot.docs[0].data();
      campaignRules = campaignDoc.rules || "";
      campaignLink = campaignDoc.whatsappLink || "#";
    }
  }

  return { orgName, campaignRules, campaignLink };
}


// --- Callable Functions ---

/**
 * Manually resends a status email to a promoter.
 * Called by an admin from the admin panel.
 */
exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      // 1. Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "A função deve ser chamada por um usuário autenticado.",
        );
      }

      const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
      if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Permissão negada. Apenas administradores podem executar esta ação.",
        );
      }

      // 2. Data validation
      const { promoterId } = data;
      if (!promoterId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "O ID da divulgadora (promoterId) é obrigatório.",
        );
      }

      // 3. Main logic
      try {
        const promoterDoc = await db.collection("promoters").doc(promoterId).get();
        if (!promoterDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        }

        const promoterData = promoterDoc.data();
        if (promoterData.status !== "approved" && promoterData.status !== "rejected") {
          throw new functions.https.HttpsError(
              "failed-precondition",
              `Não é possível enviar notificação para status '${promoterData.status}'. Apenas 'approved' ou 'rejected'.`,
          );
        }

        await sendStatusChangeEmail(promoterData);

        return {
          success: true,
          message: `Notificação de '${promoterData.status}' enviada para ${promoterData.email}.`,
          provider: "Brevo",
        };
      } catch (error) {
        // If the error is already an HttpsError, rethrow it.
        // Otherwise, wrap it to provide more context.
        if (error instanceof functions.https.HttpsError) {
          throw error;
        }
        console.error("Error in manuallySendStatusEmail:", error);
        throw new functions.https.HttpsError("internal", error.message, { originalError: error.message, provider: "Brevo" });
      }
    });

/**
 * Checks the configuration status of the system, primarily the email service.
 */
exports.getSystemStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Acesso não autenticado.");
  }
  const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
  if (!adminDoc.exists() || adminDoc.data().role !== "superadmin") {
    throw new HttpsError("permission-denied", "Apenas Super Admins podem ver o status do sistema.");
  }

  const status = {
    functionVersion: process.env.K_REVISION, // GCP-provided version ID
    emailProvider: "Brevo (anteriormente Sendinblue)",
    configured: false,
    message: "",
    log: [],
  };

  status.log.push({ level: "INFO", message: "Iniciando verificação do sistema..." });

  if (!brevoConfig || !brevoConfig.key || !brevoConfig.sender_email) {
    status.message = "As variáveis de ambiente para o serviço de e-mail (Brevo) não estão configuradas.";
    status.log.push({ level: "ERROR", message: "Configuração 'brevo.key' ou 'brevo.sender_email' não encontrada no Firebase." });
    return status;
  }

  status.log.push({ level: "INFO", message: "Variáveis de ambiente encontradas." });

  try {
    status.log.push({ level: "INFO", message: "Tentando autenticar com a API do Brevo..." });
    await brevoApiInstance.getAccount();
    status.configured = true;
    status.message = "A conexão com a API do Brevo foi bem-sucedida. O sistema de e-mail está operacional.";
    status.log.push({ level: "SUCCESS", message: "Autenticação com a API do Brevo bem-sucedida." });
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    status.configured = false;
    status.message = "Falha na comunicação com a API do Brevo. Verifique se a chave de API (API Key) está correta e se a conta Brevo está ativa.";
    status.log.push({ level: "ERROR", message: `A chamada para a API do Brevo falhou. Detalhes: ${detailedError}` });
  }

  return status;
});


/**
 * Sends a test email to the calling super admin.
 */
exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token.email) {
    throw new HttpsError("unauthenticated", "Acesso não autenticado.");
  }
  const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
  if (!adminDoc.exists() || adminDoc.data().role !== "superadmin") {
    throw new HttpsError("permission-denied", "Apenas Super Admins podem enviar e-mails de teste.");
  }

  if (!brevoApiInstance) {
    return { success: false, message: "A API de e-mail não está configurada no servidor." };
  }

  const { testType } = data; // 'generic' or 'approved'
  let sendSmtpEmail = new Brevo.SendSmtpEmail();
  const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(context.auth.token.email)}`;


  sendSmtpEmail.to = [{ email: context.auth.token.email, name: "Super Admin Teste" }];
  sendSmtpEmail.sender = {
    name: "Sistema Equipe Certa",
    email: brevoConfig.sender_email,
  };

  if (testType === "approved") {
    // Simulate sending a real approval email
    sendSmtpEmail.templateId = 10;
    sendSmtpEmail.params = {
      promoterName: "Super Admin Teste",
      promoterEmail: context.auth.token.email,
      campaignName: "Evento de Teste",
      orgName: "Sua Organização",
      portalLink: portalLink,
    };
  } else {
    // Send a generic connectivity test email
    sendSmtpEmail.subject = "Teste de Conexão - Equipe Certa";
    sendSmtpEmail.htmlContent = `
      <html><body>
        <h1>Olá!</h1>
        <p>Este é um e-mail de teste para verificar a conexão com o serviço de envio (${new Date().toLocaleString("pt-BR")}).</p>
        <p>Se você recebeu este e-mail, a configuração está funcionando corretamente.</p>
      </body></html>`;
  }

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, message: `E-mail de teste ('${testType}') enviado com sucesso para ${context.auth.token.email}.` };
  } catch (error) {
    const detailedError = getBrevoErrorDetails(error);
    console.error(`[Brevo API Error] Failed to send test email. Details: ${detailedError}`);
    return { success: false, message: `Falha no envio: ${detailedError}` };
  }
});


/**
 * Creates a new user in Firebase Auth and an admin application document.
 */
exports.createAdminRequest = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  const { email, password, name, phone, message } = data;

  if (!email || !password || !name || !phone) {
    throw new HttpsError("invalid-argument", "Todos os campos obrigatórios devem ser preenchidos.");
  }
  if (password.length < 6) {
    throw new HttpsError("invalid-argument", "A senha deve ter no mínimo 6 caracteres.");
  }

  try {
    // Check if an admin or application already exists for this email
    const existingAdmin = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingAdmin) {
      throw new HttpsError("already-exists", "Este e-mail já está cadastrado no sistema.");
    }

    // Create user in Firebase Auth. They won't have permissions yet.
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
    });

    // Create an application document in Firestore with the UID as the document ID
    const applicationData = {
      name,
      email,
      phone,
      message: message || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminApplications").doc(userRecord.uid).set(applicationData);

    return { success: true, message: "Solicitação enviada com sucesso." };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error("Error creating admin request:", error);
    throw new HttpsError("internal", "Ocorreu um erro interno ao processar sua solicitação.");
  }
});


/**
 * Creates a new organization and its owner/admin user.
 */
exports.createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  const {
    orgName, ownerName, phone, taxId, email, password, planId,
  } = data;

  // Basic validation
  if (!orgName || !ownerName || !email || !password || !planId) {
    throw new HttpsError("invalid-argument", "Dados insuficientes para criar a organização.");
  }

  // --- Start Firestore Transaction ---
  return db.runTransaction(async (transaction) => {
    // 1. Check if user already exists
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) {
      throw new HttpsError("already-exists", "Este e-mail já está cadastrado.");
    }

    // 2. Create the user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: ownerName,
    });

    // 3. Create the organization document
    const orgRef = db.collection("organizations").doc();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const newOrgData = {
      name: orgName,
      ownerName: ownerName,
      ownerEmail: email,
      ownerUid: userRecord.uid,
      ownerPhone: phone,
      ownerTaxId: taxId,
      status: "trial", // Start with a trial status
      planId: planId,
      planExpiresAt: admin.firestore.Timestamp.fromDate(threeDaysFromNow),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      public: true,
      assignedStates: [],
    };
    transaction.set(orgRef, newOrgData);

    // 4. Create the admin document for the user
    const adminRef = db.collection("admins").doc(userRecord.uid);
    const newAdminData = {
      email: email,
      role: "admin",
      organizationId: orgRef.id,
      assignedStates: [],
      assignedCampaigns: {},
    };
    transaction.set(adminRef, newAdminData);

    return { success: true, orgId: orgRef.id };
  }).then((result) => {
    console.log(`Successfully created org ${result.orgId} for user ${email}`);
    return result;
  }).catch((error) => {
    console.error("Transaction failed: ", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Falha na transação ao criar organização.");
  });
});


/**
 * Gemini AI assistant function
 */
const { GoogleAuth } = require("google-auth-library");
const { DiscussServiceClient } = require("@google-ai/generativelanguage");
const { defineString } = require("firebase-functions/params");

const MODEL_NAME = "models/gemini-pro";
const API_KEY = defineString("GEMINI_API_KEY");

exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Acesso não autenticado.");
  }

  const { prompt } = data;
  if (!prompt || typeof prompt !== "string") {
    throw new HttpsError("invalid-argument", "O prompt é obrigatório e deve ser um texto.");
  }

  try {
    const auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    const client = new DiscussServiceClient({
      authClient: auth,
    });

    const result = await client.generateMessage({
      model: MODEL_NAME,
      prompt: {
        messages: [{ content: prompt }],
      },
    });

    if (result && result[0] && result[0].candidates && result[0].candidates.length > 0) {
      const responseText = result[0].candidates[0].content;
      return { text: responseText };
    } else {
      throw new Error("Resposta da API do Gemini inválida ou vazia.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new HttpsError("internal", "Não foi possível comunicar com a IA do Gemini.", { originalError: error.message });
  }
});

// --- PagSeguro Integration ---
const pagseguroConfig = functions.config().pagseguro;

exports.createPagSeguroOrder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError("unauthenticated", "Não autenticado.");

  const { orgId, planId } = data;
  if (!orgId || !planId) throw new HttpsError("invalid-argument", "ID da Organização e do Plano são obrigatórios.");

  if (!pagseguroConfig || !pagseguroConfig.email || !pagseguroConfig.token) {
    throw new HttpsError("failed-precondition", "Credenciais do PagSeguro não configuradas no servidor.");
  }

  const plans = {
    "basic": { id: "basic", description: "Plano Básico - Equipe Certa", amount: "49.00" },
    "professional": { id: "professional", description: "Plano Profissional - Equipe Certa", amount: "99.00" },
  };
  const plan = plans[planId];
  if (!plan) throw new HttpsError("not-found", "Plano não encontrado.");

  const orgDoc = await db.collection("organizations").doc(orgId).get();
  if (!orgDoc.exists) throw new HttpsError("not-found", "Organização não encontrada.");
  const orgData = orgDoc.data();

  // Construct XML body for PagSeguro API
  const checkoutData = {
    checkout: {
      currency: "BRL",
      items: {
        item: {
          id: plan.id,
          description: plan.description,
          amount: plan.amount,
          quantity: "1",
        },
      },
      sender: {
        name: orgData.ownerName,
        email: orgData.ownerEmail,
        phone: {
          areaCode: orgData.ownerPhone.substring(0, 2),
          number: orgData.ownerPhone.substring(2),
        },
        documents: {
          document: {
            type: orgData.ownerTaxId.length === 11 ? "CPF" : "CNPJ",
            value: orgData.ownerTaxId,
          },
        },
      },
      redirectURL: `https://divulgadoras.vercel.app/`,
      reference: `EC_${orgId}_${Date.now()}`,
    },
  };

  const builder = new xml2js.Builder({ cdata: true, rootName: "checkout" });
  const xml = builder.buildObject(checkoutData.checkout);

  try {
    const response = await fetch(`https://ws.pagseguro.uol.com.br/v2/checkout?email=${pagseguroConfig.email}&token=${pagseguroConfig.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=ISO-8859-1" },
      body: xml,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PagSeguro API Error Response:", errorText);
      throw new Error(`Erro na API do PagSeguro: Status ${response.status}. Detalhe: ${errorText}`);
    }

    const responseText = await response.text();
    const parsedResponse = await xml2js.parseStringPromise(responseText, { explicitArray: false });
    const checkoutCode = parsedResponse.checkout.code;

    if (!checkoutCode) {
      throw new Error("Código de checkout não retornado pelo PagSeguro.");
    }
    const payLink = `https://pagseguro.uol.com.br/v2/checkout/payment.html?code=${checkoutCode}`;
    return { payLink };
  } catch (error) {
    console.error("Error creating PagSeguro order:", error);
    throw new HttpsError("internal", "Falha ao criar o pedido no PagSeguro.", { message: error.message });
  }
});


exports.getPagSeguroStatus = functions.region("southamerica-east1").https.onCall((data, context) => {
  if (!context.auth) throw new HttpsError("unauthenticated", "Não autenticado.");
  const status = {
    configured: false,
    token: false,
    email: false,
  };
  if (pagseguroConfig) {
    if (pagseguroConfig.token) status.token = true;
    if (pagseguroConfig.email) status.email = true;
    if (status.token && status.email) status.configured = true;
  }
  return status;
});
