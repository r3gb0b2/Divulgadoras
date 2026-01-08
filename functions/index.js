
import admin from "firebase-admin";
import functions from "firebase-functions";
import { ASAAS_CONFIG } from "./credentials.js";

admin.initializeApp();
const db = admin.firestore();

// --- WEBHOOK SURE (WhatsApp/Instagram) ---
export const sureWebhook = functions.region("southamerica-east1").https.onRequest(async (req, res) => {
    // 1. Verificação do Webhook (Requisito GET)
    if (req.method === 'GET') {
        const botId = req.query.id || req.query.botId || "";
        console.log("Sure Webhook Verification (GET) received for ID:", botId);
        return res.status(200).send(botId);
    }

    // 2. Recebimento de Eventos (POST)
    if (req.method === 'POST') {
        const body = req.body;
        console.log("Sure Webhook Event (POST):", JSON.stringify(body));

        try {
            // Evento de Status de Mensagem (Entregue/Lido)
            if (body.event === 'message.status') {
                const { messageId, status, destination } = body.data;
                // Busca o log de envio para atualizar o status visual no painel
                const logSnap = await db.collection('whatsappLogs')
                    .where('messageId', '==', messageId)
                    .limit(1).get();
                
                if (!logSnap.empty) {
                    await logSnap.docs[0].ref.update({ 
                        status: status, // delivered, read, etc
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            // Evento de Mensagem Recebida (Divulgadora respondeu)
            if (body.event === 'message.received') {
                const { from, text, type } = body.data;
                const whatsapp = from.replace(/\D/g, '');

                // Salva a interação no histórico da divulgadora
                const promoterSnap = await db.collection('promoters')
                    .where('whatsapp', '==', whatsapp)
                    .limit(1).get();

                if (!promoterSnap.empty) {
                    const pDoc = promoterSnap.docs[0];
                    await pDoc.ref.collection('interactions').add({
                        type: 'whatsapp_reply',
                        content: text,
                        receivedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // Lógica Básica de Auto-Confirmação
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes("postei") || lowerText.includes("ja fiz") || lowerText.includes("ok")) {
                        // Busca a tarefa pendente mais recente e marca como 'confirmada'
                        const taskSnap = await db.collection('postAssignments')
                            .where('promoterId', '==', pDoc.id)
                            .where('status', '==', 'pending')
                            .orderBy('createdAt', 'desc').limit(1).get();
                        
                        if (!taskSnap.empty) {
                            await taskSnap.docs[0].ref.update({
                                status: 'confirmed',
                                confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                                autoConfirmedBy: 'SureAPI_Webhook'
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Webhook Processing Error:", err);
        }
        
        return res.status(200).json({ success: true });
    }

    return res.status(405).send('Method Not Allowed');
});

// Helper Asaas
const asaasFetch = async (endpoint, options = {}) => {
    const config = functions.config();
    const apiKey = ASAAS_CONFIG?.key || config.asaas?.key;
    const env = ASAAS_CONFIG?.env || config.asaas?.env || 'sandbox';
    const baseUrl = env === 'production' ? 'https://www.asaas.com/api/v3' : 'https://sandbox.asaas.com/api/v3';
    const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: { 'access_token': apiKey, 'Content-Type': 'application/json', ...options.headers }
    });
    const data = await res.json();
    return data;
};

// ... Resto das funções (Greenlife, Asaas, etc) continuam iguais ...
// Mantendo assignCodeGeneric, createGreenlifeAsaasPix, etc.
