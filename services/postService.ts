
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Post, PostAssignment, Promoter, ScheduledPost, Timestamp, OneTimePost, OneTimePostSubmission, WhatsAppReminder, AdminUserData } from '../types';
import { findPromotersByEmail } from './promoterService';

// Helper to safely convert various date formats to a Date object
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

// Helper to safely get milliseconds for sorting
const toMillisSafe = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return timestamp.seconds * 1000;
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? 0 : date.getTime();
};

export const createPost = async (
  postData: Omit<Post, 'id' | 'createdAt'>,
  assignedPromoters: Promoter[]
): Promise<string> => {
  try {
    const existingMediaUrl = (postData as any).mediaUrl;
    const finalPostData = {
        ...postData,
        mediaUrl: existingMediaUrl || null,
    };

    const createPostAndAssignments = functions.httpsCallable('createPostAndAssignments');
    const result = await createPostAndAssignments({ postData: finalPostData, assignedPromoters });
    
    const data = result.data as { success: boolean, postId?: string };
    if (!data.success || !data.postId) {
        throw new Error("A função do servidor falhou ao criar a publicação.");
    }
    
    return data.postId;
  } catch (error) {
    console.error("Error creating post: ", error);
    if (error instanceof Error) throw new Error(`Não foi possível criar a publicação. Detalhes: ${error.message}`);
    throw new Error("Não foi possível criar a publicação. Ocorreu um erro desconhecido.");
  }
};

export const getPostsForOrg = async (organizationId?: string, admin?: AdminUserData): Promise<Post[]> => {
    try {
        const postsCollection = firestore.collection("posts");
        let q: firebase.firestore.Query = postsCollection;
        if (organizationId) {
            q = q.where("organizationId", "==", organizationId);
        }

        const snapshot = await q.get();
        let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        
        if (admin) {
            posts = posts.filter(post => {
                if (admin.role === 'superadmin') return true;
                if (post.ownerOnly) return post.createdByEmail === admin.email;
                return true;
            });
        }

        posts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
        return posts;
    } catch (error) {
        console.error("Error fetching posts for org: ", error);
        throw new Error("Não foi possível buscar as publicações. Verifique se existem dados corrompidos ou se o índice está sendo criado.");
    }
};

export const getAssignmentsForOrganization = async (organizationId: string): Promise<PostAssignment[]> => {
    try {
        const q = firestore.collection("postAssignments").where("organizationId", "==", organizationId);
        const snapshot = await q.get();
        const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

        return assignments.filter(a => {
            if (!a.post) {
                console.warn(`[Data Integrity] Assignment ${a.id} is missing 'post' data.`);
                return false;
            }
            return true;
        });
    } catch (error) {
        console.error("Error fetching assignments for organization: ", error);
        throw new Error("Não foi possível buscar as tarefas da organização.");
    }
};

export const getPostWithAssignments = async (postId: string): Promise<{ post: Post, assignments: PostAssignment[] }> => {
    try {
        const postDocRef = firestore.collection('posts').doc(postId);
        const postSnap = await postDocRef.get();
        if (!postSnap.exists) throw new Error("Publicação não encontrada.");
        const post = { id: postSnap.id, ...postSnap.data() } as Post;

        const q = firestore.collection("postAssignments").where("postId", "==", postId);
        const snapshot = await q.get();
        const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

        return { post, assignments };
    } catch (error) {
        console.error("Error fetching post details: ", error);
        throw new Error("Não foi possível buscar os detalhes da publicação.");
    }
};

export const getAssignmentsForPromoterByEmail = async (email: string): Promise<PostAssignment[]> => {
    try {
        const q = firestore.collection("postAssignments").where("promoterEmail", "==", email.toLowerCase().trim());
        const snapshot = await q.get();
        const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
        
        const visibleAssignments = assignments.filter(assignment => !!assignment.post);
        
        visibleAssignments.sort((a, b) => {
            if (a.status === 'pending' && b.status === 'confirmed') return -1;
            if (a.status === 'confirmed' && b.status === 'pending') return 1;
            return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
        });
        return visibleAssignments;
    } catch (error) {
        console.error("Error fetching promoter assignments: ", error);
        throw new Error("Não foi possível buscar as publicações.");
    }
}

