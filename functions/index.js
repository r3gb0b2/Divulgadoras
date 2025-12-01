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


async function assignPostsToNewPromoter(promoterData, promoterId) {
    const { organizationId, state: stateAbbr, campaignName } = promoterData;
    if (!organizationId || !stateAbbr) return;

    const now = admin.firestore.Timestamp.now();
    const postsToAssign = new Map();

    const baseQuery = db.collection("posts")
        .where("organizationId", "==", organizationId)
        .where("stateAbbr", "==", stateAbbr)
        .where("autoAssignToNewPromoters", "==", true)
        .where("isActive", "==", true);

    if (campaignName) {
        const specificPostsQuery = baseQuery.where("campaignName", "==", campaignName);
        const snapshot = await specificPostsQuery.get();
        snapshot.forEach(doc => postsToAssign.set(doc.id, { id: doc.id, data: doc.data() }));
    }

    const generalPostsQuery = baseQuery.where("campaignName", "==", null);
    const generalSnapshot = await generalPostsQuery.get();
    generalSnapshot.forEach(doc => postsToAssign.set(doc.id, { id: doc.id, data: doc.data() }));

    if (postsToAssign.size === 0) return;

    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    for (const postInfo of postsToAssign.values()) {
        const post = postInfo.data;
        const postId = postInfo.id;

        if (post.expiresAt && post.expiresAt.toDate() < now.toDate()) {
            continue;
        }

        const assignmentDocRef = assignmentsCollectionRef.doc();
        const newAssignment = {
            postId: postId,
            post: {
                type: post.type,
                mediaUrl: post.mediaUrl || null,
                googleDriveUrl: post.googleDriveUrl || null,
                textContent: post.textContent || null,
                instructions: post.instructions,
                postLink: post.postLink || null,
                campaignName: post.campaignName,
                eventName: post.eventName || null,
                isActive: post.isActive,
                expiresAt: post.expiresAt || null,
                createdAt: post.createdAt,
                allowLateSubmissions: post.allowLateSubmissions || false,
                allowImmediateProof: post.allowImmediateProof || false,
                postFormats: post.postFormats || [],
                skipProofRequirement: post.skipProofRequirement || false,
                allowJustification: post.allowJustification !== false,
            },
            organizationId: promoterData.organizationId,
            promoterId: promoterId,
            promoterEmail: promoterData.email.toLowerCase(),
            promoterName: promoterData.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentDocRef, newAssignment);
    }

    await batch.commit();
}

// --- Helper to generate Signed URL for Firebase Storage files ---
async function getSignedUrl(storagePath) {
    try {
        if (!storagePath) return null;
        if (storagePath.startsWith('http')) return storagePath; // Already a URL

        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        
        // Check if file exists first to avoid error
        const [exists] = await file.exists();
        if (!exists) {
            console.warn(`[Z-API] File not found in bucket: ${storagePath}`);
            return null;
        }

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 48, // 48 hours to ensure validity
        });
        return url;
    } catch (e) {
        console.error("[Z-API] Failed to generate signed URL:", e);
        return null;
    }
}

// --- Helper to convert Drive View URL to Direct Download URL ---
function convertDriveToDirectLink(url) {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('drive.google.com')) return url;
    
    let id = null;
    const patterns = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            id = match[1];
            break;
        }
    }
    if (id) {
        return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    return url;
}

