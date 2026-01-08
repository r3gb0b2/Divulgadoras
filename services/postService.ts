
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Post, PostAssignment, Promoter, Timestamp, PushReminder, OneTimePost, OneTimePostSubmission, ScheduledPost, WhatsAppReminder, AdminUserData } from '../types';

/**
 * Remove propriedades 'undefined' de um objeto para evitar erros no Firestore.
 */
const stripUndefined = (obj: any): any => {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
            newObj[key] = obj[key];
        }
    });
    return newObj;
};

/**
 * Agenda um lembrete Push para ser enviado em 6 horas.
 */
export const scheduleProofPushReminder = async (assignment: PostAssignment, promoter: Promoter): Promise<void> => {
    if (!promoter.fcmToken) return;

    try {
        const batch = firestore.batch();
        const reminderRef = firestore.collection('pushReminders').doc();
        const sixHoursInMs = 6 * 60 * 60 * 1000;
        const scheduledDate = new Date(Date.now() + sixHoursInMs);

        const reminderData: Omit<PushReminder, 'id'> = {
            promoterId: promoter.id,
            fcmToken: promoter.fcmToken,
            title: "Hora do Print! 📸",
            body: `Já se passaram 6h do seu post para "${assignment.post.campaignName}". Envie o print agora para garantir sua presença!`,
            url: "/#/posts",
            scheduledFor: firebase.firestore.Timestamp.fromDate(scheduledDate),
            status: 'pending',
            assignmentId: assignment.id
        };

        batch.set(reminderRef, stripUndefined(reminderData));
        const assignmentRef = firestore.collection('postAssignments').doc(assignment.id);
        batch.update(assignmentRef, { reminderScheduled: true });

        await batch.commit();
    } catch (error) {
        console.error("Erro ao agendar lembrete push:", error);
        throw new Error("Não foi possível agendar o lembrete.");
    }
};

