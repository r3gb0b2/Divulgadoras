
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Post, PostAssignment, Promoter, ScheduledPost, Timestamp, OneTimePost, OneTimePostSubmission, WhatsAppReminder, AdminUserData } from '../types';

/**
 * Converte qualquer formato de timestamp do Firebase para milissegundos de forma segura.
 */
const toMillisSafe = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts === 'object' && ts.seconds !== undefined) return ts.seconds * 1000;
    const date = new Date(ts);
    return isNaN(date.getTime()) ? 0 : date.getTime();
};

/**
 * Converte qualquer formato de timestamp do Firebase para Date de forma segura.
 */
const toDateSafe = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts === 'object' && ts.seconds !== undefined) return new Date(ts.seconds * 1000);
    const date = new Date(ts);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Dispara uma notificação push para todas as divulgadoras de um post específico.
 */
export const notifyPostPush = async (postId: string): Promise<{ success: boolean, message: string }> => {
    try {
        const notifyFunc = functions.httpsCallable('notifyPostPush');
        const result = await notifyFunc({ postId });
        return result.data as { success: boolean, message: string };
    } catch (error: any) {
        console.error("Error triggering post push:", error);
        throw new Error(error.message || "Falha ao enviar notificação.");
    }
};

/**
 * Cria uma nova publicação e atribui a divulgadoras.
 */
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

/**
 * Busca todas as tarefas de uma organização.
 */
export const getAssignmentsForOrganization = async (organizationId: string): Promise<PostAssignment[]> => {
  try {
    const q = firestore.collection('postAssignments').where('organizationId', '==', organizationId);
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
  } catch (error) {
    console.error("Error getting assignments:", error);
    return [];
  }
};

/**
 * Limpa prints antigos de eventos inativos.
 */
export const cleanupOldProofs = async (organizationId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const cleanup = functions.httpsCallable('cleanupOldProofs');
    const result = await cleanup({ organizationId });
    return result.data as { success: boolean; message: string };
  } catch (error: any) {
    throw new Error(error.message || "Erro na limpeza.");
  }
};

/**
 * Busca tarefas de uma divulgadora pelo email.
 */
export const getAssignmentsForPromoterByEmail = async (email: string): Promise<PostAssignment[]> => {
  try {
    const q = firestore.collection('postAssignments')
      .where('promoterEmail', '==', email.toLowerCase().trim());
    const snapshot = await q.get();
    const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
    
    // Sort by most recent safely
    return assignments.sort((a, b) => {
      // Use assignment createdAt if available, fallback to post createdAt
      const timeA = toMillisSafe(a.createdAt || a.post?.createdAt);
      const timeB = toMillisSafe(b.createdAt || b.post?.createdAt);
      return timeB - timeA;
    });
  } catch (error) {
    console.error("Error getting promoter assignments:", error);
    return [];
  }
};

/**
 * Confirma que a divulgadora realizou a postagem.
 */
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

/**
 * Envia justificativa de ausência.
 */
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

/**
 * Busca posts agendados para uma divulgadora.
 */
export const getScheduledPostsForPromoter = async (email: string): Promise<ScheduledPost[]> => {
  try {
    const q = firestore.collection('scheduledPosts')
      .where('status', '==', 'pending');
    const snapshot = await q.get();
    const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledPost));
    return all.filter(p => p.assignedPromoters.some(ap => ap.email === email.toLowerCase().trim()));
  } catch (error) {
    return [];
  }
};

/**
 * Atualiza uma tarefa específica.
 */
export const updateAssignment = async (assignmentId: string, data: Partial<PostAssignment>): Promise<void> => {
  try {
    await firestore.collection('postAssignments').doc(assignmentId).update(data);
  } catch (error) {
    throw new Error("Falha ao atualizar tarefa.");
  }
};

/**
 * Busca posts de uma organização, opcionalmente filtrando por visibilidade do admin.
 */