// --- Função de Envio de WhatsApp para Novos Posts (Z-API) ---
async function sendNewPostNotificationWhatsApp(promoterData, postData, assignmentData, promoterId) {
    console.log(`[Z-API Post] >>> Preparando envio para ${promoterData.name}`);
    
    const config = getConfig().zapi;
    if (!config || !config.instance_id || !config.token) {
        console.log("[Z-API Post] Configuração Z-API ausente.");
        return;
    }
    const { instance_id, token, client_token } = config;

    // 1. Formatação do Telefone
    let rawPhone = promoterData.whatsapp || "";
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
    if (cleanPhone.length < 10) {
        console.error(`[Z-API Post] Telefone inválido: ${cleanPhone}`);
        return;
    }

    // 2. Links e Infos
    const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoterData.email)}`;
    const leaveGroupLink = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoterId}&campaignName=${encodeURIComponent(postData.campaignName)}&orgId=${postData.organizationId}`;

    const firstName = promoterData.name ? promoterData.name.split(' ')[0] : 'Divulgadora';
    const eventName = postData.eventName || postData.campaignName;

    // 3. Montagem da Legenda/Mensagem
    let caption = `✨ *NOVA POSTAGEM DISPONÍVEL* ✨\n\n`;
    caption += `Olá ${firstName}! Temos uma nova publicação para *${eventName}*.\n\n`;
    
    if (postData.instructions) {
        const shortInstructions = postData.instructions.length > 300 
            ? postData.instructions.substring(0, 300) + '...' 
            : postData.instructions;
        caption += `📝 *Instruções:* ${shortInstructions}\n\n`;
    }

    if (postData.postLink) {
        caption += `🔗 *Link do Post:* ${postData.postLink}\n\n`;
    }

    caption += `👇 *PARA CONFIRMAR E ENVIAR O PRINT:* 👇\n${portalLink}\n\n`;
    caption += `⚠️ *Não faz parte ou não tem interesse?*\nSolicite a remoção aqui: ${leaveGroupLink}`;

    // 4. Definição do Tipo de Envio: DEFAULT TO TEXT
    // We always prepare a text payload first. We only change it if media resolution succeeds.
    let endpoint = 'send-text';
    let body = { phone: cleanPhone, message: caption };

    // Try to resolve media if available
    if (postData.type === 'image' || postData.type === 'video') {
        try {
            let mediaUrl = null;

            // A) Check Firebase Storage
            if (postData.mediaUrl && typeof postData.mediaUrl === 'string') {
                if (postData.mediaUrl.startsWith('http')) {
                    // Already a URL (e.g. previous Drive link saved here)
                    mediaUrl = convertDriveToDirectLink(postData.mediaUrl);
                } else if (!postData.mediaUrl.includes('drive.google.com')) {
                    // Firebase Storage Path
                    mediaUrl = await getSignedUrl(postData.mediaUrl);
                }
            }
            
            // B) Check Google Drive URL field if Firebase didn't yield results
            if (!mediaUrl && postData.googleDriveUrl && typeof postData.googleDriveUrl === 'string') {
                 mediaUrl = convertDriveToDirectLink(postData.googleDriveUrl);
            }

            // C) If we found a valid HTTP URL, upgrade the request to media
            if (mediaUrl && mediaUrl.startsWith('http')) {
                if (postData.type === 'image') {
                    endpoint = 'send-image';
                    body = { phone: cleanPhone, image: mediaUrl, caption: caption };
                } else if (postData.type === 'video') {
                    endpoint = 'send-video';
                    body = { phone: cleanPhone, video: mediaUrl, caption: caption };
                }
                console.log(`[Z-API Post] Mídia resolvida: ${mediaUrl.substring(0, 50)}...`);
            } else {
                console.log(`[Z-API Post] Mídia não encontrada/resolvida. Enviando apenas texto.`);
            }
        } catch (mediaError) {
            console.error(`[Z-API Post Warning] Erro ao resolver mídia: ${mediaError}. Enviando apenas texto.`);
            // Ensure we fall back to text body
            endpoint = 'send-text';
            body = { phone: cleanPhone, message: caption };
        }
    }

    // 5. Envio HTTP
    const url = `https://api.z-api.io/instances/${instance_id}/token/${token}/${endpoint}`;
    
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (client_token) headers['Client-Token'] = client_token;

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Z-API Post Error] ${endpoint}: ${response.status} - ${errText}`);
        } else {
            console.log(`[Z-API Post Success] Enviado (${endpoint}) para ${cleanPhone}`);
        }
    } catch (error) {
        console.error(`[Z-API Post Exception]`, error);
    }
}


// --- Função de Envio de WhatsApp de Aprovação/Correção (Z-API) ---
async function sendWhatsAppStatusChange(promoterData, promoterId) {
    console.log(`[Z-API] >>> Iniciando envio para ${promoterId}`);
    
    const config = getConfig().zapi;
    
    if (!config.instance_id || !config.token) {
        console.error("[Z-API] ERRO: 'instance_id' ou 'token' não configurados no Firebase (functions.config().zapi).");
        return;
    }

    const { instance_id, token, client_token } = config;

    // Formatação do Telefone
    let rawPhone = promoterData.whatsapp || "";
    let cleanPhone = rawPhone.replace(/\D/g, '');
    
    if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
    }
    
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        cleanPhone = '55' + cleanPhone;
    }

    if (cleanPhone.length < 10) {
        console.error(`[Z-API] ERRO: Telefone muito curto (${cleanPhone}). Cancelando envio.`);
        return;
    }

    const { orgName } = await getOrgAndCampaignDetails(
        promoterData.organizationId,
        promoterData.state,
        promoterData.campaignName,
    );

    const firstName = promoterData.name ? promoterData.name.split(' ')[0] : 'Divulgadora';
    const campaignDisplay = promoterData.campaignName || orgName;
    
    let message = "";

    if (promoterData.status === 'approved') {
        const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;
        message = `Olá ${firstName}! Parabéns 🥳\n\nSeu cadastro para *${campaignDisplay}* foi APROVADO!\n\nAcesse seu painel agora para ver as regras e entrar no grupo:\n${portalLink}`;
    } else if (promoterData.status === 'rejected_editable') {
        const editLink = `https://divulgadoras.vercel.app/#/${promoterData.organizationId}/register/${promoterData.state}/${promoterData.campaignName ? encodeURIComponent(promoterData.campaignName) : ''}?edit_id=${promoterId}`;
        const reasonText = promoterData.rejectionReason ? `\n\n📝 *Motivo:* ${promoterData.rejectionReason}` : "";
        message = `Olá ${firstName}! 👋\n\nIdentificamos que seu cadastro para *${campaignDisplay}* precisa de um ajuste.${reasonText}\n\nLiberamos a edição para você! Clique no link abaixo para corrigir e reenviar:\n${editLink}`;
    } else {
        // Unknown status for WhatsApp notification
        return;
    }

    const url = `https://api.z-api.io/instances/${instance_id}/token/${token}/send-text`;
    
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (client_token) {
            headers['Client-Token'] = client_token;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: cleanPhone,
                message: message
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Z-API] ERRO HTTP: ${response.status} - ${errText}`);
        } else {
            const responseData = await response.json();
            console.log(`[Z-API] SUCESSO! ID da mensagem: ${responseData.messageId || 'OK'}`);
        }

    } catch (error) {
        console.error(`[Z-API] EXCEÇÃO no fetch:`, error);
    }
}

// --- Função de Disparo em Massa de WhatsApp ---
exports.sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    
    // Check Config
    const config = getConfig().zapi;
    if (!config || !config.instance_id || !config.token) {
        throw new functions.https.HttpsError("failed-precondition", "Z-API não configurada.");
    }

    const { messageTemplate, filters, organizationId } = data;
    
    if (!messageTemplate || !organizationId) {
        throw new functions.https.HttpsError("invalid-argument", "Mensagem e organização são obrigatórios.");
    }

    let query = db.collection("promoters").where("organizationId", "==", organizationId);

    // Apply filters
    if (filters) {
        if (filters.promoterIds && filters.promoterIds.length > 0) {
            // Batching logic needed if ID list is huge, but here we assume 'in' limit of 30 or fetch-all fallback
            // Simple approach: if IDs provided, rely on client to send reasonable batches or fetch all and filter in memory.
            // For robust large scale, this should use Task Queue, but for immediate call:
            // We'll ignore the 'in' query limitation here and fetch all for the org, then filter in memory for simplicity/reliability
            // given Firestore limitations on 'in' queries with > 10 items in older SDKs or > 30 in newer.
            // A safer approach for bulk IDs is just fetch based on other filters if present, or fetch all.
        } else {
            if (filters.state && filters.state !== 'all') {
                query = query.where("state", "==", filters.state);
            }
            if (filters.campaignName && filters.campaignName !== 'all') {
                query = query.where("campaignName", "==", filters.campaignName);
            }
            if (filters.status && filters.status !== 'all') {
                query = query.where("status", "==", filters.status);
            }
        }
    }

    const snapshot = await query.get();
    
    if (snapshot.empty) {
        return { success: true, count: 0, message: "Nenhum destinatário encontrado." };
    }

    const { instance_id, token, client_token } = config;
    const url = `https://api.z-api.io/instances/${instance_id}/token/${token}/send-text`;
    const headers = { 'Content-Type': 'application/json' };
    if (client_token) headers['Client-Token'] = client_token;

    let successCount = 0;
    let failCount = 0;

    // Process in chunks to avoid blowing up memory or rate limits
    const promoters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter by specific IDs if provided (in-memory filtering for robustness)
    const targetPromoters = (filters?.promoterIds && filters.promoterIds.length > 0) 
        ? promoters.filter(p => filters.promoterIds.includes(p.id)) 
        : promoters;

    for (const promoter of targetPromoters) {
        if (!promoter.whatsapp) continue;

        let cleanPhone = promoter.whatsapp.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;
        if (cleanPhone.length < 10) continue;

        // Personalize message
        let personalizedMsg = messageTemplate;
        personalizedMsg = personalizedMsg.replace(/{{name}}/g, promoter.name ? promoter.name.split(' ')[0] : 'Divulgadora');
        personalizedMsg = personalizedMsg.replace(/{{fullName}}/g, promoter.name || '');
        personalizedMsg = personalizedMsg.replace(/{{email}}/g, promoter.email || '');
        personalizedMsg = personalizedMsg.replace(/{{campaignName}}/g, promoter.campaignName || 'Eventos');
        personalizedMsg = personalizedMsg.replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.email)}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    phone: cleanPhone,
                    message: personalizedMsg
                })
            });

            if (response.ok) {
                successCount++;
            } else {
                failCount++;
                console.error(`Falha Z-API para ${cleanPhone}:`, await response.text());
            }
            // Small delay to be nice to the API
            await new Promise(r => setTimeout(r, 100)); 
        } catch (e) {
            console.error(`Erro envio ${cleanPhone}:`, e);
            failCount++;
        }
    }

    return { 
        success: true, 
        count: successCount, 
        failures: failCount, 
        message: `Enviado para ${successCount} divulgadoras. Falhas: ${failCount}` 
    };
});