export const confirmAssignment = async (assignmentId: string): Promise<void> => {
    try {
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        await docRef.update({
            status: 'confirmed',
            confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error("Error confirming assignment: ", error);
        throw new Error("Não foi possível confirmar a publicação.");
    }
}

export const scheduleWhatsAppReminder = async (assignmentId: string): Promise<void> => {
  try {
    const func = functions.httpsCallable('scheduleWhatsAppReminder');
    const result = await func({ assignmentId });
    const data = result.data as { success: boolean, message: string };
    if (!data.success) throw new Error(data.message || "A função do servidor falhou.");
  } catch (error) {
    console.error("Error requesting WhatsApp reminder: ", error);
    if (error instanceof Error) throw new Error(`Não foi possível agendar o lembrete. Detalhes: ${error.message}`);
    throw new Error("Não foi possível agendar o lembrete.");
  }
};

export const getAssignmentById = async (assignmentId: string): Promise<PostAssignment | null> => {
    try {
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        const docSnap = await docRef.get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data() } as PostAssignment;
        return null;
    } catch (error) {
        console.error("Error getting assignment by ID: ", error);
        throw new Error("Não foi possível buscar os dados da tarefa.");
    }
};

export const submitProof = async (assignmentId: string, imageFiles: File[]): Promise<string[]> => {
    if (imageFiles.length === 0 || imageFiles.length > 2) throw new Error("Você deve enviar 1 ou 2 imagens.");
    try {
        const proofImageUrls = await Promise.all(
            imageFiles.map(async (photo) => {
                const fileExtension = photo.name.split('.').pop();
                const fileName = `proof-${assignmentId}-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = storage.ref(`posts-proofs/${fileName}`);
                await storageRef.put(photo);
                return await storageRef.getDownloadURL();
            })
        );
        
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        await docRef.update({
            proofImageUrls: proofImageUrls,
            proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        
        return proofImageUrls;
    } catch (error) {
        console.error("Error submitting proof: ", error);
        throw new Error("Não foi possível enviar a comprovação.");
    }
};

const calculatePromoterStats = (assignments: PostAssignment[]) => {
  let completed = 0;
  let missed = 0;
  let justifications = 0;
  let acceptedJustifications = 0;
  let pending = 0;
  const now = new Date();

  assignments.forEach(assignment => {
    if (!assignment.post) return;
    
    if (assignment.proofSubmittedAt) {
      completed++;
    } else if (assignment.justificationStatus === 'accepted') {
      justifications++;
      acceptedJustifications++;
    } else if (assignment.justificationStatus === 'rejected') {
      justifications++;
      missed++;
    } else if (assignment.justificationStatus === 'pending' || assignment.justification) {
      justifications++;
      pending++;
    } else {
      let deadlineHasPassed = false;
      if (!assignment.post.allowLateSubmissions) {
          const confirmedAt = toDateSafe(assignment.confirmedAt);
          if (confirmedAt) {
              const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
              if (now > proofDeadline) deadlineHasPassed = true;
          }
          if (!deadlineHasPassed) {
              const postExpiresAt = toDateSafe(assignment.post.expiresAt);
              if (postExpiresAt && now > postExpiresAt) deadlineHasPassed = true;
          }
      }
      if (deadlineHasPassed) missed++;
      else pending++;
    }
  });

  return {
    assigned: assignments.length,
    completed,
    missed,
    justifications,
    acceptedJustifications,
    pending,
  };
};

type StatsResult = {
  stats: {
    assigned: number;
    completed: number;
    missed: number;
    justifications: number;
    acceptedJustifications: number;
    pending: number;
  };
  assignments: PostAssignment[];
};

export const getStatsForPromoter = async (promoterId: string): Promise<StatsResult> => {
  try {
    const q = firestore.collection("postAssignments").where("promoterId", "==", promoterId);
    const snapshot = await q.get();
    const assignments = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment))
        .filter(a => !!a.post);
    
    assignments.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));

    const stats = calculatePromoterStats(assignments);
    return { stats, assignments };
  } catch (error) {
    console.error("Error getting promoter stats: ", error);
    throw new Error("Não foi possível buscar as estatísticas da divulgadora.");
  }
};

export const getStatsForPromoterByEmail = async (email: string): Promise<StatsResult> => {
  try {
    const q = firestore.collection("postAssignments").where("promoterEmail", "==", email.toLowerCase().trim());
    const snapshot = await q.get();
    const assignments = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment))
        .filter(a => !!a.post);
    
    assignments.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));

    const stats = calculatePromoterStats(assignments);
    return { stats, assignments };
  } catch (error) {
    console.error("Error getting promoter stats by email: ", error);
    throw new Error("Não foi possível buscar as estatísticas da divulgadora.");
  }
};

export const updatePost = async (postId: string, updateData: Partial<Post>): Promise<void> => {
    try {
        const updatePostStatus = functions.httpsCallable('updatePostStatus');
        await updatePostStatus({ postId, updateData });
    } catch (error) {
        console.error("Error updating post status:", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível atualizar a publicação.");
    }
};

export const deletePost = async (postId: string): Promise<void> => {
    const batch = firestore.batch();
    try {
        const q = firestore.collection("postAssignments").where("postId", "==", postId);
        const assignmentsSnapshot = await q.get();
        assignmentsSnapshot.forEach(doc => batch.delete(doc.ref));
        const postDocRef = firestore.collection('posts').doc(postId);
        batch.delete(postDocRef);
        await batch.commit();
    } catch (error) {
        console.error("Error deleting post: ", error);
        throw new Error("Não foi possível deletar a publicação.");
    }
}

export const addAssignmentsToPost = async (postId: string, promoterIds: string[]): Promise<void> => {
    try {
        const func = functions.httpsCallable('addAssignmentsToPost');
        await func({ postId, promoterIds });
    } catch (error) {
        console.error("Error adding assignments: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível atribuir a publicação.");
    }
};

export const sendPostReminder = async (postId: string): Promise<{count: number, message: string}> => {
    try {
        const func = functions.httpsCallable('sendPostReminder');
        const result = await func({ postId });
        return result.data as {count: number, message: string};
    } catch (error) {
        console.error("Error sending reminder:", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível enviar os lembretes.");
    }
};

export const sendPendingReminders = async (postId: string): Promise<{count: number, message: string}> => {
    try {
        const func = functions.httpsCallable('sendPendingReminders');
        const result = await func({ postId });
        return result.data as {count: number, message: string};
    } catch (error) {
        console.error("Error sending pending reminders:", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível enviar os lembretes para pendentes.");
    }
};

export const acceptAllJustifications = async (postId: string): Promise<{count: number, message: string}> => {
    try {
        const func = functions.httpsCallable('acceptAllJustifications');
        const result = await func({ postId });
        return result.data as {count: number, message: string};
    } catch (error) {
        console.error("Error accepting justifications:", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível aceitar todas as justificativas.");
    }
};

export const removePromoterFromPostAndGroup = async (assignmentId: string, promoterId: string): Promise<void> => {
    try {
        const batch = firestore.batch();
        const promoterDocRef = firestore.collection('promoters').doc(promoterId);
        batch.update(promoterDocRef, { hasJoinedGroup: false });
        const assignmentDocRef = firestore.collection('postAssignments').doc(assignmentId);
        batch.delete(assignmentDocRef);
        await batch.commit();
    } catch (error) {
        console.error("Error removing promoter: ", error);
        throw new Error("Não foi possível remover a divulgadora.");
    }
};

export const renewAssignmentDeadline = async (assignmentId: string): Promise<void> => {
    try {
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        await docRef.update({ confirmedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (error) {
        console.error("Error renewing deadline: ", error);
        throw new Error("Não foi possível renovar o prazo da tarefa.");
    }
};

export const submitJustification = async (assignmentId: string, justification: string, imageFiles: File[]): Promise<void> => {
    try {
        let justificationImageUrls: string[] = [];
        if (imageFiles.length > 0) {
            justificationImageUrls = await Promise.all(
                imageFiles.map(async (photo) => {
                    const fileExtension = photo.name.split('.').pop();
                    const fileName = `justification-${assignmentId}-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                    const storageRef = storage.ref(`justifications-proofs/${fileName}`);
                    await storageRef.put(photo);
                    return await storageRef.getDownloadURL();
                })
            );
        }

        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        await docRef.update({
            justification: justification,
            justificationStatus: 'pending',
            justificationSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            justificationImageUrls: justificationImageUrls,
        });
    } catch (error) {
        console.error("Error submitting justification: ", error);
        throw new Error("Não foi possível enviar a justificativa.");
    }
};