export const getPostsForOrg = async (organizationId: string, adminData?: AdminUserData): Promise<Post[]> => {
  try {
    let q: firebase.firestore.Query = firestore.collection('posts').where('organizationId', '==', organizationId);
    const snapshot = await q.get();
    let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
    
    if (adminData && adminData.role !== 'superadmin') {
      posts = posts.filter(p => !p.ownerOnly || p.createdByEmail === adminData.email);
    }
    
    return posts.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
  } catch (error) {
    return [];
  }
};

/**
 * Atualiza um post.
 */
export const updatePost = async (postId: string, data: Partial<Post>): Promise<void> => {
  try {
    await firestore.collection('posts').doc(postId).update(data);
  } catch (error) {
    throw new Error("Falha ao atualizar post.");
  }
};

/**
 * Aceita todas as justificativas pendentes de um post.
 */
export const acceptAllJustifications = async (postId: string): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const func = functions.httpsCallable('acceptAllJustifications');
    const result = await func({ postId });
    return result.data as { success: boolean; count: number; message: string };
  } catch (error: any) {
    throw new Error(error.message || "Erro ao processar justificativas.");
  }
};

/**
 * Busca post e suas atribuições.
 */
export const getPostWithAssignments = async (postId: string): Promise<{ post: Post; assignments: PostAssignment[] }> => {
  try {
    const postDoc = await firestore.collection('posts').doc(postId).get();
    if (!postDoc.exists) throw new Error("Post não encontrado.");
    
    const assignmentsSnap = await firestore.collection('postAssignments').where('postId', '==', postId).get();
    const assignments = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
    
    return { post: { id: postDoc.id, ...postDoc.data() } as Post, assignments };
  } catch (error: any) {
    throw new Error(error.message);
  }
};

/**
 * Agenda um post para envio futuro.
 */
export const schedulePost = async (data: any): Promise<void> => {
  try {
    await firestore.collection('scheduledPosts').add(data);
  } catch (error) {
    throw new Error("Falha ao agendar post.");
  }
};

/**
 * Busca post agendado por ID.
 */
export const getScheduledPostById = async (id: string): Promise<ScheduledPost | null> => {
  try {
    const doc = await firestore.collection('scheduledPosts').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as ScheduledPost : null;
  } catch (error) {
    return null;
  }
};

/**
 * Atualiza um post agendado.
 */
export const updateScheduledPost = async (id: string, data: any): Promise<void> => {
  try {
    await firestore.collection('scheduledPosts').doc(id).update(data);
  } catch (error) {
    throw new Error("Falha ao atualizar agendamento.");
  }
};

/**
 * Envia lembretes para quem confirmou mas não enviou print.
 */
export const sendPostReminder = async (postId: string): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const func = functions.httpsCallable('sendPostReminders');
    const result = await func({ postId, type: 'confirmed_no_proof' });
    return result.data as { success: boolean; count: number; message: string };
  } catch (error: any) {
    throw new Error(error.message);
  }
};

/**
 * Envia lembretes para quem ainda não confirmou o post.
 */
export const sendPendingReminders = async (postId: string): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const func = functions.httpsCallable('sendPostReminders');
    const result = await func({ postId, type: 'pending_confirmation' });
    return result.data as { success: boolean; count: number; message: string };
  } catch (error: any) {
    throw new Error(error.message);
  }
};

/**
 * Deleta um post e suas atribuições.
 */
export const deletePost = async (postId: string): Promise<void> => {
  try {
    const deletePostAndAssignments = functions.httpsCallable('deletePostAndAssignments');
    await deletePostAndAssignments({ postId });
  } catch (error) {
    throw new Error("Falha ao deletar post.");
  }
};

/**
 * Busca tarefa por ID.
 */
export const getAssignmentById = async (id: string): Promise<PostAssignment | null> => {
  try {
    const doc = await firestore.collection('postAssignments').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as PostAssignment : null;
  } catch (error) {
    return null;
  }
};

/**
 * Envia print de comprovação.
 */
export const submitProof = async (assignmentId: string, files: File[]): Promise<void> => {
  try {
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
  } catch (error) {
    throw new Error("Falha ao enviar comprovante.");
  }
};

