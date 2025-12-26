const admin = require("firebase-admin");
const functions = require("firebase-functions");
const SibApiV3Sdk = require("@getbrevo/brevo");

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- UTILITÁRIO DE CONFIGURAÇÃO ---
const getConfig = () => {
    const config = functions.config();
    return {
        brevoKey: config.brevo?.key || null,
        // Forçamos o uso do e-mail r3gb0b@gmail.com se não houver um e-mail específico configurado no ambiente
        brevoEmail: config.brevo?.email || "r3gb0b@gmail.com",
        zApiToken: config.zapi?.token || null,
        zApiInstance: config.zapi?.instance || null,
        zApiClientToken: config.zapi?.client_token || ""
    };
};

const setupBrevo = (apiKey) => {
    if (!apiKey) return null;
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

// --- FUNÇÃO PARA GERAR RODAPÉ DE REMOÇÃO ---
const getEmailFooter = (promoterId, orgId, campaignName) => {
    const leaveUrl = `https://divulgadoras.vercel.app/#/leave-group?promoterId=${promoterId}&orgId=${orgId}&campaignName=${encodeURIComponent(campaignName || 'Geral')}`;
    return `
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; font-family: sans-serif;">
            <p>Este e-mail foi enviado automaticamente pelo sistema Equipe Certa.</p>
            <p>Deseja sair desta equipe ou parar de receber notificações deste evento?</p>
            <a href="${leaveUrl}" style="color: #7e39d5; text-decoration: underline; font-weight: bold;">Clique aqui para solicitar a remoção do grupo</a>
        </div>
    `;
};

// --- NOTIFICAÇÃO DE APROVAÇÃO EM MASSA ---

exports.notifyApprovalBulk = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterIds } = data;
    if (!promoterIds || promoterIds.length === 0) return { success: false, message: "Lista vazia." };

    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);
    if (!brevo) return { success: false, message: "E-mail não configurado." };

    try {
        const snap = await db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", promoterIds).get();
        
        const emailPromises = snap.docs.map(async (doc) => {
            const p = doc.data();
            if (p.status !== 'approved') return;

            const firstName = p.name.split(' ')[0];
            const campaign = p.campaignName || "Equipe Geral";
            const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`;
            const footer = getEmailFooter(doc.id, p.organizationId, campaign);

            const htmlContent = `
                <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
                    <h2 style="color: #7e39d5;">Olá, ${firstName}! Boas notícias! 🚀</h2>
                    <p>Seu perfil foi <strong>aprovado</strong> para a equipe do evento: <strong>${campaign}</strong>.</p>
                    <p>Para começar, você precisa acessar o seu portal para ler as regras e entrar no grupo oficial de WhatsApp:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${portalLink}" style="background-color: #7e39d5; color: white; padding: 15px 25px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">ACESSAR MEU PORTAL AGORA</a>
                    </div>
                    <p>Caso o botão não funcione, copie o link abaixo:<br>${portalLink}</p>
                    <p>Seja bem-vinda à equipe!</p>
                    ${footer}
                </div>
            `;

            return brevo.sendTransacEmail({
                sender: { email: config.brevoEmail, name: "Equipe Certa" },
                to: [{ email: p.email, name: p.name }],
                subject: `✅ Seu cadastro foi aprovado: ${campaign}`,
                htmlContent: htmlContent
            });
        });

        await Promise.all(emailPromises);
        return { success: true, message: `${snap.size} e-mails de notificação enviados.` };
    } catch (error) {
        console.error("Erro no notifyApprovalBulk:", error);
        return { success: false, message: error.message };
    }
});

// --- PERSISTÊNCIA E SINCRONIZAÇÃO (Inclui aviso de correção) ---

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);
    
    try {
        const promoterRef = db.collection("promoters").doc(promoterId);
        const oldDoc = await promoterRef.get();
        if (!oldDoc.exists) return { success: false, message: "Divulgadora não encontrada." };
        const p = oldDoc.data();

        await promoterRef.update({ 
            ...updateData, 
            statusChangedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        // Enviar e-mail de "Ajuste Necessário" se o status for rejected_editable
        if (updateData.status === 'rejected_editable' && brevo) {
            const firstName = p.name.split(' ')[0];
            const campaign = p.campaignName || "Equipe Geral";
            const reason = updateData.rejectionReason || "Informações inconsistentes ou fotos inadequadas.";
            const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`;
            
            const htmlContent = `
                <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
                    <h2 style="color: #e67e22;">Olá, ${firstName}! Precisamos de um ajuste no seu cadastro. ⚠️</h2>
                    <p>Analisamos seu perfil para o evento <strong>${campaign}</strong> e notamos que alguns dados precisam ser corrigidos para seguirmos com a aprovação.</p>
                    <div style="background-color: #fef5e7; border-left: 4px solid #e67e22; padding: 15px; margin: 20px 0;">
                        <strong>Motivo informado pela coordenação:</strong><br>
                        <em style="color: #666;">"${reason}"</em>
                    </div>
                    <p>Por favor, acesse seu portal para editar seus dados e reenviar para análise:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${portalLink}" style="background-color: #e67e22; color: white; padding: 15px 25px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">CORRIGIR MEU CADASTRO</a>
                    </div>
                    <p>Aguardamos seu reenvio!</p>
                </div>
            `;

            await brevo.sendTransacEmail({
                sender: { email: config.brevoEmail, name: "Equipe Certa" },
                to: [{ email: p.email, name: p.name }],
                subject: `⚠️ Ajuste necessário no seu cadastro: ${campaign}`,
                htmlContent: htmlContent
            });
        }

        return { success: true };
    } catch (error) {
        console.error("Erro no updatePromoterAndSync:", error);
        return { success: false, message: error.message };
    }
});