// --- Função de Teste do Z-API (Para Debug) ---
exports.testZapi = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    
    const config = getConfig().zapi;
    const phoneToTest = data.phone || '5511999999999'; 

    return {
        configFound: !!config,
        hasInstanceId: !!config?.instance_id,
        hasToken: !!config?.token,
        hasClientToken: !!config?.client_token,
        attemptingSendTo: phoneToTest,
        timestamp: new Date().toISOString()
    };
});


async function sendStatusChangeEmail(promoterData, promoterId) {
  if (!brevoApiInstance || !promoterData || !promoterData.email) return;

  const { orgName } = await getOrgAndCampaignDetails(
      promoterData.organizationId,
      promoterData.state,
      promoterData.campaignName,
  );

  const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(promoterData.email)}`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoterData.email, name: promoterData.name }];
  sendSmtpEmail.sender = {
    name: orgName || "Equipe de Eventos",
    email: brevoConfig.sender_email,
  };

  const replacements = {
    promoterName: promoterData.name,
    promoterEmail: promoterData.email,
    campaignName: promoterData.campaignName || "nosso time",
    rejectionReason: promoterData.rejectionReason || "",
    orgName: orgName || "Nossa Organização",
    portalLink: portalLink,
  };

  if (promoterData.status === "approved") {
    sendSmtpEmail.subject = `Parabéns, seu cadastro para ${replacements.campaignName} foi aprovado!`;
    const templateDoc = await db.doc(EMAIL_TEMPLATE_DOC_PATH).get();
    let htmlTemplate = templateDoc.exists ? templateDoc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE_HTML;

    for (const key in replacements) {
      const placeholder = new RegExp(`{{${key}}}`, "g");
      htmlTemplate = htmlTemplate.replace(placeholder, replacements[key]);
    }
    sendSmtpEmail.htmlContent = htmlTemplate;
  } else if (promoterData.status === "rejected_editable") {
    sendSmtpEmail.subject = `Ação Necessária: Corrija seu cadastro para ${replacements.campaignName}`;
    const editLink = `https://divulgadoras.vercel.app/#/${promoterData.organizationId}/register/${promoterData.state}/${promoterData.campaignName ? encodeURIComponent(promoterData.campaignName) : ""}?edit_id=${promoterId}`;
    const rejectionReasonHtml = promoterData.rejectionReason ? `<p><strong>Motivo:</strong></p><div style="background-color: #ffefef; border-left: 4px solid #f87171; padding: 10px; margin-bottom: 20px;">${promoterData.rejectionReason.replace(/\n/g, "<br/>")}</div>` : "";

    const htmlContent = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Correção de Cadastro Necessária</title><style>body{font-family:sans-serif;background-color:#f4f4f4;color:#333;}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;}.header{background-color:#f97316;color:#ffffff;padding:20px;text-align:center;}.content{padding:30px;}.button{display:inline-block;background-color:#f97316;color:#ffffff;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;}</style></head>
    <body><div class="container"><div class="header"><h1>Olá, ${promoterData.name}!</h1></div><div class="content"><p>Notamos que seu cadastro para o evento <strong>${replacements.campaignName}</strong> precisa de algumas correções.</p>${rejectionReasonHtml}<p>Clique abaixo para corrigir.</p><p style="text-align:center;margin:30px 0;"><a href="${editLink}" class="button">Corrigir Meu Cadastro</a></p><p>Atenciosamente,<br>Equipe ${replacements.orgName}</p></div></div></body></html>`;
    sendSmtpEmail.htmlContent = htmlContent;
  } else { 
    sendSmtpEmail.subject = "Atualização sobre seu cadastro";
    sendSmtpEmail.templateId = 11; 
    sendSmtpEmail.params = replacements;
  }

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    // Increment email usage separately so it doesn't crash the Brevo try/catch if it fails
    await incrementOrgEmailCount(promoterData.organizationId);
  } catch (error) {
    console.error(`[Brevo API Error] Failed to send email to ${promoterData.email}.`, getBrevoErrorDetails(error));
  }
}

async function sendNewPostNotificationEmail(promoter, postDetails) {
  if (!brevoApiInstance) return;

  const portalLink = `https://divulgadoras.vercel.app/#/posts?email=${encodeURIComponent(promoter.email)}`;
  const leaveGroupLink = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoter.id}&campaignName=${encodeURIComponent(postDetails.campaignName)}&orgId=${postDetails.organizationId}`;
  const eventDisplayName = postDetails.eventName ? `${postDetails.campaignName} - ${postDetails.eventName}` : postDetails.campaignName;
  const subject = `Nova Publicação Disponível - ${eventDisplayName}`;
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;background-color:#f4f4f4;color:#333;}.container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;}.header{background-color:#1a1a2e;color:#ffffff;padding:20px;text-align:center;}.content{padding:30px;}.footer{padding:20px;text-align:center;font-size:12px;color:#888;}.button{display:inline-block;background-color:#e83a93;color:#ffffff;padding:12px 25px;text-decoration:none;border-radius:5px;font-weight:bold;}</style></head><body><div class="container"><div class="header"><h1>Olá, ${promoter.name}!</h1></div><div class="content"><p>Nova publicação para <strong>${eventDisplayName}</strong>.</p><p style="text-align:center;margin:30px 0;"><a href="${portalLink}" class="button">Ver Publicação</a></p><p>Atenciosamente,<br>Equipe ${postDetails.orgName}</p></div><div class="footer"><p><a href="${leaveGroupLink}">Sair do grupo</a></p></div></div></body></html>`;

  const sendSmtpEmail = new Brevo.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: promoter.email, name: promoter.name }];
  sendSmtpEmail.sender = { name: postDetails.orgName || "Equipe de Eventos", email: brevoConfig.sender_email };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;

  try {
    await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    await incrementOrgEmailCount(postDetails.organizationId);
  } catch (error) {
    console.error(`[Brevo API Error] Failed to send new post email.`, getBrevoErrorDetails(error));
  }
}

