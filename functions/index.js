/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const Brevo = require("@getbrevo/brevo");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
// IMPORTANT: This setting prevents the server from crashing if 'undefined' is passed in an update object
db.settings({ ignoreUndefinedProperties: true });

// --- Safe Initialization of Third-Party Services ---

const getConfig = () => {
    // Prevents crash if config is not set in environment
    return functions.config() || {};
};

// Brevo (formerly Sendinblue) SDK for sending transactional emails
const brevoConfig = getConfig().brevo || {};
let brevoApiInstance = null;

if (brevoConfig.key) {
  try {
      const defaultClient = Brevo.ApiClient.instance;
      const apiKey = defaultClient.authentications["api-key"];
      apiKey.apiKey = brevoConfig.key;
      brevoApiInstance = new Brevo.TransactionalEmailsApi();
  } catch (e) {
      console.warn("Failed to initialize Brevo client:", e);
  }
}

// Stripe SDK for payments
const stripeConfig = getConfig().stripe || {};
let stripe = null;
if (stripeConfig.secret_key) {
    try {
        stripe = require("stripe")(stripeConfig.secret_key);
    } catch (e) {
        console.warn("Failed to initialize Stripe client:", e);
    }
}

// Gemini
const geminiConfig = getConfig().gemini || {};

// Z-API
const zapiConfig = getConfig().zapi || {};