export const updateAssignment = async (assignmentId: string, data: Partial<Omit<PostAssignment, 'id'>>): Promise<void> => {
    try {
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        await docRef.update(data);
    } catch (error) {
        console.error("Error updating assignment: ", error);
        throw new Error("Não foi possível atualizar a tarefa.");
    }
};

export const cleanupOldProofs = async (organizationId: string): Promise<{ count: number, message: string }> => {
    try {
        const func = functions.httpsCallable('cleanupOldProofs');
        const result = await func({ organizationId });
        return result.data as { count: number, message: string };
    } catch (error: any) {
        console.error("Error cleaning up proofs:", error);
        const detail = error.details?.message || error.message;
        throw new Error(`Falha na limpeza: ${detail}`);
    }
};

export const analyzeCampaignProofs = async (organizationId: string, campaignName?: string, postId?: string): Promise<{ count: number, sizeBytes: number, formattedSize: string }> => {
    try {
        const func = functions.httpsCallable('analyzeCampaignProofs');
        const result = await func({ organizationId, campaignName, postId });
        return result.data as { count: number, sizeBytes: number, formattedSize: string };
    } catch (error: any) {
        console.error("Error analyzing proofs:", error);
        const detail = error.details?.message || error.message;
        throw new Error(`Falha na análise: ${detail}`);
    }
};