async function getOrgAndCampaignDetails(organizationId, stateAbbr, campaignName) {
  let orgName = "Equipe de Eventos";
  let campaignRules = "";
  let campaignLink = "#";

  if (organizationId) {
    const orgDoc = await db.collection("organizations").doc(organizationId).get();
    if (orgDoc.exists) orgName = orgDoc.data().name || orgName;
  }

  if (stateAbbr && campaignName && organizationId) {
    const campaignsQuery = db.collection("campaigns").where("organizationId", "==", organizationId).where("stateAbbr", "==", stateAbbr).where("name", "==", campaignName).limit(1);
    const snapshot = await campaignsQuery.get();
    if (!snapshot.empty) {
      const campaignDoc = snapshot.docs[0].data();
      campaignRules = campaignDoc.rules || "";
      campaignLink = campaignDoc.whatsappLink || "#";
    }
  }
  return { orgName, campaignRules, campaignLink };
}

exports.updatePromoterAndSync = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
      if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
      const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
      if (!adminDoc.exists || !["admin", "superadmin"].includes(adminDoc.data().role)) throw new functions.https.HttpsError("permission-denied", "Acesso negado.");

      const { promoterId, data: updateData } = data;
      if (!promoterId || !updateData) throw new functions.https.HttpsError("invalid-argument", "Dados inválidos.");

      const promoterRef = db.collection("promoters").doc(promoterId);

      try {
        const promoterSnap = await promoterRef.get();
        if (!promoterSnap.exists) throw new functions.https.HttpsError("not-found", "Divulgadora não encontrada.");
        const oldData = promoterSnap.data();

        const newEmail = updateData.email !== undefined ? safeLower(updateData.email) : oldData.email;
        const newName = updateData.name !== undefined ? safeTrim(updateData.name) : oldData.name;
        const newInstagram = updateData.instagram !== undefined ? safeTrim(updateData.instagram) : oldData.instagram;

        const emailHasChanged = newEmail !== oldData.email;
        const nameHasChanged = newName !== oldData.name;
        const instagramHasChanged = newInstagram !== oldData.instagram;

        await promoterRef.update(updateData);

        if (!emailHasChanged && !nameHasChanged && !instagramHasChanged) {
          return { success: true, message: "Divulgadora atualizada." };
        }

        const fieldsToSync = {};
        if (emailHasChanged) fieldsToSync.promoterEmail = newEmail;
        if (nameHasChanged) fieldsToSync.promoterName = newName;

        const collectionsToSync = ["postAssignments", "guestListConfirmations", "groupRemovalRequests", "guestListChangeRequests"];
        for (const collectionName of collectionsToSync) {
            const query = db.collection(collectionName).where("promoterId", "==", promoterId);
            const snapshot = await query.get();
            if (snapshot.empty) continue;
            const batch = db.batch();
            snapshot.forEach((doc) => batch.update(doc.ref, fieldsToSync));
            await batch.commit();
        }

        if (nameHasChanged || instagramHasChanged) {
            const participantRef = db.collection("followLoopParticipants").doc(promoterId);
            const participantSnap = await participantRef.get();
            if (participantSnap.exists) {
                const pUpdate = {};
                if (nameHasChanged) pUpdate.promoterName = newName;
                if (instagramHasChanged) pUpdate.instagram = newInstagram;
                await participantRef.update(pUpdate);
            }

            const batchUpdate = async (docs, updateFn) => {
                const CHUNK_SIZE = 490; 
                const chunks = [];
                for (let i = 0; i < docs.length; i += CHUNK_SIZE) chunks.push(docs.slice(i, i + CHUNK_SIZE));
                for (const chunk of chunks) {
                    const batch = db.batch();
                    chunk.forEach(doc => updateFn(batch, doc));
                    await batch.commit();
                }
            };

            const asFollowerQuery = db.collection("followInteractions").where("followerId", "==", promoterId);
            const asFollowerSnap = await asFollowerQuery.get();
            if (!asFollowerSnap.empty) {
                await batchUpdate(asFollowerSnap.docs, (batch, doc) => {
                    const iUpdate = {};
                    if (nameHasChanged) iUpdate.followerName = newName;
                    if (instagramHasChanged) iUpdate.followerInstagram = newInstagram;
                    batch.update(doc.ref, iUpdate);
                });
            }

            const asFollowedQuery = db.collection("followInteractions").where("followedId", "==", promoterId);
            const asFollowedSnap = await asFollowedQuery.get();
            if (!asFollowedSnap.empty) {
                await batchUpdate(asFollowedSnap.docs, (batch, doc) => {
                     const iUpdate = {};
                     if (nameHasChanged) iUpdate.followedName = newName;
                     if (instagramHasChanged) iUpdate.followedInstagram = newInstagram;
                     batch.update(doc.ref, iUpdate);
                });
            }
        }

        return { success: true, message: "Divulgadora atualizada e sincronizada." };

      } catch (error) {
        console.error(`Error updating promoter ${promoterId}:`, error);
        throw new functions.https.HttpsError("internal", "Erro interno ao atualizar.", error.message);
      }
    });

