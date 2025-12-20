const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

/**
 * Função para integração com a IA Gemini do Google.
 */
exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "Prompt vazio.");

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "Você é um assistente especializado em marketing de eventos e gestão de divulgadoras. Ajude o organizador a criar textos, regras e estratégias de engajamento.",
            }
        });

        return { text: response.text };
    } catch (e) {
        console.error("Gemini Error:", e);
        throw new functions.https.HttpsError("internal", "Falha na IA: " + (e.message || "Erro desconhecido"));
    }
});

/**
 * Envio de Campanhas Push para dispositivos móveis.
 * Sanitização rigorosa de tokens para evitar erro de token inválido.
 */
exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds } = data;
    if (!title || !body || !promoterIds || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    try {
        const messages = [];
        const promoterMapByToken = {}; 
        const CHUNK_SIZE = 30;
        
        for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
            const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
            const snap = await db.collection('promoters')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
            
            snap.forEach(doc => {
                const p = doc.data();
                let token = p.fcmToken;
                
                // SANITIZAÇÃO RIGOROSA
                if (token && typeof token === 'string') {
                    // Remove espaços, quebras de linha e caracteres invisíveis de controle
                    token = token.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
                    
                    // Validação de formato FCM:
                    // 1. Não pode ser apenas hexadecimal de 64 caracteres (isso é APNs puro, FCM não aceita direto)
                    // 2. Tokens FCM reais costumam ter mais de 100 caracteres e estrutura base64
                    const isRawApns = /^[0-9a-fA-F]{64}$/.test(token);
                    const isValidFormat = token.length > 50 && !isRawApns && token !== 'undefined' && token !== 'null';

                    if (isValidFormat) {
                        const msg = {
                            token: token,
                            notification: { title, body },
                            data: { 
                                url: url || '/#/posts',
                                click_action: "FLUTTER_NOTIFICATION_CLICK" 
                            },
                            android: {
                                priority: "high",
                                notification: { sound: "default", color: "#e83a93" }
                            },
                            apns: {
                                payload: {
                                    aps: { sound: "default", badge: 1, contentAvailable: true }
                                }
                            }
                        };
                        messages.push(msg);
                        promoterMapByToken[token] = { id: doc.id, name: p.name };
                    } else {
                        console.warn(`Push: Token descartado por formato inválido. Divulgadora: ${p.name} (ID: ${doc.id}). Comprimento: ${token.length}. Token: ${token.substring(0, 10)}...`);
                    }
                }
            });
        }

        if (messages.length === 0) {
            return { success: false, message: "Nenhum dispositivo com token FCM válido encontrado. Verifique se as divulgadoras usam a versão mais recente do App." };
        }

        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;

        let errorDetail = "";
        if (failureCount > 0) {
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const failedToken = messages[idx].token;
                    const promoter = promoterMapByToken[failedToken];
                    console.error(`Falha no Push - Divulgadora: ${promoter.name} (ID: ${promoter.id}). Erro FCM: ${res.error.message}. Token Length: ${failedToken.length}`);
                    if (!errorDetail) errorDetail = res.error.message;
                }
            });
        }

        return { 
            success: successCount > 0, 
            message: `${successCount} enviadas com sucesso. ${failureCount} falhas.`,
            errorDetail: failureCount > 0 ? `Erro no envio: ${errorDetail}` : ""
        };

    } catch (e) {
        console.error("Critical Push Error:", e);
        throw new functions.https.HttpsError("internal", e.message);
    }
});

/**
 * Funções auxiliares de sincronização e status
 */
exports.updatePromoterAndSync = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId, data: updateData } = data;
    try {
        await db.collection('promoters').doc(promoterId).update({
            ...updateData,
            statusChangedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

exports.setPromoterStatusToRemoved = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    const { promoterId } = data;
    try {
        const batch = db.batch();
        const assignments = await db.collection('postAssignments').where('promoterId', '==', promoterId).get();
        assignments.forEach(doc => batch.delete(doc.ref));
        batch.update(db.collection('promoters').doc(promoterId), {
            status: 'removed',
            hasJoinedGroup: false
        });
        await batch.commit();
        return { success: true };
    } catch (e) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});