export const confirmAssignment = async (assignmentId: string): Promise<void> => {
  try {
    await firestore.collection('postAssignments').doc(assignmentId).update({
      status: 'confirmed',
      confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    throw new Error("Falha ao confirmar postagem.");
  }
};

export const getAssignmentById = async (id: string): Promise<PostAssignment | null> => {
  try {
    const doc = await firestore.collection('postAssignments').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as PostAssignment : null;
  } catch (error) {
    return null;
  }
};

export const getAssignmentsForPromoterByEmail = async (email: string): Promise<PostAssignment[]> => {
  try {
    const q = firestore.collection('postAssignments')
      .where('promoterEmail', '==', email.toLowerCase().trim());
    const snapshot = await q.get();
    const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
    
    return assignments.sort((a, b) => {
      const timeA = (a.createdAt as any)?.toMillis() || (a.post?.createdAt as any)?.toMillis() || 0;
      const timeB = (b.createdAt as any)?.toMillis() || (b.post?.createdAt as any)?.toMillis() || 0;
      return timeB - timeA;
    });
  } catch (error) {
    console.error("Error getting promoter assignments:", error);
    return [];
  }
};

export const submitJustification = async (assignmentId: string, text: string, files: File[]): Promise<void> => {
  try {
    const imageUrls = await Promise.all(
      files.map(async (file) => {
        const fileName = `justifications/${assignmentId}/${Date.now()}-${file.name}`;
        const ref = storage.ref(fileName);
        await ref.put(file);
        return await ref.getDownloadURL();
      })
    );

    await firestore.collection('postAssignments').doc(assignmentId).update({
      justification: text,
      justificationStatus: 'pending',
      justificationSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      justificationImageUrls: imageUrls
    });
  } catch (error) {
    throw new Error("Falha ao enviar justificativa.");
  }
};

export const getAssignmentsForOrganization = async (orgId: string): Promise<PostAssignment[]> => {
    const q = firestore.collection('postAssignments').where('organizationId', '==', orgId);
    const snap = await q.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
};

export const cleanupOldProofs = async (orgId: string): Promise<{ success: boolean, message: string }> => {
    const func = functions.httpsCallable('cleanupOldProofs');
    const res = await func({ organizationId: orgId });
    return res.data as any;
};

export const analyzeCampaignProofs = async (orgId: string, campaignName?: string, postId?: string) => {
    const func = functions.httpsCallable('analyzeCampaignProofs');
    const res = await func({ organizationId: orgId, campaignName, postId });
    return res.data as any;
};

export const deleteCampaignProofs = async (orgId: string, campaignName?: string, postId?: string) => {
    const func = functions.httpsCallable('deleteCampaignProofs');
    const res = await func({ organizationId: orgId, campaignName, postId });
    return res.data as any;
};

export const getPostsForOrg = async (orgId?: string, adminData?: AdminUserData): Promise<Post[]> => {
    let q: firebase.firestore.Query = firestore.collection('posts');
    
    if (orgId) {
        q = q.where('organizationId', '==', orgId);
    }
    
    const snap = await q.get();
    let posts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
    
    if (adminData && adminData.role !== 'superadmin' && adminData.assignedStates && adminData.assignedStates.length > 0) {
        posts = posts.filter(p => adminData.assignedStates!.includes(p.stateAbbr));
    }
    return posts;
};

export const updatePost = async (postId: string, data: Partial<Post>): Promise<void> => {
    await firestore.collection('posts').doc(postId).update(stripUndefined(data));
};

export const deletePost = async (postId: string): Promise<void> => {
    const batch = firestore.batch();
    batch.delete(firestore.collection('posts').doc(postId));
    const assignmentsSnap = await firestore.collection('postAssignments').where('postId', '==', postId).get();
    assignmentsSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
};

export const acceptAllJustifications = async (postId: string): Promise<{ count: number, message: string }> => {
    const func = functions.httpsCallable('acceptAllJustifications');
    const res = await func({ postId });
    return res.data as any;
};

export const createPost = async (postData: Omit<Post, 'id' | 'createdAt'>, promoters: Promoter[]): Promise<string> => {
    const postRef = firestore.collection('posts').doc();
    const batch = firestore.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    
    batch.set(postRef, { ...stripUndefined(postData), id: postRef.id, createdAt: now });
    
    promoters.forEach(p => {
        const assignmentRef = firestore.collection('postAssignments').doc();
        batch.set(assignmentRef, {
            postId: postRef.id,
            post: { ...stripUndefined(postData), id: postRef.id },
            promoterId: p.id,
            promoterEmail: p.email,
            promoterName: p.name,
            organizationId: postData.organizationId,
            status: 'pending',
            createdAt: now,
            completionRate: 0 
        });
    });
    
    await batch.commit();
    return postRef.id;
};

export const getPostWithAssignments = async (postId: string): Promise<{ post: Post, assignments: PostAssignment[] }> => {
    const postDoc = await firestore.collection('posts').doc(postId).get();
    if (!postDoc.exists) throw new Error("Post não encontrado");
    
    // CORREÇÃO: Usando postDoc.data() em vez do doc inexistente
    const post = { id: postDoc.id, ...postDoc.data() } as Post;
    const assignmentsSnap = await firestore.collection('postAssignments').where('postId', '==', postId).get();
    const assignments = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
    return { post, assignments };
};

export const schedulePost = async (data: any): Promise<void> => {
    await firestore.collection('scheduledPosts').add({
        ...stripUndefined(data),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const getScheduledPostById = async (id: string): Promise<ScheduledPost | null> => {
    const doc = await firestore.collection('scheduledPosts').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as ScheduledPost : null;
};

export const updateScheduledPost = async (id: string, data: any): Promise<void> => {
    await firestore.collection('scheduledPosts').doc(id).update(stripUndefined(data));
};

export const deleteScheduledPost = async (id: string): Promise<void> => {
    await firestore.collection('scheduledPosts').doc(id).delete();
};

export const getScheduledPosts = async (orgId: string): Promise<ScheduledPost[]> => {
    const q = firestore.collection('scheduledPosts').where('organizationId', '==', orgId);
    const snap = await q.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledPost));
};

export const updateAssignment = async (id: string, data: Partial<PostAssignment>): Promise<void> => {
    await firestore.collection('postAssignments').doc(id).update(stripUndefined(data));
};

export const submitProof = async (assignmentId: string, files: File[]): Promise<void> => {
    const imageUrls = await Promise.all(
        files.map(async (file) => {
            const fileName = `proofs/${assignmentId}/${Date.now()}-${file.name}`;
            const ref = storage.ref(fileName);
            await ref.put(file);
            return await ref.getDownloadURL();
        })
    );
    await firestore.collection('postAssignments').doc(assignmentId).update({
        proofImageUrls: imageUrls,
        proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'confirmed'
    });
};

export const getStatsForPromoterByEmail = async (email: string) => {
    const assignments = await getAssignmentsForPromoterByEmail(email);
    const stats = {
        assigned: assignments.length,
        completed: assignments.filter(a => !!a.proofSubmittedAt).length,
        justifications: assignments.filter(a => !!a.justification).length,
        acceptedJustifications: assignments.filter(a => a.justificationStatus === 'accepted').length,
        missed: 0,
        pending: 0,
    };
    return { stats, assignments };
};

export const getStatsForPromoter = async (promoterId: string) => {
    const snap = await firestore.collection('postAssignments').where('promoterId', '==', promoterId).get();
    const assignments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
    const stats = {
        assigned: assignments.length,
        completed: assignments.filter(a => !!a.proofSubmittedAt).length,
        justifications: assignments.filter(a => !!a.justification).length,
        acceptedJustifications: assignments.filter(a => a.justificationStatus === 'accepted').length,
    };
    return { stats, assignments };
};

export const addAssignmentsToPost = async (postId: string, promoterIds: string[]): Promise<void> => {
    const postDoc = await firestore.collection('posts').doc(postId).get();
    const postData = postDoc.data();
    const batch = firestore.batch();
    for (const pid of promoterIds) {
        const promoterDoc = await firestore.collection('promoters').doc(pid).get();
        const pData = promoterDoc.data();
        if (pData) {
            const ref = firestore.collection('postAssignments').doc();
            batch.set(ref, {
                postId,
                post: postData,
                promoterId: pid,
                promoterEmail: pData.email,
                promoterName: pData.name,
                organizationId: postData?.organizationId,
                status: 'pending',
                createdAt: firebase.firestore.Timestamp.now(),
                completionRate: 0
            });
        }
    }
    await batch.commit();
};

export const getOneTimePostsForOrg = async (orgId: string): Promise<OneTimePost[]> => {
    const q = firestore.collection('oneTimePosts').where('organizationId', '==', orgId);
    const snap = await q.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePost));
};

export const deleteOneTimePost = async (postId: string): Promise<void> => {
    const batch = firestore.batch();
    batch.delete(firestore.collection('oneTimePosts').doc(postId));
    const submissionsSnap = await firestore.collection('oneTimePostSubmissions').where('oneTimePostId', '==', postId).get();
    submissionsSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
};

export const updateOneTimePost = async (postId: string, data: Partial<OneTimePost>): Promise<void> => {
    await firestore.collection('oneTimePosts').doc(postId).update(stripUndefined(data));
};

export const createOneTimePost = async (data: Omit<OneTimePost, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await firestore.collection('oneTimePosts').add({
        ...stripUndefined(data),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
};

export const getOneTimePostById = async (id: string): Promise<OneTimePost | null> => {
    const doc = await firestore.collection('oneTimePosts').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as OneTimePost : null;
};

export const getOneTimePostSubmissions = async (postId: string): Promise<OneTimePostSubmission[]> => {
    const q = firestore.collection('oneTimePostSubmissions').where('oneTimePostId', '==', postId);
    const snap = await q.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePostSubmission));
};

export const updateOneTimePostSubmission = async (id: string, data: Partial<OneTimePostSubmission>): Promise<void> => {
    await firestore.collection('oneTimePostSubmissions').doc(id).update(stripUndefined(data));
};

export const deleteOneTimePostSubmission = async (id: string): Promise<void> => {
    await firestore.collection('oneTimePostSubmissions').doc(id).delete();
};

export const submitOneTimePostSubmission = async (data: any): Promise<void> => {
    await firestore.collection('oneTimePostSubmissions').add({
        ...stripUndefined(data),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const getWhatsAppRemindersPage = async (pageSize: number, startAfter: firebase.firestore.QueryDocumentSnapshot | null = null) => {
    let q = firestore.collection('whatsappReminders').orderBy('sendAt', 'desc').limit(pageSize);
    if (startAfter) q = q.startAfter(startAfter);
    const snap = await q.get();
    const reminders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppReminder));
    return { reminders, lastVisible: snap.docs[snap.docs.length - 1] || null };
};

export const sendWhatsAppReminderImmediately = async (id: string): Promise<void> => {
    const func = functions.httpsCallable('sendWhatsAppReminderImmediately');
    await func({ reminderId: id });
};
