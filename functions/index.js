
import admin from "firebase-admin";
import functions from "firebase-functions";
import SibApiV3Sdk from "@getbrevo/brevo";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

const getBrevoApi = () => {
    const config = functions.config();
    const apiKey = config.brevo?.key;
    if (!apiKey) {
        console.error("ERRO: API Key do Brevo não configurada.");
        return null;
    }
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    return apiInstance;
};

// REMETENTE OFICIAL
const SENDER_EMAIL = "contato@equipecerta.app";
const SENDER_NAME = "Equipe Certa";

async function sendSystemEmail(toEmail, subject, htmlContent) {
    const apiInstance = getBrevoApi();
    if (!apiInstance) return false;

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: SENDER_NAME, email: SENDER_EMAIL };
    sendSmtpEmail.to = [{ email: toEmail }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return true;
    } catch (error) {
        console.error(`[Email Error] ${toEmail}:`, JSON.stringify(error.response?.body || error.message));
        return false;
    }
}

// FUNÇÃO DE INTELIGÊNCIA ARTIFICIAL (GEMINI)
export const askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    try {
        const { prompt } = data;
        const apiKey = process.env.API_KEY;

        if (!prompt) {
            throw new functions.https.HttpsError('invalid-argument', 'O prompt é obrigatório.');
        }

        if (!apiKey) {
            throw new functions.https.HttpsError('failed-precondition', 'A chave de IA não foi configurada.');
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        return { text: response.text };
    } catch (e) {
        throw new functions.https.HttpsError('internal', e.message || 'Erro ao processar IA');
    }
});

// TRIGGER: Enviar e-mail de recebimento
export const onPromoterCreated = functions.region("southamerica-east1").firestore
    .document("promoters/{id}")
    .onCreate(async (snap, context) => {
        const p = snap.data();
        if (p.organizationId === 'club-vip-global' || p.campaignName === 'Membro Clube VIP') return;

        const html = `
            <div style="font-family:sans-serif; max-width:600px; padding:30px; border:1px solid #eee; border-radius:20px;">
                <h2 style="color:#7e39d5;">Recebemos seu cadastro! 📝</h2>
                <p>Olá <b>${p.name.split(' ')[0]}</b>, confirmamos o recebimento da sua inscrição para a equipe: <b>${p.campaignName || "Produção"}</b>.</p>
                <p>Seu perfil agora passará por uma análise. Você pode acompanhar o resultado no nosso site.</p>
                <div style="margin:30px 0; text-align:center;">
                    <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="background:#7e39d5; color:#fff; padding:15px 30px; text-decoration:none; border-radius:12px; font-weight:bold; display:inline-block;">VER MEU STATUS</a>
                </div>
                <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                <p style="font-size:11px; color:#999;">Equipe Certa - Gestão Profissional de Eventos</p>
            </div>`;
        
        return sendSystemEmail(p.email, "Cadastro Recebido: " + (p.campaignName || "Equipe"), html);
    });

