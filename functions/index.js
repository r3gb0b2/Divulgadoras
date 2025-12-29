
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

exports.createVipPixPayment = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { vipEventId, promoterId, email, name, amount } = data;
    const config = getConfig();

    if (!config.mpAccessToken) throw new functions.https.HttpsError("failed-precondition", "Mercado Pago não configurado.");

    const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const payment = new Payment(client);

    try {
        const body = {
            transaction_amount: amount,
            description: `Adesão VIP: ${vipEventId}`,
            payment_method_id: "pix",
            notification_url: "https://southamerica-east1-" + process.env.GCLOUD_PROJECT + ".cloudfunctions.net/mpWebhook",
            payer: {
                email: email,
                first_name: name.split(' ')[0],
                last_name: name.split(' ').slice(1).join(' ') || "Silva",
            },
            metadata: {
                vip_event_id: vipEventId,
                promoter_id: promoterId,
                promoter_email: email
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
        console.error("Erro MP Create:", error);
        throw new functions.https.HttpsError("internal", error.message);
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
                const { vip_event_id, promoter_id, promoter_email } = paymentInfo.metadata;

                const batch = db.batch();

                // 1. Atualiza Registro de Membresia
                const membershipRef = db.collection("vipMemberships").doc(`${promoter_id}_${vip_event_id}`);
                batch.set(membershipRef, {
                    vipEventId: vip_event_id,
                    promoterId: promoter_id,
                    promoterEmail: promoter_email,
                    status: "confirmed",
                    paymentId: data.id,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // 2. Atualiza o Perfil da Divulgadora (para o Portal reconhecer)
                const promoterRef = db.collection("promoters").doc(promoter_id);
                batch.update(promoterRef, {
                    emocoesStatus: "confirmed",
                    emocoesBenefitCode: "VIP-AUTO-" + data.id.toString().slice(-6).toUpperCase()
                });

                await batch.commit();
                console.log(`Sucesso: VIP Ativado via Pix para ${promoter_email}`);
            }
        } catch (error) {
            console.error("Erro Webhook MP:", error);
        }
    }
    res.status(200).send("OK");
});
