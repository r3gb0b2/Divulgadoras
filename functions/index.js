
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
                            console.log(`[WhatsApp Post] Iniciando envio para ${promoterData.name} (Tipo: ${post.type})`);
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
        const linkLabel = postData.type === 'text' ? 'Link para Interação' : 'Link do Post';
        caption += `🔗 *${linkLabel}:* ${postData.postLink}\n\n`;
    }

    caption += `👇 *PARA CONFIRMAR E ENVIAR O PRINT:* 👇\n${portalLink}\n\n`;
    caption += `⚠️ *Não faz parte ou não tem interesse?*\nSolicite a remoção aqui: ${leaveGroupLink}`;

    // 4. Definição do Tipo de Envio
    let endpoint = 'send-text';
    let body = { phone: cleanPhone, message: caption };

    // Important: Determine if media should be sent or just text
    // Only resolve media if type is explicitly image or video. Interaction (text) posts are just text.
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
                console.log(`[Z-API Post] Mídia resolvida para ${postData.type}: ${mediaUrl.substring(0, 50)}...`);
            } else {
                console.log(`[Z-API Post] Mídia não encontrada/resolvida para post tipo ${postData.type}. Enviando apenas texto.`);
            }
        } catch (mediaError) {
            console.error(`[Z-API Post Warning] Erro ao resolver mídia: ${mediaError}. Enviando apenas texto.`);
            // Ensure we fall back to text body
            endpoint = 'send-text';
            body = { phone: cleanPhone, message: caption };
        }
    } else {
        console.log(`[Z-API Post] Tipo do post é '${postData.type}'. Enviando como texto.`);
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
        throw new functions.https.HttpsError("failed-precondition", "Z-API not configured.");
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