exports.savePromoterToken = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, token, metadata } = data;
    if (!promoterId || !token) return { success: false, message: "Dados incompletos." };

    try {
        const promoterRef = db.collection("promoters").doc(promoterId);
        await promoterRef.update({
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
            pushDiagnostics: {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                platform: metadata?.platform || "unknown",
                tokenPrefix: token.substring(0, 10),
                syncMethod: metadata?.method || "standard"
            }
        });
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

exports.sendNewsletter = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { audience, subject, body } = data;
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);

    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "Brevo não configurado.");

    try {
        let query = db.collection("promoters").where("status", "==", "approved");
        const snap = await query.get();
        if (snap.empty) return { success: false, message: "Nenhum destinatário." };

        const emailPromises = snap.docs.map(doc => {
            const p = doc.data();
            const personalFooter = getEmailFooter(doc.id, p.organizationId, p.campaignName);
            const personalizedBody = body.replace(/{{promoterName}}/g, p.name) + personalFooter;

            return brevo.sendTransacEmail({
                sender: { email: config.brevoEmail, name: "Equipe Certa" },
                to: [{ email: p.email, name: p.name }],
                subject: subject,
                htmlContent: personalizedBody
            });
        });

        await Promise.all(emailPromises);
        return { success: true, message: `E-mails enviados.` };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

exports.getEmailTemplate = functions.region("southamerica-east1").https.onCall(async () => {
    const doc = await db.collection("settings").doc("emailTemplate").get();
    return { htmlContent: doc.exists ? doc.data().htmlContent : "<h1>Padrão</h1>" };
});

exports.setEmailTemplate = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    await db.collection("settings").doc("emailTemplate").set({ htmlContent: data.htmlContent });
    return { success: true };
});

exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const config = getConfig();
    if (!config.zApiToken || !config.zApiInstance) return { success: false, message: "Configuração ausente." };
    try {
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstance}/token/${config.zApiToken}/send-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'client-token': config.zApiClientToken },
            body: JSON.stringify({ phone: "5585982280780", message: "🛠️ Teste WhatsApp ativo." })
        });
        return { success: response.ok };
    } catch (error) {
        return { success: false };
    }
});