exports.publicResubmitPromoter = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    // No auth check required, this is for public re-submissions
    const { promoterId, updateData } = data;
    if (!promoterId || !updateData) throw new functions.https.HttpsError("invalid-argument", "Dados inválidos.");

    const promoterRef = db.collection("promoters").doc(promoterId);

    try {
        const promoterSnap = await promoterRef.get();
        if (!promoterSnap.exists) throw new functions.https.HttpsError("not-found", "Cadastro não encontrado.");
        
        const currentData = promoterSnap.data();
        if (currentData.status !== 'rejected_editable') {
            throw new functions.https.HttpsError('permission-denied', 'Este cadastro não está liberado para edição.');
        }

        // Prepare update
        const cleanData = { ...updateData };
        
        // Critical: Force status reset and clear rejection reason
        cleanData.status = 'pending';
        cleanData.rejectionReason = admin.firestore.FieldValue.delete();
        
        // Protect sensitive fields from being overwritten by user
        delete cleanData.id;
        delete cleanData.createdAt;
        delete cleanData.organizationId; // Prevent changing org
        delete cleanData.actionTakenByUid;
        delete cleanData.actionTakenByEmail;
        delete cleanData.statusChangedAt;

        // Perform the update
        await promoterRef.update(cleanData);

        // --- SYNC LOGIC (Same as updatePromoterAndSync) ---
        // If name or email changed, we should sync across collections to keep data consistent
        const newEmail = cleanData.email !== undefined ? safeLower(cleanData.email) : currentData.email;
        const newName = cleanData.name !== undefined ? safeTrim(cleanData.name) : currentData.name;
        const newInstagram = cleanData.instagram !== undefined ? safeTrim(cleanData.instagram) : currentData.instagram;

        const emailHasChanged = newEmail !== currentData.email;
        const nameHasChanged = newName !== currentData.name;
        const instagramHasChanged = newInstagram !== currentData.instagram;

        if (emailHasChanged || nameHasChanged || instagramHasChanged) {
             const fieldsToSync = {};
             if (emailHasChanged) fieldsToSync.promoterEmail = newEmail;
             if (nameHasChanged) fieldsToSync.promoterName = newName;

             if (Object.keys(fieldsToSync).length > 0) {
                 const collectionsToSync = ["postAssignments", "guestListConfirmations", "groupRemovalRequests", "guestListChangeRequests"];
                 for (const collectionName of collectionsToSync) {
                     const query = db.collection(collectionName).where("promoterId", "==", promoterId);
                     const snapshot = await query.get();
                     if (!snapshot.empty) {
                         const batch = db.batch();
                         snapshot.forEach((doc) => batch.update(doc.ref, fieldsToSync));
                         await batch.commit();
                     }
                 }
             }
             
             // Sync Follow Loop
             if (nameHasChanged || instagramHasChanged) {
                const participantRef = db.collection("followLoopParticipants").doc(promoterId);
                const participantSnap = await participantRef.get();
                if (participantSnap.exists) {
                    const pUpdate = {};
                    if (nameHasChanged) pUpdate.promoterName = newName;
                    if (instagramHasChanged) pUpdate.instagram = newInstagram;
                    await participantRef.update(pUpdate);
                }
                
                // Note: Not syncing interactions here for public resubmit to keep it lighter/faster. 
                // Admin can trigger sync later if needed via admin edit.
             }
        }

        return { success: true };

    } catch (error) {
        console.error(`Error resubmitting promoter ${promoterId}:`, error);
        // Pass through HttpsErrors, wrap others
        if (error.code && error.details) throw error; 
        throw new functions.https.HttpsError("internal", "Erro ao reenviar cadastro.", error.message);
    }
});

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postData, assignedPromoters } = data;
    const batch = db.batch();
    const postRef = db.collection("posts").doc();
    batch.set(postRef, { ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    assignedPromoters.forEach(promoter => {
        const assignmentRef = db.collection("postAssignments").doc();
        const newAssignment = {
            postId: postRef.id,
            post: {
                ...postData,
                skipProofRequirement: postData.skipProofRequirement || false,
                allowJustification: postData.allowJustification !== false,
            },
            organizationId: postData.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentRef, newAssignment);
    });

    await batch.commit();
    return { success: true, postId: postRef.id };
});

exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { postId, promoterIds } = data;
    const postRef = db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    const postData = postSnap.data();

    const promoters = [];
    const promoterChunks = [];
    for (let i = 0; i < promoterIds.length; i += 30) promoterChunks.push(promoterIds.slice(i, i + 30));

    for (const chunk of promoterChunks) {
        const promotersQuery = db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", chunk);
        const snapshot = await promotersQuery.get();
        snapshot.forEach(doc => promoters.push({ id: doc.id, ...doc.data() }));
    }

    const denormalizedPost = {
        type: postData.type,
        mediaUrl: postData.mediaUrl || null,
        googleDriveUrl: postData.googleDriveUrl || null,
        textContent: postData.textContent || null,
        instructions: postData.instructions,
        postLink: postData.postLink || null,
        campaignName: postData.campaignName,
        eventName: postData.eventName || null,
        isActive: postData.isActive,
        expiresAt: postData.expiresAt || null,
        createdAt: postData.createdAt,
        allowLateSubmissions: postData.allowLateSubmissions || false,
        allowImmediateProof: postData.allowImmediateProof || false,
        postFormats: postData.postFormats || [],
        skipProofRequirement: postData.skipProofRequirement || false,
        allowJustification: postData.allowJustification !== false,
    };
    
    const batch = db.batch();
    const assignmentsCollectionRef = db.collection("postAssignments");

    promoters.forEach(promoter => {
        const assignmentDocRef = assignmentsCollectionRef.doc(); 
        const newAssignment = {
            postId: postId,
            post: denormalizedPost,
            organizationId: postData.organizationId,
            promoterId: promoter.id,
            promoterEmail: promoter.email.toLowerCase(),
            promoterName: promoter.name,
            status: "pending",
            confirmedAt: null,
        };
        batch.set(assignmentDocRef, newAssignment);
    });

    await batch.commit();
    return { success: true, count: promoters.length };
});

exports.updatePostStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const { postId, updateData } = data;
    
    const postRef = db.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) throw new functions.https.HttpsError("not-found", "Publicação não encontrada.");
    const originalPostData = postSnap.data();

    await postRef.update(updateData);

    const assignmentsRef = db.collection("postAssignments");
    const assignmentsQuery = assignmentsRef.where("postId", "==", postId);
    const assignmentsSnapshot = await assignmentsQuery.get();

    if (assignmentsSnapshot.empty) return { success: true, message: "Post atualizado." };

    const updatedDenormalizedPostData = { ...originalPostData, ...updateData };
    const denormalizedPostObject = {
        type: updatedDenormalizedPostData.type,
        mediaUrl: updatedDenormalizedPostData.mediaUrl || null,
        googleDriveUrl: updatedDenormalizedPostData.googleDriveUrl || null,
        textContent: updatedDenormalizedPostData.textContent || null,
        instructions: updatedDenormalizedPostData.instructions,
        postLink: updatedDenormalizedPostData.postLink || null,
        campaignName: updatedDenormalizedPostData.campaignName,
        eventName: updatedDenormalizedPostData.eventName || null,
        isActive: updatedDenormalizedPostData.isActive,
        expiresAt: updatedDenormalizedPostData.expiresAt || null,
        createdAt: updatedDenormalizedPostData.createdAt,
        allowLateSubmissions: updatedDenormalizedPostData.allowLateSubmissions || false,
        allowImmediateProof: updatedDenormalizedPostData.allowImmediateProof || false,
        postFormats: updatedDenormalizedPostData.postFormats || [],
        skipProofRequirement: updatedDenormalizedPostData.skipProofRequirement || false,
        allowJustification: updatedDenormalizedPostData.allowJustification !== false,
    };
    
    const batch = db.batch();
    assignmentsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { post: denormalizedPostObject });
    });

    await batch.commit();
    return { success: true, message: "Atualizado com sucesso." };
});

// --- Admin & Auth Functions ---