/**
 * Busca estatísticas de uma divulgadora pelo email.
 */
export const getStatsForPromoterByEmail = async (email: string): Promise<{ stats: any; assignments: PostAssignment[] }> => {
    try {
        const assignments = await getAssignmentsForPromoterByEmail(email);
        
        // Filtramos apenas assignments que possuem a informação do post vinculada
        const validAssignments = assignments.filter(a => !!a.post);

        const stats = {
            assigned: validAssignments.length,
            completed: validAssignments.filter(a => !!a.proofSubmittedAt).length,
            justifications: validAssignments.filter(a => !!a.justification).length,
            acceptedJustifications: validAssignments.filter(a => a.justificationStatus === 'accepted').length,
            missed: validAssignments.filter(a => {
                const expiresDate = toDateSafe(a.post?.expiresAt);
                const isLate = expiresDate && expiresDate < new Date() && !a.post.allowLateSubmissions;
                return isLate && !a.proofSubmittedAt && a.justificationStatus !== 'accepted';
            }).length,
            pending: validAssignments.filter(a => !a.proofSubmittedAt && a.justificationStatus !== 'accepted').length
        };
        return { stats, assignments: validAssignments };
    } catch (error: any) {
        console.error("Erro detalhado ao calcular estatísticas:", error);
        throw new Error("Não foi possível calcular suas estatísticas. Verifique seus dados.");
    }
};

/**
 * Adiciona novas atribuições a um post.
 */
export const addAssignmentsToPost = async (postId: string, promoterIds: string[]): Promise<void> => {
  try {
    const func = functions.httpsCallable('addAssignmentsToPost');
    await func({ postId, promoterIds });
  } catch (error: any) {
    throw new Error(error.message);
  }
};

/**
 * Busca todos os posts agendados de uma organização.
 */
export const getScheduledPosts = async (organizationId: string): Promise<ScheduledPost[]> => {
  try {
    const q = firestore.collection('scheduledPosts').where('organizationId', '==', organizationId);
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledPost))
      .sort((a, b) => toMillisSafe(a.scheduledAt) - toMillisSafe(b.scheduledAt));
  } catch (error) {
    return [];
  }
};

/**
 * Deleta agendamento.
 */
export const deleteScheduledPost = async (id: string): Promise<void> => {
  try {
    await firestore.collection('scheduledPosts').doc(id).delete();
  } catch (error) {
    throw new Error("Falha ao deletar agendamento.");
  }
};

/**
 * Busca posts únicos de uma organização.
 */
export const getOneTimePostsForOrg = async (organizationId: string): Promise<OneTimePost[]> => {
    try {
        const q = firestore.collection('oneTimePosts').where('organizationId', '==', organizationId);
        const snapshot = await q.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePost))
            .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
    } catch (error) {
        return [];
    }
};

/**
 * Deleta post único.
 */
export const deleteOneTimePost = async (postId: string): Promise<void> => {
    try {
        await firestore.collection('oneTimePosts').doc(postId).delete();
    } catch (error) {
        throw new Error("Erro ao deletar post.");
    }
};

/**
 * Atualiza post único.
 */
export const updateOneTimePost = async (postId: string, data: Partial<OneTimePost>): Promise<void> => {
    try {
        await firestore.collection('oneTimePosts').doc(postId).update(data);
    } catch (error) {
        throw new Error("Erro ao atualizar post.");
    }
};

/**
 * Cria post único.
 */
export const createOneTimePost = async (data: Omit<OneTimePost, 'id' | 'createdAt'>): Promise<string> => {
    try {
        const docRef = await firestore.collection('oneTimePosts').add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        throw new Error("Erro ao criar post único.");
    }
};

/**
 * Busca post único por ID.
 */
export const getOneTimePostById = async (id: string): Promise<OneTimePost | null> => {
    try {
        const doc = await firestore.collection('oneTimePosts').doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } as OneTimePost : null;
    } catch (error) {
        return null;
    }
};

