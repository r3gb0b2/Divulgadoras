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
 * Inclui limpeza automática de tokens obsoletos ou inválidos baseada nas melhores práticas do FCM.
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
        const CHUNK_SIZE = 500; // Limite do sendEach do Firebase
        
        // Busca os tokens atuais no banco para garantir que não estamos enviando para tokens deletados no meio do processo
        const snapshot = await db.collection('promoters')
            .where(admin.firestore.FieldPath.documentId(), 'in', promoterIds.slice(0, 30)) // Exemplo para o chunk
            .get();

        snapshot.forEach(doc => {
            const p = doc.data();
            let token = p.fcmToken;
            
            if (token && typeof token === 'string') {
                // Sanitização final no servidor
                token = token.trim().replace(/["']/g, "");
                
                if (token.length > 10) {
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
                }
            }
        });

        if (messages.length === 0) {
            return { success: false, message: "Nenhum token válido encontrado para envio." };
        }

        // Envio em lote usando a API v1 (sendEach)
        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;
        const tokensToDelete = [];
        let errorLog = "";

        if (failureCount > 0) {
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const failedToken = messages[idx].token;
                    const promoter = promoterMapByToken[failedToken];
                    const error = res.error;

                    console.error(`Falha no Push - Divulgadora: ${promoter.name} (${promoter.id})`);
                    console.error(`Erro FCM: ${error.code} - ${error.message}`);

                    // GERENCIAMENTO DE TOKENS:
                    // Se o token for inválido, não registrado ou malformado, removemos do banco
                    const isInvalid = 
                        error.code === 'messaging/registration-token-not-registered' || 
                        error.code === 'messaging/invalid-registration-token' ||
                        error.message.includes('not a valid FCM registration token');

                    if (isInvalid) {
                        tokensToDelete.push(promoter.id);
                    }
                    
                    errorLog = error.message;
                }
            });
        }

        // Executa a limpeza proativa
        if (tokensToDelete.length > 0) {
            console.log(`Push: Removendo ${tokensToDelete.length} tokens inválidos detectados.`);
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
            message: `${successCount} enviadas. ${failureCount} falhas removidas do banco.`,
            errorDetail: failureCount > 0 ? errorLog : null
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