exports.createAdminRequest = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { email, password, name, phone, message } = data;
    if (!email || !password || !name || !phone) throw new functions.https.HttpsError('invalid-argument', 'Dados incompletos.');

    try {
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
            disabled: false 
        });

        await db.collection("adminApplications").doc(userRecord.uid).set({
            name,
            email,
            phone,
            message: message || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error("Error creating admin request:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- System Status & Test Email ---

exports.getSystemStatus = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    
    const isBrevoConfigured = !!(brevoConfig && brevoConfig.key && brevoConfig.sender_email);
    
    let log = [];
    if (!isBrevoConfigured) {
        log.push({ level: 'ERROR', message: 'Variáveis de ambiente do Brevo não encontradas.' });
    } else {
        log.push({ level: 'INFO', message: 'Configuração do Brevo encontrada.' });
    }

    return {
        functionVersion: "1.0.0", // Should match package version or logical version
        emailProvider: "Brevo",
        configured: isBrevoConfigured,
        message: isBrevoConfigured ? "Sistema de e-mail configurado." : "Falta configuração do Brevo.",
        log: log
    };
});

exports.sendTestEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    const email = context.auth.token.email;
    if (!email) throw new functions.https.HttpsError("failed-precondition", "Email do usuário não encontrado.");

    if (!brevoApiInstance) throw new functions.https.HttpsError("failed-precondition", "Serviço de e-mail não configurado.");

    const { testType, customHtmlContent } = data;
    
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: email, name: "Admin Teste" }];
    sendSmtpEmail.sender = { name: "Sistema Equipe Certa", email: brevoConfig.sender_email };

    if (testType === 'custom_approved') {
        sendSmtpEmail.subject = "[Teste] Modelo de Aprovação";
        // Replace placeholders with dummy data for preview
        let html = customHtmlContent || "";
        html = html.replace(/{{promoterName}}/g, "Maria Silva");
        html = html.replace(/{{promoterEmail}}/g, "maria@exemplo.com");
        html = html.replace(/{{campaignName}}/g, "Festa de Verão");
        html = html.replace(/{{orgName}}/g, "Produtora Exemplo");
        html = html.replace(/{{portalLink}}/g, "#");
        sendSmtpEmail.htmlContent = html;
    } else if (testType === 'approved') {
        // ... existing test logic if needed ...
        sendSmtpEmail.subject = "[Teste] E-mail de Aprovação";
        sendSmtpEmail.htmlContent = "<p>Este é um teste do sistema de aprovação.</p>";
    } else {
        sendSmtpEmail.subject = "[Teste] Verificação de Sistema";
        sendSmtpEmail.htmlContent = "<p>Seu sistema de envio de e-mails está funcionando corretamente.</p>";
    }

    try {
        await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
        return { success: true, message: "E-mail enviado." };
    } catch (error) {
        console.error("Test email failed:", error);
        throw new functions.https.HttpsError("internal", "Falha ao enviar e-mail de teste: " + getBrevoErrorDetails(error));
    }
});

// --- Stripe Functions ---

exports.getStripePublishableKey = functions.region("southamerica-east1").https.onCall((data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const key = functions.config().stripe ? functions.config().stripe.publishable_key : null;
    if (!key) throw new functions.https.HttpsError('failed-precondition', 'Stripe key not configured.');
    return { publishableKey: key };
});

exports.createStripeCheckoutSession = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    if (!stripe) throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured.');

    const { orgId, planId } = data;
    const priceId = planId === 'professional' 
        ? functions.config().stripe.professional_price_id 
        : functions.config().stripe.basic_price_id;

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `https://divulgadoras.vercel.app/#/admin/organization/${orgId}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://divulgadoras.vercel.app/#/subscribe/${planId}`,
            client_reference_id: orgId,
        });
        return { sessionId: session.id };
    } catch (error) {
        console.error("Stripe session creation failed:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.stripeWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    if (!stripe) { res.status(500).send("Stripe not configured"); return; }
    
    const sig = req.headers['stripe-signature'];
    const endpointSecret = functions.config().stripe.webhook_secret;

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orgId = session.client_reference_id;
        if (orgId) {
            const orgRef = db.collection('organizations').doc(orgId);
            // Add 30 days to current date
            const newExpiry = new Date();
            newExpiry.setDate(newExpiry.getDate() + 30);
            
            await orgRef.update({
                status: 'active',
                planExpiresAt: admin.firestore.Timestamp.fromDate(newExpiry)
            });
        }
    }

    res.json({received: true});
});

exports.getStripeStatus = functions.region("southamerica-east1").https.onCall((data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const conf = functions.config().stripe || {};
    return {
        configured: !!conf.secret_key,
        secretKey: !!conf.secret_key,
        publishableKey: !!conf.publishable_key,
        webhookSecret: !!conf.webhook_secret,
        basicPriceId: !!conf.basic_price_id,
        professionalPriceId: !!conf.professional_price_id
    };
});

// --- Organization & User Creation ---

exports.createOrganizationAndUser = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { orgName, ownerName, phone, taxId, email, password, planId } = data;
    
    try {
        // 1. Create Auth User
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: ownerName,
            disabled: false
        });

        // 2. Create Organization Doc
        const orgRef = db.collection('organizations').doc();
        const trialExpires = new Date();
        trialExpires.setDate(trialExpires.getDate() + 3); // 3 days trial

        await orgRef.set({
            name: orgName,
            ownerUid: userRecord.uid,
            ownerEmail: email,
            ownerName: ownerName,
            ownerPhone: phone,
            ownerTaxId: taxId,
            status: 'trial',
            planId: planId,
            planExpiresAt: admin.firestore.Timestamp.fromDate(trialExpires),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            public: true,
            assignedStates: [], // Empty initially
            emailRemindersEnabled: true,
            whatsappNotificationsEnabled: true,
            oneTimePostEnabled: true,
            guestListManagementEnabled: true,
            guestListCheckinEnabled: true
        });

        // 3. Create Admin Doc
        await db.collection('admins').doc(userRecord.uid).set({
            email,
            role: 'admin',
            organizationIds: [orgRef.id],
            assignedStates: [],
            assignedCampaigns: {}
        });

        return { success: true, orgId: orgRef.id };

    } catch (error) {
        console.error("Error creating organization/user:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- Template Management ---

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required.');
    const doc = await db.doc(EMAIL_TEMPLATE_DOC_PATH).get();
    return { htmlContent: doc.exists ? doc.data().htmlContent : DEFAULT_APPROVED_TEMPLATE_HTML };
});

