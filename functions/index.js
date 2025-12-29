
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

    if (!config.mpAccessToken) {
        throw new functions.https.HttpsError("failed-precondition", "Mercado Pago não configurado no servidor (Token ausente).");
    }

    const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
    const payment = new Payment(client);

    // Tratamento de nome para evitar erros de campos vazios
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || "Divulgadora";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "Cadastrada";

    try {
        const body = {
            transaction_amount: Number(amount),
            description: `Adesão VIP: ${vipEventId}`,
            payment_method_id: "pix",
            // URL dinâmica baseada no ID do projeto atual
            notification_url: `https://southamerica-east1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mpWebhook`,
            payer: {
                email: email,
                first_name: firstName,
                last_name: lastName,
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
        console.error("Erro detalhado do Mercado Pago:", error);
        
        // Se o erro for por falta de chave Pix, enviamos uma mensagem clara ao frontend
        if (error.message && error.message.includes("key enabled")) {
            throw new functions.https.HttpsError("internal", "A conta recebedora não possui uma chave Pix ativa no Mercado Pago. Cadastre uma chave no app do Mercado Pago para continuar.");
        }
        
        throw new functions.https.HttpsError("internal", error.message || "Erro ao processar pagamento.");
    }
});

exports.mpWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    const { action, data } = req.body;
    const config = getConfig();

    // Log para você acompanhar as chegadas do webhook no console do Firebase
    console.log(`Webhook recebido: ${action}`, data);

    if (action === "payment.updated" && data?.id) {
        try {
            const client = new MercadoPagoConfig({ accessToken: config.mpAccessToken });
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: data.id });

            if (paymentInfo.status === "approved") {
                const { vip_event_id, promoter_id, promoter_email } = paymentInfo.metadata;

                // Buscar nome do evento para o registro de membresia ficar completo
                const eventSnap = await db.collection("vipEvents").doc(vip_event_id).get();
                const eventData = eventSnap.data();
                const eventName = eventData ? eventData.name : "Evento VIP";

                // Buscar nome do promoter para evitar exibir "sem nome" no admin
                const promoterSnap = await db.collection("promoters").doc(promoter_id).get();
                const pData = promoterSnap.data();
                const pName = pData ? pData.name : "Membro VIP";

                const batch = db.batch();

                // 1. Atualiza Registro de Membresia
                // O campo 'submittedAt' é crucial para aparecer na lista do Super Admin
                const membershipRef = db.collection("vipMemberships").doc(`${promoter_id}_${vip_event_id}`);
                batch.set(membershipRef, {
                    vipEventId: vip_event_id,
                    vipEventName: eventName,
                    promoterId: promoter_id,
                    promoterName: pName,
                    promoterEmail: promoter_email,
                    organizationId: pData ? pData.organizationId : "club-vip-global",
                    status: "confirmed",
                    paymentId: data.id,
                    method: "auto-pix-mp",
                    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                // 2. Atualiza o Perfil da Divulgadora (para o Portal reconhecer)
                const promoterRef = db.collection("promoters").doc(promoter_id);
                batch.update(promoterRef, {
                    emocoesStatus: "confirmed",
                    emocoesBenefitCode: "VIP-MP-" + data.id.toString().slice(-6).toUpperCase()
                });

                await batch.commit();
                console.log(`PAGAMENTO APROVADO: VIP Ativado para ${promoter_email}`);
            }
        } catch (error) {
            console.error("Erro ao processar Webhook:", error);
        }
    }
    res.status(200).send("OK");
});
