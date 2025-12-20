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
        const CHUNK_SIZE = 30;
        
        for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
            const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
            const snap = await db.collection('promoters')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
            
            snap.forEach(doc => {
                const p = doc.data();
                const token = p.fcmToken;
                
                // Validação rigorosa: FCM tokens não são hexadecimais puros de 64 chars (APNs)
                // e costumam ter mais de 100 caracteres no iOS/Android moderno
                if (token && 
                    typeof token === 'string' && 
                    token !== 'undefined' && 
                    token !== 'null' && 
                    token.length > 40) {
                    
                    messages.push({
                        token: token,
                        notification: { title, body },
                        data: { url: url || '/#/posts' },
                        android: {
                            priority: "high",
                            notification: { sound: "default", color: "#e83a93" }
                        },
                        apns: {
                            payload: {
                                aps: { sound: "default", badge: 1, contentAvailable: true }
                            }
                        }
                    });
                }
            });
        }

        if (messages.length === 0) {
            return { success: false, message: "Nenhum dispositivo com token FCM válido (longo) encontrado para este grupo." };
        }

        // Usar sendEach para garantir que um token inválido não derrube o envio dos outros
        const response = await admin.messaging().sendEach(messages);
        
        const successCount = response.responses.filter(r => r.success).length;
        const failureCount = response.responses.length - successCount;

        let errorDetail = "";
        if (failureCount > 0) {
            const firstError = response.responses.find(r => !r.success);
            errorDetail = firstError ? firstError.error.message : "Erro desconhecido em alguns dispositivos.";
            console.error("Push partial failure:", errorDetail);
        }

        return { 
            success: successCount > 0, 
            message: `${successCount} enviadas, ${failureCount} falhas.`,
            errorDetail
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