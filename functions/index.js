const admin = require("firebase-admin");
const functions = require("firebase-functions");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();
const db = admin.firestore();

/**
 * Função para integração com a IA Gemini do Google.
 * Utiliza a chave de API da variável de ambiente process.env.API_KEY.
 */
exports.askGemini = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { prompt } = data;
    if (!prompt) throw new functions.https.HttpsError("invalid-argument", "Prompt vazio.");

    try {
        // Inicialização seguindo as diretrizes de "Always use new GoogleGenAI({apiKey: process.env.API_KEY})"
        const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await genAI.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                systemInstruction: "Você é um assistente especializado em marketing de eventos e gestão de divulgadoras. Ajude o organizador a criar textos, regras e estratégias de engajamento.",
            }
        });

        return { text: response.text };
    } catch (e) {
        console.error("Gemini Error:", e);
        throw new functions.https.HttpsError("internal", "Falha na IA: " + e.message);
    }
});

/**
 * Envio de Campanhas Push para dispositivos móveis (Capacitor).
 */
exports.sendPushCampaign = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Não autorizado.");
    
    const { title, body, url, promoterIds } = data;
    if (!title || !body || !promoterIds || promoterIds.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Dados incompletos.");
    }

    try {
        const tokens = [];
        const CHUNK_SIZE = 30;
        
        for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
            const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
            const snap = await db.collection('promoters')
                .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                .get();
            
            snap.forEach(doc => {
                const p = doc.data();
                if (p.fcmToken) tokens.push(p.fcmToken);
            });
        }

        if (tokens.length === 0) return { success: false, message: "Nenhum dispositivo com App instalado encontrado." };

        const messagePayload = {
            notification: { title, body },
            data: { url: url || '/#/posts' },
            tokens: tokens,
            android: {
                priority: "high",
                notification: { sound: "default", color: "#e83a93" }
            },
            apns: {
                payload: {
                    aps: { sound: "default", badge: 1 }
                }
            }
        };

        const response = await admin.messaging().sendEachForMulticast(messagePayload);
        
        let errorDetail = "";
        if (response.failureCount > 0) {
            const firstError = response.responses.find(r => !r.success);
            errorDetail = firstError ? firstError.error.message : "Erro desconhecido.";
        }

        return { 
            success: response.successCount > 0, 
            message: `${response.successCount} enviadas, ${response.failureCount} falhas.`,
            errorDetail
        };

    } catch (e) {
        console.error("Critical Push Error:", e);
        throw new functions.https.HttpsError("internal", e.message);
    }
});

/**
 * Atualiza o status de uma divulgadora e sincroniza com as tarefas ativas.
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

/**
 * Remove divulgadora de todas as tarefas e marca como 'Removida'.
 */
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

// Stubs para evitar erros 404 no frontend enquanto as funções complexas não são implementadas
exports.createPostAndAssignments = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postData, assignedPromoters } = data;
    const postRef = await db.collection('posts').add({
        ...postData,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    for (const p of assignedPromoters) {
        await db.collection('postAssignments').add({
            postId: postRef.id,
            promoterId: p.id,
            promoterName: p.name,
            promoterEmail: p.email,
            status: 'pending',
            organizationId: postData.organizationId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            post: postData
        });
    }
    return { success: true, postId: postRef.id };
});

exports.addAssignmentsToPost = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { postId, promoterIds } = data;
    const postSnap = await db.collection('posts').doc(postId).get();
    const postData = postSnap.data();

    for (const pid of promoterIds) {
        const pSnap = await db.collection('promoters').doc(pid).get();
        const p = pSnap.data();
        await db.collection('postAssignments').add({
            postId,
            promoterId: pid,
            promoterName: p.name,
            promoterEmail: p.email,
            status: 'pending',
            organizationId: postData.organizationId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            post: postData
        });
    }
    return { success: true };
});