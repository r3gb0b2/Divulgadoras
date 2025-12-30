
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { MercadoPagoConfig, Payment } = require("mercadopago");

admin.initializeApp();
const db = admin.firestore();

const getConfig = () => {
    const config = functions.config();
    return {
        mpAccessToken: config.mp?.token || null
    };
};

/**
 * Gera código alfanumérico de 6 caracteres
 */
function generateAlphanumericCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Envia e-mail via coleção 'mail' (Trigger Email Extension)
 * Forçando o remetente r3gb0b@gmail.com
 */
async function sendVipEmail(email, subject, html) {
    try {
        await db.collection("mail").add({
            to: email,
            message: {
                from: "r3gb0b@gmail.com",
                subject: subject,
                html: html,
            }
        });
        console.log(`[Email VIP] Enfileirado para: ${email} usando r3gb0b@gmail.com`);
        return true;
    } catch (e) {
        console.error("[Email VIP] Erro ao enfileirar:", e);
        return false;
    }
}

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
            payer: {
                email: email,
                first_name: firstName,
                last_name: lastName,
            },
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
                    organizationId: pData ? pData.organizationId : "club-vip-global",
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

                // DISPARO IMEDIATO DE EMAIL DE PAGAMENTO CONFIRMADO
                await sendVipEmail(
                    promoter_email,
                    "Boas-vindas! Seu pagamento do Clube VIP foi confirmado 🎉",
                    `<div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #eee;border-radius:20px;padding:40px;">
                        <h2 style="color:#7e39d5;text-align:center;">Pagamento Recebido!</h2>
                        <p>Olá <b>${pName.split(' ')[0]}</b>,</p>
                        <p>Seu acesso ao Clube VIP para o evento <b>${eventName}</b> foi confirmado com sucesso.</p>
                        <p>Nossa equipe técnica já está gerando seu cupom de cortesia e vinculando seu e-mail ao sistema de entradas.</p>
                        <div style="background:#f0e7ff;padding:20px;border-radius:15px;text-align:center;margin:30px 0;">
                            <p style="margin:0;font-weight:bold;color:#5d1eab;">Status Atual: AGUARDANDO LIBERAÇÃO DO CUPOM</p>
                            <p style="margin:5px 0 0 0;font-size:12px;color:#7e39d5;">Você receberá um novo e-mail assim que o resgate estiver disponível.</p>
                        </div>
                        <p>Você também pode acompanhar o status pela sua conta no site a qualquer momento.</p>
                        <hr style="border:none;border-top:1px solid #eee;margin:30px 0;"/>
                        <p style="font-size:11px;color:#999;text-align:center;">Clube VIP Oficial • Gestão Exclusiva</p>
                    </div>`
                );

                console.log(`[Webhook VIP] Sucesso para: ${promoter_email} via r3gb0b@gmail.com`);
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
        if (!snap.exists) return { success: false, message: "Membro não encontrado." };
        
        const m = snap.data();
        const eventSnap = await db.collection("vipEvents").doc(m.vipEventId).get();
        const ev = eventSnap.data();
        
        const email = m.promoterEmail;
        const name = m.promoterName;
        const code = m.benefitCode;
        const eventName = m.vipEventName;
        const slug = ev?.externalSlug || "";
        
        const resgateLink = `https://stingressos.com.br/eventos/${slug}?cupom=${code}`;

        await sendVipEmail(
            email,
            "Sua Cortesia VIP já está disponível para resgate! 🎟️",
            `<div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #7e39d5;border-radius:20px;padding:40px;">
                <h2 style="color:#7e39d5;text-align:center;">Tudo Pronto! 🎉</h2>
                <p>Olá <b>${name.split(' ')[0]}</b>,</p>
                <p>Seu cupom oficial do Clube VIP para o <b>${eventName}</b> foi ativado e já pode ser utilizado.</p>
                
                <div style="background:#f9f9f9;padding:30px;border-radius:20px;text-align:center;margin:30px 0;border:2px dashed #7e39d5;">
                    <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#999;">Seu Código Exclusivo:</p>
                    <p style="margin:10px 0;font-size:32px;font-weight:900;color:#7e39d5;font-family:monospace;">${code}</p>
                </div>

                <p style="text-align:center;font-weight:bold;">Clique no botão abaixo para garantir sua cortesia:</p>
                
                <a href="${resgateLink}" style="display:block;background:#7e39d5;color:#fff;text-decoration:none;padding:20px;text-align:center;border-radius:15px;font-weight:black;margin:25px 0;font-size:18px;box-shadow:0 10px 30px rgba(126,57,213,0.3);">RESGATAR MINHA CORTESIA</a>
                
                <p style="font-size:12px;color:#666;text-align:center;">Este cupom é pessoal e intransferível, vinculado ao seu e-mail cadastrado.</p>
                
                <hr style="border:none;border-top:1px solid #eee;margin:40px 0;"/>
                <p style="font-size:11px;color:#aaa;text-align:center;">Clube VIP Oficial • Equipe de Produção</p>
            </div>`
        );
        
        console.log(`[Ativação VIP] Notificação enviada: ${email} via r3gb0b@gmail.com`);
        return { success: true };
    } catch (e) {
        console.error("[Ativação VIP] Erro:", e);
        return { success: false, error: e.message };
    }
});
