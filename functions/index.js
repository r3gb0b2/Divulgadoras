
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
 * Envia e-mail formatado via sistema de e-mail existente (mail collection para o Trigger Email extension)
 * ou via chamada direta se configurado. Aqui usamos o padrão de coleção 'mail' que é comum em Firebase.
 */
async function sendVipEmail(email, subject, html) {
    try {
        await db.collection("mail").add({
            to: email,
            message: {
                subject: subject,
                html: html,
            }
        });
        console.log(`E-mail registrado na fila para: ${email}`);
    } catch (e) {
        console.error("Erro ao enfileirar e-mail:", e);
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
            description: `Membro VIP: ${vipEventId}`,
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

                // 1. Registro de Membresia
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

                // 2. Perfil da Divulgadora
                const promoterRef = db.collection("promoters").doc(promoter_id);
                batch.update(promoterRef, {
                    emocoesStatus: "confirmed",
                    emocoesBenefitActive: false 
                });

                await batch.commit();

                // 3. E-MAIL DE PAGAMENTO CONFIRMADO
                await sendVipEmail(
                    promoter_email,
                    "Pagamento Recebido - Clube VIP",
                    `<div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;">
                        <h2 style="color:#7e39d5;">Olá ${pName.split(' ')[0]}!</h2>
                        <p>Seu pagamento para o acesso <b>${eventName}</b> foi confirmado com sucesso.</p>
                        <p>Nossa equipe está analisando os dados para liberar sua cortesia oficial. Você receberá um novo e-mail assim que o cupom estiver disponível para resgate no seu portal.</p>
                        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
                        <p style="font-size:12px;color:#999;">Equipe Certa • Gestão Profissional</p>
                    </div>`
                );

                console.log(`VIP ATIVADO (PENDENTE CUPOM): ${promoter_email}`);
            }
        } catch (error) {
            console.error("Erro Webhook:", error);
        }
    }
    res.status(200).send("OK");
});

/**
 * Notifica ativação de VIP por e-mail (Chamada pelo Admin)
 */
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
            "Sua Cortesia VIP está disponível!",
            `<div style="font-family:sans-serif;color:#333;max-width:600px;margin:auto;border:1px solid #eee;border-radius:15px;padding:30px;">
                <h2 style="color:#7e39d5;margin-bottom:20px;">Sua Cortesia foi Liberada! 🎉</h2>
                <p>Olá <b>${name.split(' ')[0]}</b>, boas notícias!</p>
                <p>Sua adesão ao <b>${eventName}</b> foi aprovada e seu cupom de cortesia já está ativo.</p>
                
                <div style="background:#f9f9f9;padding:20px;border-radius:10px;text-align:center;margin:25px 0;">
                    <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#999;">Seu Código:</p>
                    <p style="margin:5px 0;font-size:28px;font-weight:bold;color:#7e39d5;font-family:monospace;">${code}</p>
                </div>

                <p>Clique no botão abaixo para ir direto ao site de compra com sua cortesia aplicada:</p>
                
                <a href="${resgateLink}" style="display:block;background:#7e39d5;color:#fff;text-decoration:none;padding:15px;text-align:center;border-radius:10px;font-weight:bold;margin:20px 0;">RESGATAR CORTESIA AGORA</a>
                
                <p style="font-size:13px;color:#666;">Dica: Você também pode acessar esse código a qualquer momento no seu Portal da Divulgadora, na aba "Clube VIP".</p>
                
                <hr style="border:none;border-top:1px solid #eee;margin:30px 0;"/>
                <p style="font-size:11px;color:#aaa;text-align:center;">Equipe Certa • Sistema de Gestão de Divulgadoras</p>
            </div>`
        );
        
        console.log(`E-mail de ativação enviado para ${email}. Código: ${code}`);
        return { success: true };
    } catch (e) {
        console.error("Erro na ativação VIP:", e);
        return { success: false, error: e.message };
    }
});
