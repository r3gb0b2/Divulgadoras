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
 * Inclui limpeza automática de tokens e detecção rigorosa de tokens APNs inválidos para FCM.
 */
exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds, organizationId } = data;
    if (!title || !body || !promoterIds || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    try {
        const messages = [];
        const promoterMapByToken = {}; 
        let apnsOnlyFound = false;
        
        const snapshot = await db.collection('promoters')
            .where(admin.firestore.FieldPath.documentId(), 'in', promoterIds.slice(0, 500)) 
            .get();

        snapshot.forEach(doc => {
            const p = doc.data();
            let token = p.fcmToken;
            
            if (token && typeof token === 'string') {
                token = token.trim().replace(/["']/g, "");
                
                // DETECÇÃO CRÍTICA: Se o token tem 64 chars hex, ele é APNs puro e vai falhar no FCM.
                const isAPNsOnly = /^[0-9a-fA-F]{64}$/.test(token);

                if (!isAPNsOnly && token.length > 20) {
                    messages.push({
                        token: token,
                        notification: { title, body },
                        data: { 
                            url: url || '/#/posts',
                            orgId: organizationId || ""
                        },
                        android: {
                            priority: "high",
                            notification: { sound: "default", color: "#e83a93" }
                        },
                        apns: {
                            payload: {
                                aps: { sound: "default", badge: 1 }
                            }
                        }
                    });
                    promoterMapByToken[token] = { id: doc.id, name: p.name };
                } else if (isAPNsOnly) {
                    apnsOnlyFound = true;
                    console.warn(`Token APNs nativo detectado e ignorado para ${p.name}. O Firebase exige conversão para FCM via Xcode.`);
                }
            }
        });

        if (messages.length === 0) {
            const errorMsg = apnsOnlyFound 
                ? "Erro: Tokens nativos Apple (64 chars) detectados. O Firebase não consegue enviar mensagens para esses tokens. Verifique o guia técnico no Xcode no painel de admin."
                : "Nenhum token válido encontrado para os alvos selecionados.";
            
            return { 
                success: false, 
                message: errorMsg
            };
        }

        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;
        const tokensToDelete = [];
        let lastError = "";

        if (failureCount > 0) {
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const failedToken = messages[idx].token;
                    const promoter = promoterMapByToken[failedToken];
                    const error = res.error;

                    console.error(`Falha no Push - Divulgadora: ${promoter.name} (${promoter.id})`);
                    console.error(`Erro FCM: ${error.code} - ${error.message}`);

                    const isInvalid = 
                        error.code === 'messaging/registration-token-not-registered' || 
                        error.code === 'messaging/invalid-registration-token' ||
                        error.message.includes('not a valid FCM registration token');

                    if (isInvalid) {
                        tokensToDelete.push(promoter.id);
                    }
                    lastError = error.message;
                }
            });
        }

        if (tokensToDelete.length > 0) {
            const batch = db.batch();
            tokensToDelete.forEach(id => {
                batch.update(db.collection('promoters').doc(id), {
                    fcmToken: admin.firestore.FieldValue.delete(),
                    platform: admin.firestore.FieldValue.delete()
                });
            });
            await batch.commit();
        }

        return { 
            success: successCount > 0, 
            message: `${successCount} enviadas. ${failureCount} falhas removidas.`,
            errorDetail: failureCount > 0 ? lastError : null
        };

    } catch (e) {
        console.error("Critical sendPushCampaign Error:", e);
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