export const deleteCampaignProofs = async (organizationId: string, campaignName?: string, postId?: string): Promise<{ success: boolean, deletedFiles: number, updatedDocs: number, hasMore: boolean }> => {
    try {
        const func = functions.httpsCallable('deleteCampaignProofs');
        const result = await func({ organizationId, campaignName, postId });
        return result.data as { success: boolean, deletedFiles: number, updatedDocs: number, hasMore: boolean };
    } catch (error: any) {
        console.error("Error deleting proofs:", error);
        const detail = error.details?.message || error.message;
        throw new Error(`Falha na limpeza: ${detail}`);
    }
};

// --- Scheduled Post Functions ---

export const schedulePost = async (
  data: Omit<ScheduledPost, 'id'>
): Promise<string> => {
    try {
        const docRef = await firestore.collection('scheduledPosts').add(data);
        return docRef.id;
    } catch (error) {
        console.error("Error scheduling post: ", error);
        throw new Error("Não foi possível agendar a publicação.");
    }
};

export const getScheduledPosts = async (organizationId: string): Promise<ScheduledPost[]> => {
    try {
        const q = firestore.collection("scheduledPosts")
            .where("organizationId", "==", organizationId);
        const snapshot = await q.get();
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledPost));
        posts.sort((a, b) => toMillisSafe(b.scheduledAt) - toMillisSafe(a.scheduledAt));
        return posts;
    } catch (error) {
        console.error("Error fetching scheduled posts: ", error);
        throw new Error("Não foi possível buscar as publicações agendadas.");
    }
};

export const getAllScheduledPosts = async (): Promise<ScheduledPost[]> => {
    try {
        const snapshot = await firestore.collection("scheduledPosts").get();
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledPost));
        posts.sort((a, b) => toMillisSafe(b.scheduledAt) - toMillisSafe(a.scheduledAt));
        return posts;
    } catch (error) {
        console.error("Error fetching all scheduled posts: ", error);
        throw new Error("Não foi possível buscar todas as publicações agendadas.");
    }
};

export const sendScheduledPostImmediately = async (postId: string): Promise<void> => {
    try {
        const func = functions.httpsCallable('sendScheduledPostImmediately');
        await func({ postId });
    } catch (error) {
        console.error("Error sending scheduled post: ", error);
        if (error instanceof Error) throw new Error(`Não foi possível enviar o post. Detalhes: ${error.message}`);
        throw new Error("Não foi possível enviar o post agendado.");
    }
};

export const getScheduledPostById = async (id: string): Promise<ScheduledPost | null> => {
    try {
        const docRef = firestore.collection('scheduledPosts').doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data() } as ScheduledPost;
        return null;
    } catch (error) {
        console.error("Error getting scheduled post: ", error);
        throw new Error("Não foi possível buscar os dados do agendamento.");
    }
};

