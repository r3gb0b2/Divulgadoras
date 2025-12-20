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
 * Inclui limpeza automática de tokens obsoletos ou inválidos.
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
                
                if (token && typeof token === 'string') {
                    // Limpeza de caracteres residuais
                    token = token.trim().replace(/["']/g, "").replace(/[\x00-\x1F\x7F-\x9F]/g, "");
                    
                    // Validação básica de comprimento (tokens FCM costumam ter > 100 caracteres)
                    // Se for muito curto (ex: 64 chars), pode ser um token APNs puro que o Firebase não aceita direto
                    const isValidFormat = token.length > 30 && token !== 'undefined' && token !== 'null';

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
                        console.warn(`Push: Token com formato suspeito ignorado para ${p.name}: [${token}]`);
                    }
                }
            });
        }

        if (messages.length === 0) {
            return { success: false, message: "Nenhum dispositivo com token válido encontrado. Peça para as divulgadoras abrirem o App para atualizar o registro." };
        }

        // Envio em lote
        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;

        const tokensToDelete = [];
        let lastErrorMessage = "";

        if (failureCount > 0) {
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const failedToken = messages[idx].token;
                    const promoter = promoterMapByToken[failedToken];
                    const error = res.error;

                    console.error(`Falha no Push - Divulgadora: ${promoter.name} (${promoter.id})`);
                    console.error(`Erro FCM: ${error.code} - ${error.message}`);
                    console.error(`Token: ${failedToken}`);

                    // Códigos de erro que indicam que o token deve ser removido
                    const shouldRemove = 
                        error.code === 'messaging/registration-token-not-registered' || 
                        error.code === 'messaging/invalid-registration-token' ||
                        error.message.includes('not a valid FCM registration token');

                    if (shouldRemove) {
                        tokensToDelete.push(promoter.id);
                    }
                    
                    if (!lastErrorMessage) lastErrorMessage = error.message;
                }
            });
        }

        // Gerenciamento proativo: Remove tokens inválidos detectados
        if (tokensToDelete.length > 0) {
            console.log(`Push: Removendo ${tokensToDelete.length} tokens inválidos do banco.`);
            const batch = db.batch();
            tokensToDelete.forEach(id => {
                batch.update(db.collection('promoters').doc(id), {
                    fcmToken: admin.firestore.FieldValue.delete(),
                    platform: admin.firestore.FieldValue.delete(),
                    lastTokenUpdate: admin.firestore.FieldValue.delete()
                });
            });
            await batch.commit();
        }

        return { 
            success: successCount > 0, 
            message: `${successCount} enviadas com sucesso. ${failureCount} falhas removidas do banco.`,
            errorDetail: failureCount > 0 ? `Último erro: ${lastErrorMessage}` : ""
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