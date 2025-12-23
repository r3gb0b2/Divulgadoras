
/**
 * Import and initialize the Firebase Admin SDK.
 */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sib = require("@getbrevo/brevo");
const { GoogleGenAI } = require("@google/genai");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// --- Gemini API Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- WhatsApp Helper (Z-API) ---
/**
 * Garante que o número esteja no formato 55DD999998888
 */
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    if (cleaned.length === 10 || cleaned.length === 11) {
        cleaned = '55' + cleaned;
    }
    return cleaned;
}

/**
 * Envia mensagem via Z-API
 */
async function sendWhatsApp(to, message) {
    const phone = normalizePhoneNumber(to);
    if (!phone) {
        return { success: false, message: "Número de telefone inválido." };
    }
    const zapiConfig = functions.config().zapi || {};
    const instance = zapiConfig.instance || process.env.ZAPI_INSTANCE;
    const token = zapiConfig.token || process.env.ZAPI_TOKEN;

    if (!instance || !token) {
        console.error("[WhatsApp Erro] Chaves Z-API não encontradas no servidor.");
        return { success: false, message: "Credenciais (ID/Token) não configuradas no Firebase." };
    }

    const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone, message: message })
        });
        const data = await response.json();
        if (response.ok) return { success: true, data };
        else return { success: false, message: data.message || "Erro na Z-API", raw: data };
    } catch (error) {
        return { success: false, message: "Falha de conexão com o servidor da Z-API." };
    }
}

// --- Brevo Configuration ---
const setupBrevo = () => {
    const key = (functions.config().brevo ? functions.config().brevo.key : null) || process.env.BREVO_API_KEY;
    if (!key) return null;
    const defaultClient = sib.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = key;
    return new sib.TransactionalEmailsApi();
};

const brevoApi = setupBrevo();

