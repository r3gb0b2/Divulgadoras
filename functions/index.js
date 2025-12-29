
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

                // 1. Atualiza Registro de Membresia
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
                    isBenefitActive: false, // Inicia como FALSO até o admin ativar
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
                console.log(`VIP ATIVADO (PENDENTE CUPOM): ${promoter_email}`);
            }
        } catch (error) {
            console.error("Erro Webhook:", error);
        }
    }
    res.status(200).send("OK");
});
