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
 * Limpeza agressiva de tokens para evitar erro de formato.
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
                    // LIMPEZA TOTAL: Remove aspas, espaços e caracteres invisíveis
                    token = token.trim()
                        .replace(/["']/g, "") 
                        .replace(/[\x00-\x1F\x7F-\x9F]/g, "");
                    
                    // Validação mínima: apenas garante que não é nulo/vazio
                    const isPotentiallyValid = token.length > 20 && token !== 'undefined' && token !== 'null';

                    if (isPotentiallyValid) {
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
                        console.warn(`Push: Token ignorado (muito curto ou inválido). Divulgadora: ${p.name}. Token: ${token}`);
                    }
                }
            });
        }

        if (messages.length === 0) {
            return { success: false, message: "Nenhum dispositivo com token encontrado. Peça para as divulgadoras abrirem o App para registrar o dispositivo." };
        }

        // Tenta enviar cada mensagem individualmente
        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;

        let lastErrorMessage = "";
        if (failureCount > 0) {
            response.responses.forEach((res, idx) => {
                if (!res.success) {
                    const failedToken = messages[idx].token;
                    const promoter = promoterMapByToken[failedToken];
                    
                    // LOG CRÍTICO PARA DEBUG: Mostra o token real que o Firebase rejeitou
                    console.error(`ERRO FCM - Divulgadora: ${promoter.name} (ID: ${promoter.id})`);
                    console.error(`Erro do SDK: ${res.error.message}`);
                    console.error(`Token Rejeitado: [${failedToken}] (Len: ${failedToken.length})`);
                    
                    if (!lastErrorMessage) lastErrorMessage = res.error.message;
                }
            });
        }

        return { 
            success: successCount > 0, 
            message: `${successCount} enviadas. ${failureCount} falhas.`,
            errorDetail: failureCount > 0 ? `Erro: ${lastErrorMessage}` : ""
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