/**
 * Busca submissões de um post único.
 */
export const getOneTimePostSubmissions = async (postId: string): Promise<OneTimePostSubmission[]> => {
    try {
        const q = firestore.collection('oneTimePostSubmissions').where('oneTimePostId', '==', postId);
        const snapshot = await q.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePostSubmission))
            .sort((a, b) => toMillisSafe(b.submittedAt) - toMillisSafe(a.submittedAt));
    } catch (error) {
        return [];
    }
};

/**
 * Atualiza submissão de post único.
 */
export const updateOneTimePostSubmission = async (id: string, data: Partial<OneTimePostSubmission>): Promise<void> => {
    try {
        await firestore.collection('oneTimePostSubmissions').doc(id).update(data);
    } catch (error) {
        throw new Error("Erro ao atualizar submissão.");
    }
};

/**
 * Deleta submissão de post único.
 */
export const deleteOneTimePostSubmission = async (id: string): Promise<void> => {
    try {
        await firestore.collection('oneTimePostSubmissions').doc(id).delete();
    } catch (error) {
        throw new Error("Erro ao deletar submissão.");
    }
};

/**
 * Realiza submissão em post único.
 */
export const submitOneTimePostSubmission = async (data: Omit<OneTimePostSubmission, 'id' | 'submittedAt'>): Promise<void> => {
    try {
        await firestore.collection('oneTimePostSubmissions').add({
            ...data,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        throw new Error("Erro ao enviar submissão.");
    }
};

/**
 * Busca estatísticas de uma divulgadora pelo ID.
 */
export const getStatsForPromoter = async (promoterId: string): Promise<{ stats: any; assignments: PostAssignment[] }> => {
    try {
        const promoterDoc = await firestore.collection('promoters').doc(promoterId).get();
        const email = promoterDoc.data()?.email;
        if (!email) throw new Error("Email não encontrado.");
        return await getStatsForPromoterByEmail(email);
    } catch (error) {
        throw new Error("Erro ao buscar estatísticas.");
    }
};

/**
 * Busca página de lembretes de WhatsApp.
 */
export const getWhatsAppRemindersPage = async (limit: number, startAfter: any): Promise<{ reminders: WhatsAppReminder[]; lastVisible: any }> => {
    try {
        let q = firestore.collection('whatsAppReminders').orderBy('sendAt', 'desc').limit(limit);
        if (startAfter) q = q.startAfter(startAfter);
        const snapshot = await q.get();
        const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppReminder));
        return { reminders, lastVisible: snapshot.docs[snapshot.docs.length - 1] || null };
    } catch (error) {
        return { reminders: [], lastVisible: null };
    }
};

/**
 * Envia lembrete de WhatsApp imediatamente.
 */
export const sendWhatsAppReminderImmediately = async (id: string): Promise<void> => {
    try {
        const func = functions.httpsCallable('sendWhatsAppReminderImmediately');
        await func({ reminderId: id });
    } catch (error: any) {
        throw new Error(error.message);
    }
};

/**
 * Analisa prints de uma campanha para limpeza.
 */
export const analyzeCampaignProofs = async (organizationId: string, campaignName?: string, postId?: string): Promise<{ count: number; sizeBytes: number }> => {
  try {
    const func = functions.httpsCallable('analyzeCampaignProofs');
    const result = await func({ organizationId, campaignName, postId });
    return result.data as { count: number; sizeBytes: number };
  } catch (error: any) {
    throw new Error(error.message);
  }
};

/**
 * Deleta prints de uma campanha.
 */
export const deleteCampaignProofs = async (organizationId: string, campaignName?: string, postId?: string): Promise<{ updatedDocs: number; hasMore: boolean }> => {
  try {
    const func = functions.httpsCallable('deleteCampaignProofs');
    const result = await func({ organizationId, campaignName, postId });
    return result.data as { updatedDocs: number; hasMore: boolean };
  } catch (error: any) {
    throw new Error(error.message);
  }
};