async function sendEmail({ toEmail, toName, subject, htmlContent }) {
    if (!brevoApi) return { success: false, message: "Configuração de e-mail ausente." };
    try {
        const email = new sib.SendSmtpEmail();
        email.sender = { name: "Equipe Certa", email: "contato@equipecerta.com.br" };
        email.to = [{ email: toEmail, name: toName }];
        email.subject = subject;
        email.htmlContent = htmlContent;
        await brevoApi.sendTransacEmail(email);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- Cloud Functions ---

/**
 * Altera o e-mail de uma divulgadora e sincroniza em todos os documentos vinculados
 */
exports.updatePromoterEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, oldEmail, newEmail } = data;
    if (!promoterId || !oldEmail || !newEmail) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    const emailLower = newEmail.toLowerCase().trim();

    try {
        // 1. Verifica se o novo e-mail já está em uso em outro perfil (mesma org)
        const pDoc = await db.collection('promoters').doc(promoterId).get();
        if (!pDoc.exists) throw new Error("Perfil não encontrado.");
        const orgId = pDoc.data().organizationId;

        const checkEmail = await db.collection('promoters')
            .where('email', '==', emailLower)
            .where('organizationId', '==', orgId)
            .limit(1).get();
        
        if (!checkEmail.empty) throw new Error("Este novo e-mail já possui um cadastro nesta organização.");

        const batch = db.batch();

        // 2. Atualiza documento principal da divulgadora
        batch.update(db.collection('promoters').doc(promoterId), { email: emailLower });

        // 3. Atualiza todas as postagens (assignments) associadas
        const assignments = await db.collection('postAssignments').where('promoterEmail', '==', oldEmail).get();
        assignments.forEach(doc => {
            batch.update(doc.ref, { promoterEmail: emailLower });
        });

        // 4. Atualiza todas as confirmações de lista de convidados
        const confirmations = await db.collection('guestListConfirmations').where('promoterEmail', '==', oldEmail).get();
        confirmations.forEach(doc => {
            batch.update(doc.ref, { promoterEmail: emailLower });
        });

        // 5. Atualiza solicitações de remoção de grupo
        const removals = await db.collection('groupRemovalRequests').where('promoterEmail', '==', oldEmail).get();
        removals.forEach(doc => {
            batch.update(doc.ref, { promoterEmail: emailLower });
        });

        await batch.commit();
        return { success: true, message: "E-mail atualizado com sucesso em todos os registros." };

    } catch (e) {
        console.error("ERRO updatePromoterEmail:", e.message);
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.testWhatsAppIntegration = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const zapiConfig = functions.config().zapi || {};
    const instance = zapiConfig.instance || "NÃO CONFIGURADO";
    const token = zapiConfig.token ? "CONFIGURADO (Oculto)" : "NÃO CONFIGURADO";
    const testResult = await sendWhatsApp("5585982280780", "Teste de integração Equipe Certa. Se recebeu isso, está tudo OK! ✅");
    return { instanceId: instance, tokenStatus: token, result: testResult };
});

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId, data: updateData } = data;
    try {
        const promoterRef = db.collection('promoters').doc(promoterId);
        const snapshot = await promoterRef.get();
        if (!snapshot.exists) throw new Error("Promoter not found");
        const oldData = snapshot.data();
        if (updateData.status && updateData.status !== oldData.status) {
            updateData.statusChangedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        await promoterRef.update(updateData);
        if (updateData.status === 'approved' && oldData.status !== 'approved') {
            let orgName = "Equipe Certa";
            if (oldData.organizationId) {
                const orgSnap = await db.collection('organizations').doc(oldData.organizationId).get();
                if (orgSnap.exists) orgName = orgSnap.data().name || orgName;
            }
            await sendEmail({
                toEmail: oldData.email, toName: oldData.name, subject: `Parabéns! Seu cadastro na ${orgName} foi aprovado! 🎉`,
                htmlContent: `<div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;"><h2>Olá ${oldData.name}!</h2><p>Seu cadastro foi <b>APROVADO</b>. Acesse seu portal para começar:</p><p><a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(oldData.email)}" style="background:#7e39d5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Acessar Portal</a></p></div>`
            });
            const phone = updateData.whatsapp || oldData.whatsapp;
            if (phone) {
                const msg = `Olá *${oldData.name.split(' ')[0]}*! Seu cadastro na equipe *${orgName}* foi APROVADO! 🎉\n\nAcesse seu portal para ver tarefas e materiais:\nhttps://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(oldData.email)}`;
                await sendWhatsApp(phone, msg);
            }
        }
        return { success: true };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.manuallySendStatusEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId } = data;
    try {
        const pSnap = await db.collection('promoters').doc(promoterId).get();
        if (!pSnap.exists) throw new Error("Promoter not found");
        const p = pSnap.data();
        let orgName = "Equipe Certa";
        if (p.organizationId) {
            const orgSnap = await db.collection('organizations').doc(p.organizationId).get();
            if (orgSnap.exists) orgName = orgSnap.data().name || orgName;
        }
        const html = `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px;"><h2 style="color:#7e39d5;">Olá, ${p.name}!</h2><p>Lembrete: seu acesso ao portal da equipe <b>${orgName}</b> está liberado.</p><p><a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="background:#7e39d5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;">Acessar Meu Portal</a></p></div>`;
        const emailRes = await sendEmail({ toEmail: p.email, toName: p.name, subject: `Lembrete: Seu acesso está liberado! - ${orgName}`, htmlContent: html });
        let waStatus = "Não enviado (sem número)";
        if (p.whatsapp) {
            const waMsg = `Olá *${p.name.split(' ')[0]}*! Passando para lembrar que seu acesso à equipe *${orgName}* está liberado. 🎉\n\nAcompanhe tudo por aqui:\nhttps://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`;
            const waRes = await sendWhatsApp(p.whatsapp, waMsg);
            waStatus = waRes.success ? "Sucesso" : `Falha (${waRes.message})`;
        }
        return { success: true, message: `Notificações processadas. E-mail: ${emailRes.success ? 'OK' : 'Falha'}. WhatsApp: ${waStatus}` };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.onPromoterCreate = functions.region("southamerica-east1").firestore.document('promoters/{promoterId}').onCreate(async (snap, context) => {
    const p = snap.data();
    const html = `<div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;"><h2 style="color:#7e39d5;">Olá, ${p.name}!</h2><p>Recebemos sua inscrição para a equipe <b>${p.campaignName || 'Geral'}</b>. Seu perfil passará por análise.</p><p>Boa sorte! 🚀</p></div>`;
    return sendEmail({ toEmail: p.email, toName: p.name, subject: `Recebemos seu cadastro! - ${p.campaignName || 'Equipe Certa'}`, htmlContent: html });
});

exports.sendWhatsAppCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { messageTemplate, filters } = data;
    const promoterIds = filters.promoterIds || [];
    if (promoterIds.length === 0) return { success: false, message: "Nenhum destinatário." };
    let count = 0; let failures = 0;
    try {
        const snap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds).get();
        const promises = snap.docs.map(doc => {
            const p = doc.data();
            const personalizedMsg = messageTemplate.replace(/{{name}}/g, p.name.split(' ')[0]).replace(/{{fullName}}/g, p.name).replace(/{{email}}/g, p.email).replace(/{{campaignName}}/g, p.campaignName || 'Eventos').replace(/{{portalLink}}/g, `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`);
            return sendWhatsApp(p.whatsapp, personalizedMsg);
        });
        const results = await Promise.all(promises);
        results.forEach(res => res.success ? count++ : failures++);
        return { success: true, count, failures, message: `Campanha processada: ${count} envios, ${failures} falhas.` };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.notifyPostPush = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    try {
        const postSnap = await db.collection('posts').doc(postId).get();
        if (!postSnap.exists) return { success: false, message: "Post não encontrado" };
        const post = postSnap.data();
        const assignmentsSnap = await db.collection('postAssignments').where('postId', '==', postId).get();
        const promoterIds = assignmentsSnap.docs.map(doc => doc.data().promoterId);
        if (promoterIds.length === 0) return { success: true, message: "Nenhuma divulgadora para notificar." };
        const tokens = [];
        const promotersSnap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds.slice(0, 10)).get();
        promotersSnap.forEach(doc => { const p = doc.data(); if (p.fcmToken) tokens.push(p.fcmToken); });
        if (tokens.length > 0) {
            const message = { notification: { title: `Nova Tarefa: ${post.campaignName}`, body: `Uma nova postagem foi liberada. Acesse agora para baixar o material!` }, data: { url: "/#/posts" }, tokens: tokens };
            const response = await admin.messaging().sendEachForMulticast(message);
            return { success: true, message: `Push enviado para ${response.successCount} aparelhos.` };
        }
        return { success: true, message: "Nenhum aparelho com App vinculado encontrado." };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { title, body, url, promoterIds } = data;
    try {
        const tokens = [];
        const snap = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds).get();
        snap.forEach(doc => { if (doc.data().fcmToken) tokens.push(doc.data().fcmToken); });
        if (tokens.length === 0) return { success: false, message: "Nenhum token encontrado." };
        const message = { notification: { title, body }, data: { url: url || "/#/posts" }, tokens: tokens };
        const response = await admin.messaging().sendEachForMulticast(message);
        return { success: true, message: `Enviado com sucesso para ${response.successCount} aparelhos.` };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.acceptAllJustifications = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    try {
        const snap = await db.collection('postAssignments').where('postId', '==', postId).where('justificationStatus', '==', 'pending').get();
        const batch = db.batch();
        snap.forEach(doc => { batch.update(doc.ref, { justificationStatus: 'accepted' }); });
        await batch.commit();
        return { success: true, count: snap.size, message: `${snap.size} justificativas aceitas.` };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId, promoterIds } = data;
    try {
        const postSnap = await db.collection('posts').doc(postId).get();
        const post = postSnap.data();
        const batch = db.batch();
        const pSnaps = await db.collection('promoters').where(admin.firestore.FieldPath.documentId(), 'in', promoterIds).get();
        pSnaps.forEach(pDoc => { const p = pDoc.data(); const ref = db.collection('postAssignments').doc(); batch.set(ref, { postId, post, promoterId: pDoc.id, promoterEmail: p.email, promoterName: p.name, organizationId: post.organizationId, status: 'pending', confirmedAt: null, proofSubmittedAt: null, createdAt: admin.firestore.FieldValue.serverTimestamp() }); });
        await batch.commit();
        return { success: true };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postData, assignedPromoters } = data;
    try {
        const postRef = await db.collection('posts').add({ ...postData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        const batch = db.batch();
        assignedPromoters.forEach(p => { const assignmentRef = db.collection('postAssignments').doc(); batch.set(assignmentRef, { postId: postRef.id, post: postData, promoterId: p.id, promoterEmail: p.email, promoterName: p.name, organizationId: postData.organizationId, status: 'pending', confirmedAt: null, proofSubmittedAt: null, createdAt: admin.firestore.FieldValue.serverTimestamp() }); });
        await batch.commit();
        return { success: true, postId: postRef.id };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.deletePostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { postId } = data;
    try {
        const assignments = await db.collection('postAssignments').where('postId', '==', postId).get();
        const batch = db.batch();
        assignments.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('posts').doc(postId));
        await batch.commit();
        return { success: true };
    } catch (e) { throw new functions.https.HttpsError("internal", e.message); }
});

exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Apenas administradores podem usar a IA.");
    const { prompt } = data;
    try {
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        return { text: response.text };
    } catch (error) { throw new functions.https.HttpsError("internal", "Erro ao processar IA."); }
});