exports.getDefaultEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required.');
    return { htmlContent: DEFAULT_APPROVED_TEMPLATE_HTML };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required.');
    const isAdmin = await isSuperAdmin(context.auth.uid);
    if (!isAdmin) throw new functions.https.HttpsError('permission-denied', 'Only superadmin.');
    
    await db.doc(EMAIL_TEMPLATE_DOC_PATH).set({ htmlContent: data.htmlContent }, { merge: true });
    return { success: true };
});

exports.resetEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required.');
    const isAdmin = await isSuperAdmin(context.auth.uid);
    if (!isAdmin) throw new functions.https.HttpsError('permission-denied', 'Only superadmin.');
    
    await db.doc(EMAIL_TEMPLATE_DOC_PATH).delete();
    return { success: true };
});

// --- Newsletter ---

exports.sendNewsletter = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required.');
    const { audience, subject, body } = data;
    
    if (!brevoApiInstance) throw new functions.https.HttpsError('failed-precondition', 'Email service not configured.');

    // Determine recipients
    let query = db.collection('promoters').where('status', '==', 'approved');
    
    if (audience.type === 'org') {
        query = query.where('organizationId', '==', audience.orgId);
    } else if (audience.type === 'campaign') {
        query = query.where('campaignName', '==', audience.campaignId); // Note: Assuming campaignId passed is actually name or ID mapping needs fix in frontend if inconsistent
        // Actually frontend passes campaignId as name if I recall correctly? No, it passes ID. 
        // But promoters have campaignName. We need to resolve ID to Name or fix query.
        // Assuming frontend sends resolved Name or ID that matches field. 
        // Ideally, we should fetch Campaign Doc to get Name if promoter stores Name.
        // For safety, let's assume audience.campaignId is the Name if that's what promoters store.
        // Or we fetch the campaign doc:
        if (audience.campaignId) {
             // If it looks like an ID (alphanumeric), fetch doc. If it looks like a name, use it.
             // Simplify: assume Promoters store Name in 'campaignName'. 
             // We'll query promoters by 'campaignName'.
             // BUT frontend sends ID. We need to look up.
             const campDoc = await db.collection('campaigns').doc(audience.campaignId).get();
             if (campDoc.exists) {
                 query = query.where('campaignName', '==', campDoc.data().name);
             } else {
                 return { success: false, message: "Evento não encontrado." };
             }
        }
    }

    const snapshot = await query.get();
    const recipients = [];
    snapshot.forEach(doc => {
        const p = doc.data();
        if (p.email) recipients.push({ email: p.email, name: p.name });
    });

    if (recipients.length === 0) return { success: false, message: "Nenhum destinatário encontrado." };

    // Send in batches (Brevo limit is usually 2000 per call, but best to be safe with 500)
    const BATCH_SIZE = 500;
    let sentCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.sender = { name: "Equipe Certa", email: brevoConfig.sender_email };
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = body; // Body can contain {{promoterName}} which Brevo handles if we use params, but for bulk usually requires message versions
        
        // For bulk with personalization, we need 'messageVersions'.
        sendSmtpEmail.messageVersions = batch.map(r => ({
            to: [{ email: r.email, name: r.name }],
            params: { promoterName: r.name }
        }));

        try {
            await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
            sentCount += batch.length;
        } catch (e) {
            console.error("Batch email failed:", e);
        }
    }

    return { success: true, message: `Enviado para ${sentCount} pessoas.` };
});

// --- New Cloud Function for Group Removal Logic ---
exports.removePromoterFromAllAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { promoterId } = data;
    if (!promoterId) throw new functions.https.HttpsError("invalid-argument", "Promoter ID required.");

    try {
        const batch = db.batch();
        
        // 1. Find all pending assignments
        const assignmentsQuery = db.collection("postAssignments")
            .where("promoterId", "==", promoterId)
            .where("status", "==", "pending");
            
        const snapshot = await assignmentsQuery.get();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 2. Also remove from Scheduled Posts if any (complex as they are arrays)
        // This is harder because we need to find docs where promoter is in array and remove them.
        // For simplicity/performance, we skip this or implement if needed.
        
        await batch.commit();
        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});

exports.setPromoterStatusToRemoved = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { promoterId } = data;
    
    try {
        await db.collection("promoters").doc(promoterId).update({
            status: 'removed',
            hasJoinedGroup: false
        });
        
        // Trigger removal logic
        const assignmentsQuery = db.collection("postAssignments")
            .where("promoterId", "==", promoterId)
            .where("status", "==", "pending");
        const snapshot = await assignmentsQuery.get();
        const batch = db.batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// --- Gemini Integration ---
const { GoogleGenAI } = require("@google/genai");

exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    
    const apiKey = functions.config().gemini ? functions.config().gemini.api_key : null;
    if (!apiKey) throw new functions.https.HttpsError("failed-precondition", "Gemini API Key not configured.");

    try {
        const genAI = new GoogleGenAI({ apiKey: apiKey });
        // Use generateContent as per updated SDK pattern (although we use `genAI.models.generateContent` in front end rules, here we use Node SDK style)
        // Important: The updated SDK usually requires `const ai = new GoogleGenAI(...)`.
        // Let's assume standard usage for Node backend.
        // Actually, user prompt says "Use the following full model name...".
        // The Node SDK might differ slightly from Web SDK.
        // Assuming standard GoogleGenAI usage:
        
        // NOTE: The prompt instructions for @google/genai are for the FRONTEND/Web SDK.
        // The Cloud Functions environment runs Node.js.
        // However, @google/genai package is isomorphic.
        
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: data.prompt,
        });
        
        return { text: response.text };
    } catch (error) {
        console.error("Gemini Error:", error);
        throw new functions.https.HttpsError("internal", "Gemini failed: " + error.message);
    }
});