// Notificação de Aprovação
export const notifyApprovalBulk = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterIds } = data;
    try {
        const promises = promoterIds.map(async (id) => {
            const snap = await db.collection("promoters").doc(id).get();
            if (!snap.exists) return;
            const p = snap.data();
            
            const html = `
                <div style="font-family:sans-serif; max-width:600px; padding:30px; border:1px solid #eee; border-radius:20px;">
                    <h2 style="color:#7e39d5;">Seu cadastro foi Aprovado! 🎉</h2>
                    <p>Olá <b>${p.name.split(' ')[0]}</b>, seu perfil foi aprovado para a equipe do evento: <b>${p.campaignName || "Produção"}</b>.</p>
                    <p>Acesse seu portal para visualizar tarefas e enviar seus prints.</p>
                    <div style="margin:30px 0; text-align:center;">
                        <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="background:#7e39d5; color:#fff; padding:15px 30px; text-decoration:none; border-radius:12px; font-weight:bold; display:inline-block;">ACESSAR MEU PORTAL</a>
                    </div>
                    <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                    <p style="font-size:11px; color:#999;">Equipe Certa - Gestão Profissional de Eventos</p>
                </div>`;
            
            return sendSystemEmail(p.email, `🎉 Cadastro Aprovado: ${p.campaignName || "Equipe"}`, html);
        });

        await Promise.all(promises);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * Função de Newsletter Otimizada para Grande Escala
 * Suporta envios de 2.000+ e-mails usando processamento em lotes (chunks)
 */
export const sendNewsletter = functions
    .runWith({ 
        timeoutSeconds: 540, // Aumentado para 9 minutos
        memory: '1GB'        // Aumentado para lidar com grandes listas em memória
    })
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        const { audience, subject, body } = data;
        
        try {
            let docs = [];
            
            // 1. Busca dos destinatários
            if (audience.type === 'individual' && audience.promoterIds && audience.promoterIds.length > 0) {
                const promises = audience.promoterIds.map(id => db.collection("promoters").doc(id).get());
                const snaps = await Promise.all(promises);
                docs = snaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
            } else {
                let query = db.collection("promoters");
                
                if (audience.status) {
                    query = query.where("status", "==", audience.status);
                } else {
                    query = query.where("status", "==", "approved");
                }

                if (audience.type === 'org' && audience.orgId) {
                    query = query.where("organizationId", "==", audience.orgId);
                } else if (audience.type === 'campaign' && audience.campaignName) {
                    query = query.where("campaignName", "==", audience.campaignName);
                    if (audience.orgId) query = query.where("organizationId", "==", audience.orgId);
                }
                
                const snap = await query.get();
                docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            if (docs.length === 0) {
                return { success: false, message: "Nenhum destinatário encontrado." };
            }

            // 2. Processamento em Lotes (Chunks) para evitar gargalos na API do Brevo e Rate Limiting
            const chunkSize = 50; // Grupos de 50 e-mails por vez
            let sentCount = 0;
            let failureCount = 0;

            for (let i = 0; i < docs.length; i += chunkSize) {
                const chunk = docs.slice(i, i + chunkSize);
                
                // Processa o lote atual em paralelo
                const results = await Promise.all(chunk.map(async (p) => {
                    const personalizedBody = body.replace(/{{promoterName}}/g, p.name.split(' ')[0]);
                    return sendSystemEmail(p.email, subject, personalizedBody);
                }));

                sentCount += results.filter(r => r === true).length;
                failureCount += results.filter(r => r === false).length;

                // Pequena pausa opcional entre lotes para estabilidade (200ms)
                await new Promise(resolve => setTimeout(resolve, 200));
                
                console.log(`[Newsletter Progress] Lote ${i/chunkSize + 1} enviado. Total acumulado: ${sentCount}`);
            }

            return { 
                success: true, 
                message: `Envio concluído. Sucesso: ${sentCount}, Falhas: ${failureCount}. Total: ${docs.length}` 
            };

        } catch (e) { 
            console.error("Erro fatal na função de newsletter:", e);
            return { success: false, error: e.message }; 
        }
    });

export const notifyPostEmail = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId } = data;
    try {
        const postSnap = await db.collection("posts").doc(postId).get();
        const post = postSnap.data();
        const assignmentsSnap = await db.collection("postAssignments").where("postId", "==", postId).where("status", "==", "pending").get();

        const promises = assignmentsSnap.docs.map(doc => {
            const a = doc.data();
            const html = `
                <div style="font-family:sans-serif; max-width:600px; padding:30px; border:1px solid #eee; border-radius:15px;">
                    <h2 style="color:#7e39d5;">Nova Publicação Disponível!</h2>
                    <p>Olá ${a.promoterName.split(' ')[0]}, uma nova tarefa foi designada no evento: <b>${post.campaignName}</b></p>
                    <a href="https://divulgadoras.vercel.app/#/posts" style="display:inline-block; background:#7e39d5; color:#fff; padding:15px 25px; text-decoration:none; border-radius:10px; font-weight:bold;">ACESSAR MEU PORTAL</a>
                </div>`;
            return sendSystemEmail(a.promoterEmail, `📢 Nova Publicação: ${post.campaignName}`, html);
        });
        await Promise.all(promises);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

export const notifyVipActivation = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId } = data;
    try {
        const snap = await db.collection("vipMemberships").doc(membershipId).get();
        const m = snap.data();
        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        const ev = eventSnap.data();
        const code = m.benefitCode || "VIP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!m.benefitCode) await snap.ref.update({ benefitCode: code });

        const html = `
            <div style="font-family:sans-serif; max-width:600px; padding:40px; border:2px solid #7e39d5; border-radius:20px; text-align:center;">
                <h2 style="color:#7e39d5;">Seu Ingresso Promocional Está Liberado! 🎟️</h2>
                <p>Olá <b>${m.promoterName}</b>, seu acesso VIP para o evento <b>${m.vipEventName}</b> foi confirmado!</p>
                <div style="background:#f9f9f9; padding:20px; border-radius:15px; margin:20px 0;">
                    <span style="font-size:10px; color:#999; display:block;">SEU CÓDIGO:</span>
                    <b style="font-size:28px; color:#7e39d5;">${code}</b>
                </div>
                <a href="https://stingressos.com.br/eventos/${ev?.externalSlug || ""}?cupom=${code}" style="display:block; background:#7e39d5; color:#fff; padding:18px; text-decoration:none; border-radius:12px; font-weight:bold;">RESGATAR AGORA</a>
            </div>`;
        return { success: await sendSystemEmail(m.promoterEmail, `🎟️ Ingresso Promocional Liberado: ${m.vipEventName}`, html) };
    } catch (e) { return { success: false, error: e.message }; }
});