const getBrevoErrorDetails = (error) => {
  let details = "An unknown Brevo API error occurred.";
  if (error.response && error.response.body) {
    try {
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

// --- Safe String Helpers ---
const safeTrim = (val) => (typeof val === 'string' ? val.trim() : val);
const safeLower = (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val);

// --- Helper: Increment Email Usage ---
// Wrapped in its own try/catch to prevent blocking main flows
const incrementOrgEmailCount = async (organizationId) => {
    if (!organizationId) return;
    try {
        const orgRef = db.collection("organizations").doc(organizationId);
        await orgRef.update({
            "usageStats.emailsSent": admin.firestore.FieldValue.increment(1)
        });
    } catch (e) {
        console.warn(`[Non-Critical] Failed to increment email count for org ${organizationId}: ${e.message}`);
    }
};


// --- Email Template Management ---
const EMAIL_TEMPLATE_DOC_PATH = "settings/approvedEmailTemplate";

const DEFAULT_APPROVED_TEMPLATE_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Cadastro Aprovado!</title>
    <style>
        body { font-family: sans-serif; background-color: #f4f4f4; color: #333; }
        .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; }
        .header { background-color: #e83a93; color: #ffffff; padding: 20px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background-color: #e83a93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>Parabéns, {{promoterName}}!</h1></div>
        <div class="content">
            <p>Temos uma ótima notícia! Seu cadastro para o evento <strong>{{campaignName}}</strong> da <strong>{{orgName}}</strong> foi aprovado.</p>
            <p>Estamos muito felizes em ter você em nosso time de divulgadoras.</p>
            <p>Para continuar, acesse o seu portal exclusivo, onde você encontrará as regras do evento e o link para o grupo oficial no WhatsApp.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="{{portalLink}}" class="button">Acessar Portal da Divulgadora</a>
            </p>
            <p>Qualquer dúvida, entre em contato.</p>
            <p>Atenciosamente,<br>Equipe {{orgName}}</p>
        </div>
    </div>
</body>
</html>`;


/**
 * Helper function to create a post and its assignments within a transaction.
 * @param {object} postData - The data for the post document.
 * @param {Array<object>} assignedPromoters - Array of promoter objects to assign.
 * @param {string} createdByEmail - The email of the admin creating the post.
 * @param {string} organizationId - The ID of the organization.
 * @returns {Promise<string>} The ID of the newly created post.
 */
const createPostAndAssignmentsHelper = async (postData, assignedPromoters, createdByEmail, organizationId) => {
    if (!postData || !Array.isArray(assignedPromoters) || !createdByEmail || !organizationId) {
        throw new Error("Dados insuficientes para criar a publicação.");
    }

    const postsCollection = db.collection("posts");
    const assignmentsCollection = db.collection("postAssignments");

    return db.runTransaction(async (transaction) => {
        // 1. Create the post document to get its ID
        const postRef = postsCollection.doc();
        const finalPostData = {
            ...postData,
            organizationId: organizationId,
            createdByEmail: createdByEmail,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.set(postRef, finalPostData);

        // 2. Create assignments for each promoter
        assignedPromoters.forEach((promoter) => {
            const assignmentRef = assignmentsCollection.doc();
            const assignmentData = {
                postId: postRef.id,
                post: finalPostData, // Embed post data for denormalization
                organizationId: organizationId,
                promoterId: promoter.id,
                promoterEmail: promoter.email,
                promoterName: promoter.name,
                status: "pending",
                confirmedAt: null,
                proofImageUrls: [],
                proofSubmittedAt: null,
            };
            transaction.set(assignmentRef, assignmentData);
        });

        return postRef.id;
    });
};


// --- Firestore Triggers ---

exports.onPromoterStatusChange = functions
    .region("southamerica-east1")
    .firestore.document("promoters/{promoterId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const oldValue = change.before.data();
      const promoterId = context.params.promoterId;

      const justJoinedGroup = oldValue.hasJoinedGroup !== true && newValue.hasJoinedGroup === true;
      const isApproved = newValue.status === "approved";

      if (isApproved && justJoinedGroup) {
        try {
          console.log(`[Auto-Assign Trigger] Promoter ${promoterId} joined group. Assigning posts.`);
          await assignPostsToNewPromoter(newValue, promoterId);
        } catch (error) {
          console.error(`[Auto-Assign Trigger] Failed for promoter ${promoterId}:`, error);
        }
      }

      const statusChanged = newValue.status !== oldValue.status;
      const isNotificationStatus =
        newValue.status === "approved" ||
        newValue.status === "rejected" ||
        newValue.status === "rejected_editable";

      if (statusChanged && isNotificationStatus) {
        // 1. Envia E-mail (Brevo) - Isolado
        try {
            await sendStatusChangeEmail(newValue, promoterId);
        } catch (error) {
            console.error(`[Notification Trigger] Failed to send email for ${promoterId}:`, error);
        }

        // 2. Tenta enviar WhatsApp (Z-API) se estiver aprovado OU com correção pendente
        const shouldSendWhatsApp = (newValue.status === "approved" || newValue.status === "rejected_editable") && newValue.whatsapp;
        
        if (shouldSendWhatsApp) {
            try {
                // Check organization config first
                const orgRef = db.collection("organizations").doc(newValue.organizationId);
                const orgSnap = await orgRef.get();
                const orgData = orgSnap.exists ? orgSnap.data() : {};

                if (orgData.whatsappNotificationsEnabled !== false) {
                    await sendWhatsAppStatusChange(newValue, promoterId);
                } else {
                    console.log(`[Z-API Trigger] WhatsApp skipped for ${promoterId} (Disabled by Org).`);
                }
            } catch (waError) {
                console.error(`[Z-API Trigger Error] Failed to send WhatsApp for ${promoterId}:`, waError);
            }
        }
      }
    });

exports.onPostAssignmentCreated = functions.region("southamerica-east1").firestore
    .document("postAssignments/{assignmentId}")
    .onCreate(async (snap, context) => {
        const assignmentData = snap.data();
        if (!assignmentData) return;

        const { organizationId, promoterId, promoterEmail, promoterName, post } = assignmentData;
        if (!organizationId || !promoterId || !promoterEmail || !promoterName || !post) {
            console.error(`[onPostAssignmentCreated] Dados incompletos para a tarefa ${context.params.assignmentId}`);
            return;
        }

        try {
            const orgDoc = await db.collection("organizations").doc(organizationId).get();
            const orgData = orgDoc.exists ? orgDoc.data() : {};
            const orgName = orgData.name || "Sua Organização";

            // 1. Send Email - Isolated Try/Catch
            try {
                console.log(`[Email Post] Iniciando envio para ${promoterEmail}`);
                await sendNewPostNotificationEmail(
                    { email: promoterEmail, name: promoterName, id: promoterId },
                    {
                        campaignName: post.campaignName,
                        eventName: post.eventName,
                        orgName: orgName,
                        organizationId: organizationId,
                    }
                );
            } catch (emailErr) {
                console.error(`[Email Post Error] Falha ao enviar email para ${promoterEmail}:`, emailErr);
            }

            // 2. Send WhatsApp (Z-API) - Isolated Try/Catch
            if (orgData.whatsappNotificationsEnabled !== false) {
                try {
                    const promoterDoc = await db.collection("promoters").doc(promoterId).get();
                    if (promoterDoc.exists) {
                        const promoterData = promoterDoc.data();
                        if (promoterData.whatsapp) {
                            console.log(`[WhatsApp Post] Iniciando envio para ${promoterData.name}`);
                            await sendNewPostNotificationWhatsApp(promoterData, post, assignmentData, promoterId);
                        } else {
                            console.log(`[WhatsApp Post] Divulgadora sem WhatsApp cadastrado.`);
                        }
                    } else {
                        console.warn(`[WhatsApp Post] Documento da divulgadora ${promoterId} não encontrado.`);
                    }
                } catch (waErr) {
                    console.error(`[WhatsApp Post Error] Falha crítica ao enviar WhatsApp:`, waErr);
                }
            } else {
                console.log(`[Z-API Post] Skipped for ${assignmentData.id} (Disabled by Org).`);
            }

        } catch (error) {
            console.error(`Failed to process notification for assignment ${context.params.assignmentId}:`, error);
        }
    });


/**
 * Callable function for an admin to create a new post and its assignments.
 */
exports.createPostAndAssignments = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
        }

        const { postData, assignedPromoters } = data;
        if (!postData || !Array.isArray(assignedPromoters) || assignedPromoters.length === 0) {
            throw new functions.https.HttpsError("invalid-argument", "Dados inválidos para criação do post.");
        }

        const createdByEmail = context.auth.token.email;
        const organizationId = postData.organizationId;

        if (!organizationId) {
            throw new functions.https.HttpsError("invalid-argument", "ID da organização é obrigatório.");
        }

        try {
            const postId = await createPostAndAssignmentsHelper(postData, assignedPromoters, createdByEmail, organizationId);
            return { success: true, postId };
        } catch (error) {
            console.error("Error in createPostAndAssignments transaction:", error);
            throw new functions.https.HttpsError("internal", `Erro ao criar post e tarefas: ${error.message}`);
        }
    });

/**
 * Callable function for a superadmin to send a scheduled post immediately.
 */
exports.sendScheduledPostImmediately = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth || context.auth.token.role !== 'superadmin') {
            throw new functions.https.HttpsError('permission-denied', 'Apenas superadmins podem realizar esta ação.');
        }

        const { scheduledPostId } = data;
        if (!scheduledPostId) {
            throw new functions.https.HttpsError('invalid-argument', 'É necessário o ID do agendamento.');
        }

        const scheduledPostRef = db.collection("scheduledPosts").doc(scheduledPostId);
        const doc = await scheduledPostRef.get();

        if (!doc.exists) {
            throw new functions.https.HttpsError('not-found', `Agendamento com ID ${scheduledPostId} não encontrado.`);
        }

        const scheduledPost = doc.data();

        if (scheduledPost.status !== 'pending') {
            throw new functions.https.HttpsError('failed-precondition', 'Este post não está pendente e não pode ser enviado.');
        }

        try {
            await createPostAndAssignmentsHelper(
                scheduledPost.postData,
                scheduledPost.assignedPromoters,
                scheduledPost.createdByEmail,
                scheduledPost.organizationId
            );
            await scheduledPostRef.update({ status: "sent" });
            return { success: true, message: "Publicação enviada para a fila de processamento." };
        } catch (err) {
            console.error(`Error sending scheduled post ${scheduledPostId} immediately:`, err);
            await scheduledPostRef.update({ status: "error", error: err.message });
            throw new functions.https.HttpsError('internal', `Falha ao enviar post: ${err.message}`);
        }
    });


/**
 * Cron job to process scheduled posts every 15 minutes.
 */
exports.processScheduledPosts = functions
    .region("southamerica-east1")
    .pubsub.schedule("every 15 minutes")
    .onRun(async (context) => {
        console.log("Executando tarefa de publicações agendadas...");
        const now = admin.firestore.Timestamp.now();
        const query = db.collection("scheduledPosts")
            .where("status", "==", "pending")
            .where("scheduledAt", "<=", now);

        const snapshot = await query.get();

        if (snapshot.empty) {
            console.log("Nenhuma publicação agendada para processar.");
            return null;
        }

        const promises = [];
        snapshot.forEach(doc => {
            const scheduledPost = doc.data();
            const scheduledPostId = doc.id;
            console.log(`Processando agendamento: ${scheduledPostId}`);

            const promise = createPostAndAssignmentsHelper(
                scheduledPost.postData,
                scheduledPost.assignedPromoters,
                scheduledPost.createdByEmail,
                scheduledPost.organizationId
            ).then(() => {
                return doc.ref.update({ status: "sent" });
            }).catch(err => {
                console.error(`Erro ao processar agendamento ${scheduledPostId}:`, err);
                return doc.ref.update({ status: "error", error: err.message });
            });
            promises.push(promise);
        });

        await Promise.all(promises);
        console.log(`Processados ${snapshot.size} agendamentos.`);
        return null;
    });

// --- WhatsApp Reminder Functions ---

const sendWhatsAppReminderMessage = async (promoter, assignment) => {
    if (!zapiConfig.endpoint || !zapiConfig.token) {
        console.error("[Z-API Reminder] Z-API credentials not configured.");
        throw new functions.https.HttpsError("internal", "Z-API not configured.");
    }
    const phoneNumber = promoter.whatsapp.replace(/\D/g, "");
    if (!phoneNumber) return;

    const promoterFirstName = promoter.name.split(" ")[0];
    const campaignName = assignment.post.campaignName;

    const message = `⏰ Lembrete! Olá ${promoterFirstName}, não se esqueça de enviar o print da sua postagem para *${campaignName}*! O prazo está acabando. Acesse seu portal para enviar: https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.email)}`;
    
    const response = await fetch(`${zapiConfig.endpoint}/send-text`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-token": zapiConfig.token,
        },
        body: JSON.stringify({
            phone: `55${phoneNumber}`,
            message: message,
        }),
    });
    
    if (!response.ok) {
        const errorBody = await response.json();
        console.error("[Z-API Reminder Error]", errorBody);
        throw new Error(`Failed to send WhatsApp message: ${errorBody.reason || response.statusText}`);
    }
    return await response.json();
};

exports.scheduleWhatsAppReminder = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
        }
        
        const { assignmentId } = data;
        if (!assignmentId) {
            throw new functions.https.HttpsError("invalid-argument", "ID da tarefa é obrigatório.");
        }

        const assignmentRef = db.collection("postAssignments").doc(assignmentId);
        const assignmentSnap = await assignmentRef.get();
        if (!assignmentSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Tarefa não encontrada.");
        }
        const assignment = assignmentSnap.data();

        if (assignment.whatsAppReminderRequestedAt) {
            console.log(`Reminder already requested for assignment ${assignmentId}`);
            return { success: true, message: "Lembrete já agendado." };
        }
        
        const promoterRef = db.collection("promoters").doc(assignment.promoterId);
        const promoterSnap = await promoterRef.get();
        if (!promoterSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        }
        const promoter = promoterSnap.data();

        if (!promoter.whatsapp) {
            throw new functions.https.HttpsError("failed-precondition", "Divulgadora sem WhatsApp cadastrado.");
        }

        const confirmedAt = assignment.confirmedAt.toDate();
        const sendAt = new Date(confirmedAt.getTime() + 22 * 60 * 60 * 1000);

        const reminderData = {
            promoterId: assignment.promoterId,
            promoterName: promoter.name,
            promoterEmail: promoter.email,
            promoterWhatsapp: promoter.whatsapp,
            assignmentId: assignmentId,
            postId: assignment.postId,
            postCampaignName: assignment.post.campaignName,
            organizationId: assignment.organizationId,
            sendAt: admin.firestore.Timestamp.fromDate(sendAt),
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const batch = db.batch();
        const reminderRef = db.collection("whatsAppReminders").doc();
        batch.set(reminderRef, reminderData);
        batch.update(assignmentRef, { whatsAppReminderRequestedAt: admin.firestore.FieldValue.serverTimestamp() });
        
        await batch.commit();

        return { success: true, reminderId: reminderRef.id };
    });

exports.sendWhatsAppReminderNow = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
        if (!adminDoc.exists || adminDoc.data().role !== 'superadmin') {
            throw new functions.https.HttpsError("permission-denied", "Ação não autorizada.");
        }

        const { reminderId } = data;
        if (!reminderId) throw new functions.https.HttpsError("invalid-argument", "ID do lembrete é obrigatório.");

        const reminderRef = db.collection("whatsAppReminders").doc(reminderId);
        const reminderSnap = await reminderRef.get();
        if (!reminderSnap.exists) throw new functions.https.HttpsError("not-found", "Lembrete não encontrado.");
        
        const reminder = reminderSnap.data();
        if (reminder.status !== 'pending') throw new functions.https.HttpsError("failed-precondition", "Este lembrete não está pendente.");

        const [promoterSnap, assignmentSnap] = await Promise.all([
            db.collection("promoters").doc(reminder.promoterId).get(),
            db.collection("postAssignments").doc(reminder.assignmentId).get()
        ]);
        
        if (!promoterSnap.exists || !assignmentSnap.exists) {
            await reminderRef.update({ status: 'error', error: 'Promoter or assignment not found' });
            throw new functions.https.HttpsError("not-found", "Divulgadora ou tarefa não encontrada.");
        }
        
        try {
            await sendWhatsAppReminderMessage(promoterSnap.data(), assignmentSnap.data());
            await reminderRef.update({ status: 'sent' });
            return { success: true };
        } catch (err) {
            await reminderRef.update({ status: 'error', error: err.message });
            throw new functions.https.HttpsError("internal", err.message);
        }
    });

exports.processWhatsAppReminders = functions
    .region("southamerica-east1")
    .pubsub.schedule("every 15 minutes")
    .onRun(async (context) => {
        console.log("Executando tarefa de lembretes do WhatsApp...");
        const now = admin.firestore.Timestamp.now();
        const query = db.collection("whatsAppReminders")
            .where("status", "==", "pending")
            .where("sendAt", "<=", now);

        const snapshot = await query.get();
        if (snapshot.empty) {
            console.log("Nenhum lembrete para processar.");
            return null;
        }

        const promises = snapshot.docs.map(async (doc) => {
            const reminder = doc.data();
            console.log(`Processando lembrete: ${doc.id}`);
            
            try {
                const [promoterSnap, assignmentSnap] = await Promise.all([
                    db.collection("promoters").doc(reminder.promoterId).get(),
                    db.collection("postAssignments").doc(reminder.assignmentId).get()
                ]);

                if (!promoterSnap.exists || !assignmentSnap.exists) {
                    throw new Error("Promoter or assignment deleted.");
                }

                await sendWhatsAppReminderMessage(promoterSnap.data(), assignmentSnap.data());
                await doc.ref.update({ status: "sent" });
            } catch (err) {
                console.error(`Erro ao processar lembrete ${doc.id}:`, err);
                await doc.ref.update({ status: "error", error: err.message });
            }
        });

        await Promise.all(promises);
        console.log(`Processados ${snapshot.size} lembretes.`);
        return null;
    });