export const updateScheduledPost = async (id: string, data: Partial<Omit<ScheduledPost, 'id'>>): Promise<void> => {
    try {
        const docRef = firestore.collection('scheduledPosts').doc(id);
        await docRef.update(data);
    } catch (error) {
        console.error("Error updating scheduled post: ", error);
        throw new Error("Não foi possível atualizar o agendamento.");
    }
};

export const deleteScheduledPost = async (id: string): Promise<void> => {
    try {
        await firestore.collection("scheduledPosts").doc(id).delete();
    } catch (error) {
        console.error("Error deleting scheduled post: ", error);
        throw new Error("Não foi possível cancelar o agendamento.");
    }
};

export const getScheduledPostsForPromoter = async (email: string): Promise<ScheduledPost[]> => {
    try {
        const promoterProfiles = await findPromotersByEmail(email);
        if (promoterProfiles.length === 0) return [];

        const orgIds = [...new Set(promoterProfiles.map(p => p.organizationId).filter(id => !!id))];
        if (orgIds.length === 0) return [];

        const scheduledPosts: ScheduledPost[] = [];
        const queryPromises = orgIds.map(orgId => {
            const q = firestore.collection("scheduledPosts")
                .where("organizationId", "==", orgId)
                .where("status", "==", "pending");
            return q.get();
        });

        const querySnapshots = await Promise.all(queryPromises);
        querySnapshots.forEach(snapshot => {
            snapshot.forEach(doc => scheduledPosts.push({ id: doc.id, ...doc.data() } as ScheduledPost));
        });
        
        const promoterIdSet = new Set(promoterProfiles.map(p => p.id));
        const lowerCaseEmail = email.toLowerCase().trim();

        const promoterScheduledPosts = scheduledPosts.filter(post => 
            post.assignedPromoters.some(assigned => 
                assigned && (promoterIdSet.has(assigned.id) || (assigned.email && assigned.email.toLowerCase() === lowerCaseEmail))
            )
        );
        
        promoterScheduledPosts.sort((a, b) => toMillisSafe(a.scheduledAt) - toMillisSafe(b.scheduledAt));
        return promoterScheduledPosts;
    } catch (error) {
        console.error("Error fetching scheduled posts for promoter: ", error);
        throw new Error("Não foi possível buscar as publicações agendadas.");
    }
};

export const getWhatsAppRemindersPage = async (
  limitPerPage: number,
  cursor?: firebase.firestore.QueryDocumentSnapshot
): Promise<{ reminders: WhatsAppReminder[], lastVisible: firebase.firestore.QueryDocumentSnapshot | null }> => {
    try {
        let query = firestore.collection("whatsAppReminders").orderBy('createdAt', 'desc').limit(limitPerPage);
        if (cursor) query = query.startAfter(cursor);

        const snapshot = await query.get();
        const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppReminder));
        const lastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
        return { reminders, lastVisible };
    } catch (error) {
        console.error("Error fetching reminders: ", error);
        throw new Error("Não foi possível buscar os lembretes do WhatsApp.");
    }
};

export const sendWhatsAppReminderImmediately = async (reminderId: string): Promise<void> => {
    try {
        const func = functions.httpsCallable('sendWhatsAppReminderNow');
        const result = await func({ reminderId });
        const data = result.data as { success: boolean };
        if (!data.success) throw new Error("A função do servidor falhou ao enviar o lembrete.");
    } catch (error) {
        console.error("Error sending reminder: ", error);
        if (error instanceof Error) throw new Error(`Não foi possível enviar o lembrete. Detalhes: ${error.message}`);
        throw new Error("Não foi possível enviar o lembrete do WhatsApp.");
    }
};

export const createOneTimePost = async (data: Omit<OneTimePost, 'id' | 'createdAt'>): Promise<string> => {
  try {
    const docRef = await firestore.collection('oneTimePosts').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating one-time post: ", error);
    if (error instanceof Error) throw new Error(`Não foi possível criar o post único. Detalhes: ${error.message}`);
    throw new Error("Não foi possível criar o post único. Ocorreu um erro desconhecido.");
  }
};

