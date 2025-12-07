
// --- Função de Teste do Z-API (Para Debug) ---
exports.testZapi = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Ação não autorizada.");
    
    const config = getConfig().zapi;
    const phoneToTest = data.phone || '5511999999999'; 

    return {
        configFound: !!config,
        hasInstanceId: !!config?.instance_id,
        hasToken: !!config?.token,
        hasClientToken: !!config?.client_token,
        attemptingSendTo: phoneToTest,
        timestamp: new Date().toISOString()
    };
});

// --- Agendar Lembrete de WhatsApp (Com Verificação de Duplicidade) ---
exports.scheduleWhatsAppReminder = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    const { assignmentId } = data;
    if (!assignmentId) throw new functions.https.HttpsError("invalid-argument", "ID da tarefa obrigatório.");

    try {
        const assignmentRef = db.collection("postAssignments").doc(assignmentId);
        const assignmentSnap = await assignmentRef.get();
        if (!assignmentSnap.exists) throw new functions.https.HttpsError("not-found", "Tarefa não encontrada.");
        
        const assignment = assignmentSnap.data();

        // 1. Check for existing pending reminder to prevent duplicates/overload
        const existingReminderQuery = await db.collection("whatsAppReminders")
            .where("assignmentId", "==", assignmentId)
            .where("status", "==", "pending")
            .limit(1)
            .get();

        if (!existingReminderQuery.empty) {
            return { success: true, message: "Lembrete já estava agendado." };
        }

        // 2. Get Promoter Data for Phone
        const promoterRef = db.collection("promoters").doc(assignment.promoterId);
        const promoterSnap = await promoterRef.get();
        const promoterData = promoterSnap.exists ? promoterSnap.data() : {};
        const phone = promoterData.whatsapp || "";

        if (!phone) {
            throw new functions.https.HttpsError("failed-precondition", "Divulgadora sem WhatsApp cadastrado.");
        }

        // 3. Create Reminder
        // Schedule for 6 hours from now
        const sendAt = admin.firestore.Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000); 

        const reminderData = {
            assignmentId,
            promoterId: assignment.promoterId,
            promoterName: assignment.promoterName,
            promoterEmail: assignment.promoterEmail,
            promoterWhatsapp: phone,
            postId: assignment.postId,
            postCampaignName: assignment.post.campaignName,
            organizationId: assignment.organizationId,
            status: 'pending',
            sendAt: sendAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        const reminderRef = db.collection("whatsAppReminders").doc();
        batch.set(reminderRef, reminderData);
        
        // Update assignment to show reminder was requested
        batch.update(assignmentRef, { 
            whatsAppReminderRequestedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        await batch.commit();

        return { success: true, message: "Lembrete agendado." };

    } catch (error) {
        console.error("Error scheduling reminder:", error);
        throw new functions.https.HttpsError("internal", "Erro ao agendar lembrete.");
    }
});

// --- Enviar Lembrete Imediatamente (Admin ou Cron Job) ---
// Atualizado com o texto focado apenas no envio do print
exports.sendWhatsAppReminderNow = functions.region("southamerica-east1").https.onCall(async (data, context) => {
    // Auth check usually here, but allowed open for manual trigger from admin panel which handles auth
    const { reminderId } = data;
    if (!reminderId) throw new functions.https.HttpsError("invalid-argument", "ID do lembrete obrigatório.");

    const config = getConfig().zapi;
    if (!config || !config.instance_id || !config.token) {
        throw new functions.https.HttpsError("failed-precondition", "Z-API não configurado.");
    }

    try {
        const reminderRef = db.collection("whatsAppReminders").doc(reminderId);
        const reminderSnap = await reminderRef.get();
        if (!reminderSnap.exists) throw new functions.https.HttpsError("not-found", "Lembrete não encontrado.");
        
        const reminder = reminderSnap.data();
        if (reminder.status === 'sent') return { success: true, message: "Já enviado." };

        // Phone formatting
        let cleanPhone = reminder.promoterWhatsapp.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

        const firstName = reminder.promoterName.split(' ')[0];
        const portalLink = `https://divulgadoras.vercel.app/#/proof/${reminder.assignmentId}`;

        // --- NEW MESSAGE TEXT ---
        // Focus only on sending proof, no "pending post" mention.
        const message = `Olá ${firstName}! 📸\n\nPassando para lembrar de enviar o *print* da sua publicação no evento *${reminder.postCampaignName}*.\n\nPara garantir sua presença na lista, clique no link abaixo e envie agora:\n${portalLink}`;

        const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`;
        const headers = { 'Content-Type': 'application/json' };
        if (config.client_token) headers['Client-Token'] = config.client_token;

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: cleanPhone,
                message: message
            })
        });

        if (response.ok) {
            await reminderRef.update({ 
                status: 'sent', 
                sentAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            return { success: true };
        } else {
            const errText = await response.text();
            console.error("Z-API Error:", errText);
            await reminderRef.update({ 
                status: 'error', 
                error: errText,
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            throw new Error("Falha na API do WhatsApp");
        }

    } catch (error) {
        console.error("Error sending reminder:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});