exports.notifyPostPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId, onlyPending } = data;
    
    const postSnap = await db.collection("posts").doc(postId).get();
    if (!postSnap.exists) return { success: false, message: "Post não encontrado." };
    const post = postSnap.data();

    const assignmentsSnap = await db.collection("postAssignments")
        .where("postId", "==", postId)
        .get();

    const tokens = [];
    const assignments = assignmentsSnap.docs.map(doc => doc.data());
    
    const targetPromoterIds = assignments
        .filter(a => !onlyPending || (!a.proofSubmittedAt && !a.justification))
        .map(a => a.promoterId);

    if (targetPromoterIds.length === 0) return { success: true, message: "Nenhuma divulgadora alvo encontrada." };

    for (let i = 0; i < targetPromoterIds.length; i += 30) {
        const chunk = targetPromoterIds.slice(i, i + 30);
        const pSnap = await db.collection("promoters").where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
        pSnap.docs.forEach(doc => {
            const p = doc.data();
            if (p.fcmToken) tokens.push(p.fcmToken);
        });
    }

    if (tokens.length === 0) return { success: true, message: "Nenhum dispositivo móvel vinculado encontrado." };

    const message = {
        notification: {
            title: `📢 Nova Postagem: ${post.campaignName}`,
            body: `Uma nova tarefa foi atribuída a você. Clique para ver as instruções.`
        },
        data: { url: "/#/posts" },
        tokens: tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    return { success: true, message: `Notificação enviada para ${response.successCount} dispositivos.` };
});

exports.notifyPostEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId } = data;
    const config = getConfig();
    const brevo = setupBrevo(config.brevoKey);
    if (!brevo) throw new functions.https.HttpsError("failed-precondition", "Brevo não configurado.");

    const postSnap = await db.collection("posts").doc(postId).get();
    if (!postSnap.exists) return { success: false, message: "Post não encontrado." };
    const post = postSnap.data();

    const assignmentsSnap = await db.collection("postAssignments")
        .where("postId", "==", postId)
        .get();

    const pendingPromoters = [];
    assignmentsSnap.docs.forEach(doc => {
        const a = doc.data();
        if (!a.proofSubmittedAt && !a.justification) {
            pendingPromoters.push({ email: a.promoterEmail, name: a.promoterName });
        }
    });

    if (pendingPromoters.length === 0) return { success: true, message: "Nenhuma divulgadora pendente encontrada." };

    try {
        await brevo.sendTransacEmail({
            sender: { email: config.brevoEmail, name: "Equipe Certa" },
            to: pendingPromoters,
            subject: `📢 Nova Postagem: ${post.campaignName}`,
            htmlContent: `
                <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 15px;">
                    <h2 style="color: #7e39d5;">Olá! Temos uma nova tarefa para você.</h2>
                    <p>Uma nova postagem para o evento <strong>${post.campaignName}</strong> foi solicitada e aguarda sua confirmação no portal.</p>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 10px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #666;"><strong>Instruções do Organizador:</strong></p>
                        <p style="margin: 10px 0 0 0; font-style: italic;">"${post.instructions}"</p>
                    </div>
                    <p>Acesse seu portal agora para baixar o material e realizar a postagem:</p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="https://divulgadoras.vercel.app/#/status" 
                           style="display: inline-block; padding: 15px 35px; background: #7e39d5; color: white; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(126, 57, 213, 0.3);">
                           ACESSAR MEU PORTAL
                        </a>
                    </div>
                    <p style="font-size: 12px; color: #999; margin-top: 40px; text-align: center;">Este é um e-mail automático do sistema Equipe Certa.</p>
                </div>
            `
        });
        return { success: true, message: `E-mails enviados para ${pendingPromoters.length} divulgadoras.` };
    } catch (err) {
        console.error("Brevo Post Notification Error:", err);
        return { success: false, message: err.message };
    }
});