export const updateOneTimePost = async (postId: string, data: Partial<Omit<OneTimePost, 'id' | 'createdAt'>>): Promise<void> => {
  try {
    const docRef = firestore.collection('oneTimePosts').doc(postId);
    await docRef.update(data);
  } catch (error) {
    console.error("Error updating one-time post: ", error);
    if (error instanceof Error) throw new Error(`Não foi possível atualizar o post único. Detalhes: ${error.message}`);
    throw new Error("Não foi possível atualizar o post único. Ocorreu um erro desconhecido.");
  }
};

export const getOneTimePostsForOrg = async (organizationId: string): Promise<OneTimePost[]> => {
    try {
        const q = firestore.collection("oneTimePosts").where("organizationId", "==", organizationId);
        const snapshot = await q.get();
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePost));
        posts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
        return posts;
    } catch (error) {
        console.error("Error getting one-time posts: ", error);
        throw new Error("Não foi possível buscar os posts únicos.");
    }
};

export const getOneTimePostById = async (postId: string): Promise<OneTimePost | null> => {
    try {
        const docRef = firestore.collection('oneTimePosts').doc(postId);
        const docSnap = await docRef.get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data() } as OneTimePost;
        return null;
    } catch (error) {
        console.error("Error getting one-time post: ", error);
        throw new Error("Não foi possível buscar os dados do post.");
    }
};

export const submitOneTimePostSubmission = async (data: Omit<OneTimePostSubmission, 'id' | 'submittedAt'>): Promise<string> => {
    try {
        const email = data.email ? data.email.toLowerCase().trim() : '';
        let q;
        if (email) {
             q = firestore.collection('oneTimePostSubmissions').where('oneTimePostId', '==', data.oneTimePostId).where('email', '==', email);
        } else {
             q = firestore.collection('oneTimePostSubmissions').where('oneTimePostId', '==', data.oneTimePostId).where('instagram', '==', data.instagram);
        }
        
        const snapshot = await q.get();
        if (!snapshot.empty) {
            const msg = email ? "Este e-mail já foi utilizado nesta lista." : "Este Instagram já foi utilizado nesta lista.";
            throw new Error(msg);
        }

        const docRef = await firestore.collection('oneTimePostSubmissions').add({
            ...data,
            email: email,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating submission: ", error);
        if (error instanceof Error) throw new Error(error.message);
        throw new Error("Não foi possível enviar sua comprovação e nome.");
    }
};

export const getOneTimePostSubmissions = async (postId: string): Promise<OneTimePostSubmission[]> => {
    try {
        const q = firestore.collection("oneTimePostSubmissions").where("oneTimePostId", "==", postId);
        const snapshot = await q.get();
        const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePostSubmission));
        subs.sort((a, b) => toMillisSafe(b.submittedAt) - toMillisSafe(a.submittedAt));
        return subs;
    } catch (error) {
        console.error("Error fetching submissions: ", error);
        throw new Error("Não foi possível buscar as submissões.");
    }
};

export const updateOneTimePostSubmission = async (submissionId: string, data: Partial<OneTimePostSubmission>): Promise<void> => {
    try {
        const docRef = firestore.collection('oneTimePostSubmissions').doc(submissionId);
        await docRef.update(data);
    } catch (error) {
        console.error("Error updating submission: ", error);
        throw new Error("Não foi possível atualizar a submissão.");
    }
};

export const deleteOneTimePostSubmission = async (submissionId: string): Promise<void> => {
    try {
        const docRef = firestore.collection('oneTimePostSubmissions').doc(submissionId);
        await docRef.delete();
    } catch (error) {
        console.error("Error deleting submission: ", error);
        throw new Error("Não foi possível excluir a submissão.");
    }
};

export const deleteOneTimePost = async (postId: string): Promise<void> => {
    try {
        const batch = firestore.batch();
        const submissionsQuery = firestore.collection("oneTimePostSubmissions").where("oneTimePostId", "==", postId);
        const submissionsSnapshot = await submissionsQuery.get();
        submissionsSnapshot.forEach(doc => batch.delete(doc.ref));
        const postDocRef = firestore.collection('oneTimePosts').doc(postId);
        batch.delete(postDocRef);
        await batch.commit();
    } catch (error) {
        console.error("Error deleting one-time post: ", error);
        throw new Error("Não foi possível deletar o post único.");
    }
};
