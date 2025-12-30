
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { MercadoPagoConfig, Payment } = require("mercadopago");

admin.initializeApp();
const db = admin.firestore();

// CONFIGURAÇÃO GLOBAL DO REMETENTE
const DEFAULT_SENDER = "Equipe Certa <contato@equipecerta.app>";

const getConfig = () => {
    const config = functions.config();
    return {
        mpAccessToken: config.mp?.token || null
    };
};

function generateAlphanumericCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Função utilitária centralizada para envio de e-mails via extensão Trigger Email
 */
async function sendSystemEmail(email, subject, html) {
    try {
        await db.collection("mail").add({
            to: email,
            message: {
                from: DEFAULT_SENDER,
                replyTo: DEFAULT_SENDER,
                subject: subject,
                html: html,
            }
        });
        console.log(`[Email] Enfileirado para ${email} via ${DEFAULT_SENDER}`);
        return true;
    } catch (e) {
        console.error("[Email] Erro ao enfileirar:", e);
        return false;
    }
}

// --- FUNÇÕES DE APROVAÇÃO DE DIVULGADORAS (EQUIPE) ---

exports.notifyApprovalBulk = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterIds } = data;
    if (!promoterIds || promoterIds.length === 0) return { success: false };

    const results = [];
    for (const id of promoterIds) {
        const snap = await db.collection("promoters").doc(id).get();
        if (snap.exists) {
            const p = snap.data();
            const html = `
                <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #eee;padding:20px;border-radius:15px;">
                    <h2 style="color:#7e39d5;">Seu cadastro foi aprovado! 🎉</h2>
                    <p>Olá <b>${p.name}</b>,</p>
                    <p>Você agora faz parte da nossa equipe oficial para o evento <b>${p.campaignName}</b>.</p>
                    <p>Acesse seu portal agora para ver suas tarefas e entrar no grupo:</p>
                    <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="display:inline-block;padding:15px 25px;background:#7e39d5;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">ACESSAR MEU PORTAL</a>
                    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
                    <p style="font-size:11px;color:#999;">Equipe Certa • Gestão de Equipes</p>
                </div>
            `;
            await sendSystemEmail(p.email, "Boas-vindas! Você foi aprovada na equipe!", html);
            results.push(id);
        }
    }
    return { success: true, notified: results.length };
});

exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { promoterId, data: updateData } = data;
    const ref = db.collection("promoters").doc(promoterId);
    
    await ref.update(updateData);

    // Se aprovou agora, envia e-mail automático
    if (updateData.status === 'approved') {
        const snap = await ref.get();
        const p = snap.data();
        const html = `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #eee;padding:20px;border-radius:15px;">
                <h2 style="color:#7e39d5;">Tudo pronto, ${p.name.split(' ')[0]}!</h2>
                <p>Seu perfil foi analisado e aprovado.</p>
                <p>Acesse o link abaixo para ler as regras e entrar no grupo de WhatsApp:</p>
                <a href="https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}" style="display:inline-block;padding:15px 25px;background:#7e39d5;color:white;text-decoration:none;border-radius:10px;font-weight:bold;">VER REGRAS E GRUPO</a>
            </div>
        `;
        await sendSystemEmail(p.email, "Seu acesso à equipe foi liberado!", html);
    }
    return { success: true };
});

// --- FUNÇÕES DO CLUBE VIP ---

exports.createVipPixPayment = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { vipEventId, promoterId, email, name, amount, whatsapp, instagram } = data;
    const config = getConfig();

    if (!config.mpAccessToken) {
        throw new functions.https.HttpsError("failed-precondition", "Token Mercado Pago ausente.");
    }

    const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const payment = new Payment(client);

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || "Membro";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "VIP";

    try {
        const body = {
            transaction_amount: Number(amount),
            description: `Adesão Clube VIP: ${vipEventId}`,
            payment_method_id: "pix",
            notification_url: `https://southamerica-east1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mpWebhook`,
            payer: { email, first_name: firstName, last_name: lastName },
            metadata: {
                vip_event_id: vipEventId,
                promoter_id: promoterId,
                promoter_email: email,
                promoter_whatsapp: whatsapp || "",
                promoter_instagram: instagram || ""
            }
        };

        const response = await payment.create({ body });
        return {
            id: response.id,
            qr_code: response.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            status: response.status
        };
    } catch (error) {
        console.error("Erro MP:", error);
        throw new functions.https.HttpsError("internal", error.message || "Erro no Pix.");
    }
});

