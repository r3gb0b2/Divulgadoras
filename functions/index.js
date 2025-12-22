
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sib = require("@getbrevo/brevo");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Brevo Configuration ---
const setupBrevo = () => {
    const config = functions.config().brevo;
    const key = config ? config.key : null;
    
    if (!key) {
        console.warn("Brevo API Key não configurada no Firebase Config.");
        return null;
    }

    // Configuração correta para o SDK do Brevo (@getbrevo/brevo)
    const defaultClient = sib.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = key;

    return new sib.TransactionalEmailsApi();
};

const brevoApi = setupBrevo();

// Helper: Send Email via Brevo
async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!brevoApi) {
        console.error("Tentativa de envio de e-mail falhou: Brevo API não inicializada.");
        return { success: false, message: "API Key missing" };
    }
    try {
        const email = new sib.SendSmtpEmail();
        email.sender = { name: "Equipe Certa", email: "contato@equipecerta.com.br" };
        email.to = [{ email: toEmail, name: toName }];
        email.subject = subject;
        email.htmlContent = htmlContent;
        await brevoApi.sendTransacEmail(email);
        return { success: true };
    } catch (e) {
        console.error("Erro ao enviar e-mail via Brevo:", e.response ? e.response.body : e.message);
        return { success: false, error: e.message };
    }
}

// --- Cloud Messaging (Push Notifications) ---

exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token } = data;
    
    if (!promoterId || !token) {
        throw new functions.https.HttpsError("invalid-argument", "ID da divulgadora e token são obrigatórios.");
    }

    try {
        const docRef = db.collection('promoters').doc(promoterId);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new functions.https.HttpsError("not-found", "Perfil da divulgadora não encontrado.");
        }

        await docRef.update({
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
            // Registra um diagnóstico simples para o Admin
            pushDiagnostics: {
                lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
                tokenLength: token.length,
                status: 'active'
            }
        });

        return { success: true, message: "Token FCM vinculado com sucesso." };
    } catch (e) {
        console.error("Erro ao salvar token push:", e.message);
        throw new functions.https.HttpsError("internal", "Erro ao gravar no banco: " + e.message);
    }
});

// --- EMAIL TRIGGERS ---

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId, data: updateData } = data;

    try {
        const promoterRef = db.collection('promoters').doc(promoterId);
        const snapshot = await promoterRef.get();
        if (!snapshot.exists) throw new functions.https.HttpsError("not-found", "Promoter not found");
        const promoter = snapshot.data();

        await promoterRef.update(updateData);

        if (updateData.status === 'approved' && promoter.status !== 'approved') {
            const orgSnap = await db.collection('organizations').doc(promoter.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };
            
            // Pega o nome do evento cadastrado
            const eventName = promoter.campaignName || "nosso banco de talentos";

            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 30px; border-radius: 15px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h1 style="color: #7e39d5; margin: 0;">Parabéns, ${promoter.name}!</h1>
                        <p style="font-size: 18px; color: #444;">Você foi aprovada na equipe <strong>${org.name}</strong>!</p>
                    </div>
                    
                    <div style="background-color: #f8f4ff; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #e5d5ff; margin-bottom: 25px;">
                        <p style="margin: 0; color: #5d1eab; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Evento Selecionado</p>
                        <p style="margin: 5px 0 0 0; font-size: 22px; color: #1a1a1a; font-weight: 800;">${eventName}</p>
                    </div>

                    <p style="color: #666; line-height: 1.6;">Agora você já pode acessar seu portal exclusivo para visualizar tarefas, baixar mídias de postagem e enviar seus nomes para as listas VIP.</p>
                    
                    <div style="text-align: center; margin: 35px 0;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${promoter.email}" style="background-color: #7e39d5; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(126, 57, 213, 0.3);">ACESSAR MEU PORTAL</a>
                    </div>
                    
                    <p style="color: #999; font-size: 11px; text-align: center; border-top: 1px solid #eee; pt: 20px; margin-top: 30px;">Equipe Certa &copy; ${new Date().getFullYear()} - Sistema Profissional de Gestão de Eventos</p>
                </div>
            `;

            await sendEmail({
                toEmail: promoter.email,
                toName: promoter.name,
                subject: `Seu cadastro na ${org.name} para o evento ${eventName} foi aprovado! 🎉`,
                htmlContent: html
            });
        }

        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postData, assignedPromoters } = data;

    try {
        const postRef = await db.collection('posts').add({
            ...postData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const postId = postRef.id;

        const batch = db.batch();
        assignedPromoters.forEach(p => {
            const assignmentRef = db.collection('postAssignments').doc();
            batch.set(assignmentRef, {
                postId,
                post: postData,
                promoterId: p.id,
                promoterEmail: p.email,
                promoterName: p.name,
                organizationId: postData.organizationId,
                status: 'pending',
                confirmedAt: null,
                proofSubmittedAt: null
            });
        });
        await batch.commit();

        if (assignedPromoters.length > 0) {
            const orgSnap = await db.collection('organizations').doc(postData.organizationId).get();
            const org = orgSnap.data() || { name: "Equipe Certa" };

            assignedPromoters.forEach(async (p) => {
                const html = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                        <h2 style="color: #7e39d5;">Nova tarefa de divulgação! 🚀</h2>
                        <p>Olá <strong>${p.name}</strong>,</p>
                        <p>Um novo post foi liberado para você na equipe <strong>${org.name}</strong>.</p>
                        <p>Evento: <strong>${postData.campaignName}</strong></p>
                        <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #7e39d5; margin: 20px 0;">
                            ${postData.instructions}
                        </div>
                        <p>Acesse seu portal agora para baixar a mídia e confirmar sua postagem.</p>
                        <a href="https://divulgadoras.vercel.app/#/posts?email=${p.email}" style="color: #7e39d5; font-weight: bold; text-decoration: underline;">VER MEUS POSTS</a>
                    </div>
                `;
                await sendEmail({
                    toEmail: p.email,
                    toName: p.name,
                    subject: `Nova postagem: ${postData.campaignName}`,
                    htmlContent: html
                });
            });
        }

        return { success: true, postId };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});
