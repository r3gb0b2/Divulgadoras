const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

/**
 * Função para integração com a IA Gemini do Google.
 * Exclusivamente utiliza process.env.API_KEY.
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
 * Utiliza sendEach para isolar falhas de tokens individuais malformados.
 */
exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds } = data;
    if (!title || !body || !promoterIds || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    try {
        const messages = [];
        const promoterMapByToken = {}; // Para identificar quem falhou depois
        const CHUNK_SIZE = 30;
        
        for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
            const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
            const snap = await db.collection('promoters')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
            
            snap.forEach(doc => {
                const p = doc.data();
                let token = p.fcmToken;
                
                // SANITIZAÇÃO: Remove espaços, quebras de linha e valida tipo
                if (token && typeof token === 'string') {
                    token = token.trim();
                    
                    // Verifica se o token parece válido (FCM tokens são longos e não-hex puros)
                    if (token !== 'undefined' && token !== 'null' && token.length > 40) {
                        const msg = {
                            token: token,
                            notification: { title, body },
                            data: { 
                                url: url || '/#/posts',
                                click_action: "FLUTTER_NOTIFICATION_CLICK" // Compatibilidade extra
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
                    }
                }
            });
        }

        if (messages.length === 0) {
            return { success: false, message: "Nenhum dispositivo com token válido encontrado na seleção." };
        }

        // Usar sendEach para garantir que um token inválido não derrube o envio dos outros
        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;

        let errorDetail = "";
        if (failureCount > 0) {
            // Log detalhado no Firebase Console para saber QUEM falhou
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const failedToken = messages[idx].token;
                    const promoter = promoterMapByToken[failedToken];
                    console.error(`Falha no Push - Divulgadora: ${promoter.name} (ID: ${promoter.id}). Erro: ${res.error.message}`);
                    if (!errorDetail) errorDetail = res.error.message;
                }
            });
        }

        return { 
            success: successCount > 0, 
            message: `${successCount} enviadas com sucesso. ${failureCount} falhas detectadas.`,
            errorDetail: failureCount > 0 ? `Erro no primeiro dispositivo falho: ${errorDetail}` : ""
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