exports.mpWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const { action, data } = req.body;
    const config = getConfig();

    if (action === "payment.updated" && data?.id) {
        try {
            const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: data.id });

            if (paymentInfo.status === "approved") {
                const { vip_event_id, promoter_id, promoter_email, promoter_whatsapp, promoter_instagram } = paymentInfo.metadata;

                const eventSnap = await db.collection("vipEvents").doc(vip_event_id).get();
                const eventData = eventSnap.data();
                const eventName = eventData ? eventData.name : "Evento VIP";

                const promoterSnap = await db.collection("promoters").doc(promoter_id).get();
                const pData = promoterSnap.data();
                const pName = pData ? pData.name : "Membro VIP";

                const batch = db.batch();

                const membershipRef = db.collection("vipMemberships").doc(`${promoter_id}_${vip_event_id}`);
                batch.set(membershipRef, {
                    vipEventId: vip_event_id,
                    vipEventName: eventName,
                    promoterId: promoter_id,
                    promoterName: pName,
                    promoterEmail: promoter_email,
                    promoterWhatsapp: promoter_whatsapp || "",
                    promoterInstagram: promoter_instagram || "",
                    organizationId: 'club-vip-global',
                    status: "confirmed",
                    isBenefitActive: false, 
                    benefitCode: generateAlphanumericCode(6),
                    paymentId: data.id,
                    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                const promoterRef = db.collection("promoters").doc(promoter_id);
                batch.update(promoterRef, {
                    emocoesStatus: "confirmed",
                    emocoesBenefitActive: false 
                });

                await batch.commit();

                const html = `
                    <div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #eee;border-radius:20px;padding:40px;">
                        <h2 style="color:#7e39d5;text-align:center;">Pagamento Confirmado!</h2>
                        <p>Olá <b>${pName.split(' ')[0]}</b>,</p>
                        <p>Seu acesso ao Clube VIP para o evento <b>${eventName}</b> foi confirmado.</p>
                        <div style="background:#f0e7ff;padding:20px;border-radius:15px;text-align:center;margin:30px 0;">
                            <p style="margin:0;font-weight:bold;color:#5d1eab;">Status Atual: AGUARDANDO LIBERAÇÃO DO CUPOM</p>
                        </div>
                        <p>Você receberá um novo e-mail assim que seu cupom de cortesia for gerado.</p>
                    </div>
                `;
                await sendSystemEmail(promoter_email, "Pagamento Clube VIP confirmado! 🎉", html);
            }
        } catch (error) {
            console.error("[Webhook VIP] Erro Crítico:", error);
        }
    }
    res.status(200).send("OK");
});

exports.notifyVipActivation = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { membershipId } = data;
    
    try {
        const snap = await db.collection("vipMemberships").doc(membershipId).get();
        if (!snap.exists) return { success: false };
        
        const m = snap.data();
        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        const ev = eventSnap.data();
        
        const resgateLink = `https://stingressos.com.br/eventos/${ev?.externalSlug || ""}?cupom=${m.benefitCode}`;

        const html = `
            <div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #7e39d5;border-radius:20px;padding:40px;">
                <h2 style="color:#7e39d5;text-align:center;">Sua Cortesia VIP Chegou! 🎉</h2>
                <p>Olá <b>${m.promoterName.split(' ')[0]}</b>,</p>
                <p>Seu código exclusivo para o <b>${m.vipEventName}</b> já está ativo:</p>
                <div style="background:#f9f9f9;padding:30px;border-radius:20px;text-align:center;margin:30px 0;border:2px dashed #7e39d5;">
                    <p style="margin:10px 0;font-size:32px;font-weight:900;color:#7e39d5;font-family:monospace;">${m.benefitCode}</p>
                </div>
                <a href="${resgateLink}" style="display:block;background:#7e39d5;color:#fff;text-decoration:none;padding:20px;text-align:center;border-radius:15px;font-weight:bold;font-size:18px;">RESGATAR MINHA CORTESIA</a>
            </div>
        `;
        await sendSystemEmail(m.promoterEmail, "Sua Cortesia VIP já está disponível! 🎟️", html);
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
