import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Post, PostAssignment, Promoter, ScheduledPost, Timestamp, OneTimePost, OneTimePostSubmission, WhatsAppReminder } from '../types';
import { findPromotersByEmail } from './promoterService';

// Helper to safely convert various date formats to a Date object
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) {
        return null;
    }
    // Firestore Timestamp
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    // Serialized Timestamp object
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        return new Date(timestamp.seconds * 1000);
    }
    // ISO string or number (milliseconds)
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
};

export const createPost = async (
  postData: Omit<Post, 'id' | 'createdAt'>,
  mediaFile: File | null,
  assignedPromoters: Promoter[]
): Promise<string> => {
  try {
    let finalMediaUrl: string | undefined = undefined;

    // 1. Upload media file to Firebase Storage if provided
    if (mediaFile) {
      const fileExtension = mediaFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const storageRef = storage.ref(`posts-media/${fileName}`);
      await storageRef.put(mediaFile);
      finalMediaUrl = storageRef.fullPath;
    }

    // 2. Prepare data for the cloud function
    // Check if there's an existing mediaUrl in postData (from duplication) if no new file
    const existingMediaUrl = (postData as any).mediaUrl;

    const finalPostData = {
        ...postData,
        mediaUrl: finalMediaUrl || existingMediaUrl || null,
        // googleDriveUrl is already in postData from the form
    };

    // 3. Call the cloud function to create docs. Emails will be sent by a Firestore trigger.
    const createPostAndAssignments = functions.httpsCallable('createPostAndAssignments');
    const result = await createPostAndAssignments({ postData: finalPostData, assignedPromoters });
    
    const data = result.data as { success: boolean, postId?: string };
    if (!data.success || !data.postId) {
        throw new Error("A função do servidor falhou ao criar a publicação.");
    }
    
    return data.postId;

  } catch (error) {
    console.error("Error creating post via cloud function: ", error);
    if (error instanceof Error) {
        throw new Error(`Não foi possível criar a publicação. Detalhes: ${error.message}`);
    }
    throw new Error("Não foi possível criar a publicação. Ocorreu um erro desconhecido.");
  }
};

export const getPostsForOrg = async (organizationId?: string): Promise<Post[]> => {
    try {
        const postsCollection = firestore.collection("posts");
        let q: firebase.firestore.Query = postsCollection;
        if (organizationId) {
            q = q.where("organizationId", "==", organizationId);
        }

        const snapshot = await q.get();
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        posts.sort((a, b) => 
            ((b.createdAt as Timestamp)?.toMillis() || 0) - ((a.createdAt as Timestamp)?.toMillis() || 0)
        );
        return posts;
    } catch (error) {
        console.error("Error fetching posts for org: ", error);
        throw new Error("Não foi possível buscar as publicações.");
    }
};

export const getAssignmentsForOrganization = async (organizationId: string): Promise<PostAssignment[]> => {
    try {
        const q = firestore.collection("postAssignments").where("organizationId", "==", organizationId);
        const snapshot = await q.get();
        const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

        // Add filtering for data integrity
        return assignments.filter(a => {
            if (!a.post) {
                console.warn(`[Data Integrity] Assignment ${a.id} is missing 'post' data and will be filtered out.`);
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
        // Fetch post
        const postDocRef = firestore.collection('posts').doc(postId);
        const postSnap = await postDocRef.get();
        if (!postSnap.exists) {
            throw new Error("Publicação não encontrada.");
        }
        const post = { id: postSnap.id, ...postSnap.data() } as Post;

        // Fetch assignments
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
        
        // Filter for data integrity. The client will handle UI for inactive/expired posts.
        const visibleAssignments = assignments.filter(assignment => {
            const post = assignment.post;
            if (!post) {
                return false;
            }
            return true;
        });
        
        // Sort by pending first, then by date
        visibleAssignments.sort((a, b) => {
            if (a.status === 'pending' && b.status === 'confirmed') return -1;
            if (a.status === 'confirmed' && b.status === 'pending') return 1;
            const postA = a.post as any;
            const postB = b.post as any;
            return ((postB.createdAt as Timestamp)?.toMillis() || 0) - ((postA.createdAt as Timestamp)?.toMillis() || 0)
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
    if (!data.success) {
        throw new Error(data.message || "A função do servidor falhou.");
    }
  } catch (error) {
    console.error("Error requesting WhatsApp reminder: ", error);
    if (error instanceof Error) {
        throw new Error(`Não foi possível agendar o lembrete. Detalhes: ${error.message}`);
    }
    throw new Error("Não foi possível agendar o lembrete.");
  }
};

export const getAssignmentById = async (assignmentId: string): Promise<PostAssignment | null> => {
    try {
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return { id: docSnap.id, ...docSnap.data() } as PostAssignment;
        }
        return null;
    } catch (error) {
        console.error("Error getting assignment by ID: ", error);
        throw new Error("Não foi possível buscar os dados da tarefa.");
    }
};

export const submitProof = async (assignmentId: string, imageFiles: File[]): Promise<string[]> => {
    if (imageFiles.length === 0 || imageFiles.length > 2) {
        throw new Error("Você deve enviar 1 ou 2 imagens.");
    }

    try {
        // 1. Upload images
        const proofImageUrls = await Promise.all(
            imageFiles.map(async (photo) => {
                const fileExtension = photo.name.split('.').pop();
                const fileName = `proof-${assignmentId}-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = storage.ref(`posts-proofs/${fileName}`);
                await storageRef.put(photo);
                return await storageRef.getDownloadURL();
            })
        );
        
        // 2. Update Firestore document
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
    if (!assignment.post) {
      console.warn(`Skipping stats calculation for assignment ${assignment.id} due to missing post data.`);
      return;
    }
    
    if (assignment.proofSubmittedAt) {
      completed++;
    } else if (assignment.justificationStatus === 'accepted') {
      // Explicitly check status first - counts as success
      justifications++;
      acceptedJustifications++;
    } else if (assignment.justificationStatus === 'rejected') {
      // Explicitly check status - counts as failure
      justifications++;
      missed++;
    } else if (assignment.justificationStatus === 'pending' || assignment.justification) {
      // Has justification text or pending status
      justifications++;
      pending++;
    } else { // No proof, no justification (or empty justification text without status)
      let deadlineHasPassed = false;
      if (!assignment.post.allowLateSubmissions) {
          const confirmedAt = toDateSafe(assignment.confirmedAt);
          if (confirmedAt) {
              const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
              if (now > proofDeadline) {
                  deadlineHasPassed = true;
              }
          }
          if (!deadlineHasPassed) {
              const postExpiresAt = toDateSafe(assignment.post.expiresAt);
              if (postExpiresAt && now > postExpiresAt) {
                  deadlineHasPassed = true;
              }
          }
      }
      if (deadlineHasPassed) {
          missed++;
      } else {
          pending++;
      }
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
        .filter(a => {
            if (!a.post) {
                console.warn(`[Stats] Filtering out assignment ${a.id} for promoter ${promoterId} due to missing 'post' field.`);
                return false;
            }
            return true;
        });
    
    assignments.sort((a, b) => {
        const dateA = toDateSafe(a.post.createdAt);
        const dateB = toDateSafe(b.post.createdAt);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA;
    });

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
        .filter(a => {
            if (!a.post) {
                console.warn(`[Stats] Filtering out assignment ${a.id} for email ${email} due to missing 'post' field.`);
                return false;
            }
            return true;
        });
    
    assignments.sort((a, b) => {
        const dateA = toDateSafe(a.post.createdAt);
        const dateB = toDateSafe(b.post.createdAt);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA;
    });

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
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Não foi possível atualizar a publicação.");
    }
};

export const deletePost = async (postId: string): Promise<void> => {
    const batch = firestore.batch();
    try {
        // Find all assignments for the post
        const q = firestore.collection("postAssignments").where("postId", "==", postId);
        const assignmentsSnapshot = await q.get();
        
        // Add assignments to the batch for deletion
        assignmentsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Add the post itself to the batch for deletion
        const postDocRef = firestore.collection('posts').doc(postId);
        batch.delete(postDocRef);

        await batch.commit();

    } catch (error) {
        console.error("Error deleting post and assignments: ", error);
        throw new Error("Não foi possível deletar a publicação.");
    }
}

export const addAssignmentsToPost = async (postId: string, promoterIds: string[]): Promise<void> => {
    try {
        const func = functions.httpsCallable('addAssignmentsToPost');
        await func({ postId, promoterIds });
    } catch (error) {
        console.error("Error adding assignments to post: ", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Não foi possível atribuir a publicação.");
    }
};

export const sendPostReminder = async (postId: string): Promise<{count: number, message: string}> => {
    try {
        const func = functions.httpsCallable('sendPostReminder');
        const result = await func({ postId });
        return result.data as {count: number, message: string};
    } catch (error) {
        console.error("Error sending post reminder:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Não foi possível enviar os lembretes.");
    }
};

export const sendPendingReminders = async (postId: string): Promise<{count: number, message: string}> => {
    try {
        const func = functions.httpsCallable('sendPendingReminders');
        const result = await func({ postId });
        return result.data as {count: number, message: string};
    } catch (error) {
        console.error("Error sending pending post reminders:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Não foi possível enviar os lembretes para pendentes.");
    }
};

export const acceptAllJustifications = async (postId: string): Promise<{count: number, message: string}> => {
    try {
        const func = functions.httpsCallable('acceptAllJustifications');
        const result = await func({ postId });
        return result.data as {count: number, message: string};
    } catch (error) {
        console.error("Error accepting all justifications:", error);
        if (error instanceof Error) {
            throw error;
        }
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
        console.error("Error removing promoter from post and group:", error);
        throw new Error("Não foi possível remover a divulgadora.");
    }
};

export const renewAssignmentDeadline = async (assignmentId: string): Promise<void> => {
    try {
        const docRef = firestore.collection('postAssignments').doc(assignmentId);
        await docRef.update({
            confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error("Error renewing assignment deadline: ", error);
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
        posts.sort((a, b) => 
            ((b.scheduledAt as Timestamp)?.toMillis() || 0) - ((a.scheduledAt as Timestamp)?.toMillis() || 0)
        );
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
        posts.sort((a, b) => 
            ((b.scheduledAt as Timestamp)?.toMillis() || 0) - ((a.scheduledAt as Timestamp)?.toMillis() || 0)
        );
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
        console.error("Error sending scheduled post immediately:", error);
        if (error instanceof Error) {
            throw new Error(`Não foi possível enviar o post. Detalhes: ${error.message}`);
        }
        throw new Error("Não foi possível enviar o post agendado.");
    }
};

export const getScheduledPostById = async (id: string): Promise<ScheduledPost | null> => {
    try {
        const docRef = firestore.collection('scheduledPosts').doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return { id: docSnap.id, ...docSnap.data() } as ScheduledPost;
        }
        return null;
    } catch (error) {
        console.error("Error getting scheduled post by ID: ", error);
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
        if (promoterProfiles.length === 0) {
            return [];
        }

        const orgIds = [...new Set(promoterProfiles.map(p => p.organizationId).filter(id => !!id))];
        if (orgIds.length === 0) {
            return [];
        }

        const scheduledPosts: ScheduledPost[] = [];
        // Firestore 'in' query has a limit of 30 items. We query in parallel to be safe.
        const queryPromises = orgIds.map(orgId => {
            const q = firestore.collection("scheduledPosts")
                .where("organizationId", "==", orgId)
                .where("status", "==", "pending");
            return q.get();
        });

        const querySnapshots = await Promise.all(queryPromises);

        querySnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
                scheduledPosts.push({ id: doc.id, ...doc.data() } as ScheduledPost);
            });
        });
        
        const promoterIdSet = new Set(promoterProfiles.map(p => p.id));
        const lowerCaseEmail = email.toLowerCase().trim();

        const promoterScheduledPosts = scheduledPosts.filter(post => 
            post.assignedPromoters.some(assigned => 
                assigned && (promoterIdSet.has(assigned.id) || (assigned.email && assigned.email.toLowerCase() === lowerCaseEmail))
            )
        );
        
        promoterScheduledPosts.sort((a, b) => 
            ((a.scheduledAt as Timestamp)?.toMillis() || 0) - ((b.scheduledAt as Timestamp)?.toMillis() || 0)
        );

        return promoterScheduledPosts;
    } catch (error) {
        console.error("Error fetching scheduled posts for promoter: ", error);
        if (error instanceof Error && error.message.includes("requires an index")) {
            throw new Error("Erro de configuração do banco de dados (índice ausente). Peça para o desenvolvedor criar o índice composto no Firebase Console.");
        }
        throw new Error("Não foi possível buscar as publicações agendadas.");
    }
};

// --- WhatsApp Reminder Functions ---

export const getAllWhatsAppReminders = async (): Promise<WhatsAppReminder[]> => {
    try {
        const snapshot = await firestore.collection("whatsAppReminders").orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppReminder));
    } catch (error) {
        console.error("Error fetching all WhatsApp reminders: ", error);
        throw new Error("Não foi possível buscar os lembretes do WhatsApp.");
    }
};

export const sendWhatsAppReminderImmediately = async (reminderId: string): Promise<void> => {
    try {
        const func = functions.httpsCallable('sendWhatsAppReminderNow');
        const result = await func({ reminderId });
        const data = result.data as { success: boolean };
        if (!data.success) {
            throw new Error("A função do servidor falhou ao enviar o lembrete.");
        }
    } catch (error) {
        console.error("Error sending WhatsApp reminder immediately:", error);
        if (error instanceof Error) {
            throw new Error(`Não foi possível enviar o lembrete. Detalhes: ${error.message}`);
        }
        throw new Error("Não foi possível enviar o lembrete do WhatsApp.");
    }
};


// --- One-Time Post Functions ---
export const createOneTimePost = async (data: Omit<OneTimePost, 'id' | 'createdAt'>): Promise<string> => {
  try {
    const docRef = await firestore.collection('oneTimePosts').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating one-time post: ", error);
    if (error instanceof Error) {
        throw new Error(`Não foi possível criar o post único. Detalhes: ${error.message}`);
    }
    throw new Error("Não foi possível criar o post único. Ocorreu um erro desconhecido.");
  }
};

export const updateOneTimePost = async (postId: string, data: Partial<Omit<OneTimePost, 'id' | 'createdAt'>>): Promise<void> => {
  try {
    const docRef = firestore.collection('oneTimePosts').doc(postId);
    await docRef.update(data);
  } catch (error) {
    console.error("Error updating one-time post: ", error);
    if (error instanceof Error) {
        throw new Error(`Não foi possível atualizar o post único. Detalhes: ${error.message}`);
    }
    throw new Error("Não foi possível atualizar o post único. Ocorreu um erro desconhecido.");
  }
};

export const getOneTimePostsForOrg = async (organizationId: string): Promise<OneTimePost[]> => {
    try {
        const q = firestore.collection("oneTimePosts").where("organizationId", "==", organizationId);
        const snapshot = await q.get();
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePost));
        // Sort client-side to avoid needing a composite index
        posts.sort((a, b) => {
            const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
            const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
            return timeB - timeA; // Descending
        });
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
        if (docSnap.exists) {
            return { id: docSnap.id, ...docSnap.data() } as OneTimePost;
        }
        return null;
    } catch (error) {
        console.error("Error getting one-time post by ID: ", error);
        throw new Error("Não foi possível buscar os dados do post.");
    }
};

export const submitOneTimePostSubmission = async (data: Omit<OneTimePostSubmission, 'id' | 'submittedAt'>): Promise<string> => {
    try {
        const email = data.email ? data.email.toLowerCase().trim() : '';
        
        // Determine duplicate check strategy
        let q;
        if (email) {
             // If email is provided, check for duplicate email on this post
             q = firestore.collection('oneTimePostSubmissions')
                .where('oneTimePostId', '==', data.oneTimePostId)
                .where('email', '==', email);
        } else {
             // If no email (disabled by admin), check for duplicate Instagram handle
             q = firestore.collection('oneTimePostSubmissions')
                .where('oneTimePostId', '==', data.oneTimePostId)
                .where('instagram', '==', data.instagram);
        }
        
        const snapshot = await q.get();
        if (!snapshot.empty) {
            const msg = email 
                ? "Este e-mail já foi utilizado para enviar uma comprovação nesta lista."
                : "Este Instagram já foi utilizado para enviar uma comprovação nesta lista.";
            throw new Error(msg);
        }

        const docRef = await firestore.collection('oneTimePostSubmissions').add({
            ...data,
            email: email,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating one-time post submission: ", error);
        if (error instanceof Error) {
            throw new Error(error.message);
        }
        throw new Error("Não foi possível enviar sua comprovação e nome. Ocorreu um erro desconhecido.");
    }
};

export const getOneTimePostSubmissions = async (postId: string): Promise<OneTimePostSubmission[]> => {
    try {
        const q = firestore.collection("--- START OF FILE pages/PostCheck.tsx ---

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter, updateAssignment, scheduleWhatsAppReminder } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon, CalendarIcon, WhatsAppIcon } from '../components/Icons';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import firebase from 'firebase/compat/app';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const extractGoogleDriveId = (url: string): string | null => {
    let id = null;
    const patterns = [ /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/, /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/, /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/ ];
    for (const pattern of patterns) { const match = url.match(pattern); if (match && match[1]) { id = match[1]; break; } }
    return id;
};

const formatDateForICS = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
};

const isAssignmentActive = (assignment: PostAssignment): boolean => {
    // 1. Proof Submitted -> History (Done)
    if (assignment.proofSubmittedAt) return false;

    // 2. Justification Logic
    // If status is accepted or rejected, it's history.
    if (assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') {
        return false;
    }
    // If status is pending (or legacy justification exists without status), it's active.
    if (assignment.justificationStatus === 'pending' || assignment.justification) {
        return true;
    }

    // 3. Post Deactivated -> History
    if (!assignment.post.isActive) return false;

    // 4. Check Expiration
    const now = new Date();
    const expiresAt = toDateSafe(assignment.post.expiresAt);
    
    if (expiresAt && now > expiresAt) {
        // If late submissions allowed, it's still active
        if (assignment.post.allowLateSubmissions) return true;

        // If confirmed, check the 24h window from confirmation time
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if (confirmedAt) {
                const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                if (now < deadline) return true; // Still in window
            }
        }
        
        // Otherwise expired/missed -> History
        return false;
    }

    return true;
};

const CountdownTimer: React.FC<{ targetDate: any, onEnd?: () => void }> = ({ targetDate, onEnd }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);
    useEffect(() => {
        const target = toDateSafe(targetDate);
        if (!target) return;
        const updateTimer = () => {
            const now = new Date();
            const difference = target.getTime() - now.getTime();
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                setTimeLeft(timeString); setIsExpired(false);
            } else {
                setTimeLeft('Liberado!'); setIsExpired(true);
                if (onEnd) onEnd();
            }
        };
        updateTimer(); const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [targetDate, onEnd]);
    if (!timeLeft) return null;
    return <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-1 ${isExpired ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'}`}><ClockIcon className="h-4 w-4" /><span>{timeLeft}</span></div>;
};

const ProofSection: React.FC<{ assignment: PostAssignment, onJustify: (assignment: PostAssignment) => void, onReminderRequested: () => void }> = ({ assignment, onJustify, onReminderRequested }) => {
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState('');
    const [isButtonEnabled, setIsButtonEnabled] = useState(false);
    const [enableTimeDate, setEnableTimeDate] = useState<Date | null>(null);
    const allowJustification = assignment.post.allowJustification !== false;
    const [isRequestingReminder, setIsRequestingReminder] = useState(false);


    useEffect(() => {
        if (!assignment.confirmedAt) return;
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;
        
        // Calculate expiration and enablement times
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        const calculatedEnableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);
        
        setEnableTimeDate(calculatedEnableTime);

        const timer = setInterval(() => {
            const now = new Date();
            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) { 
                    setTimeLeft('Envio fora do prazo liberado pelo organizador.'); 
                    setIsButtonEnabled(true); 
                } else { 
                    setTimeLeft('Tempo esgotado'); 
                    setIsButtonEnabled(false); 
                }
                clearInterval(timer); 
                return;
            }
            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setTimeLeft(`Envio liberado! Expira em: ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`);
                setIsButtonEnabled(true); return;
            }
            
            if (now < calculatedEnableTime) {
                const diff = calculatedEnableTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`liberação para envio de print em ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setIsButtonEnabled(false);
            } else {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`Expira em: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setIsButtonEnabled(true);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [assignment.confirmedAt, assignment.post.allowLateSubmissions, assignment.post.allowImmediateProof]);

    const handleAddToCalendar = () => {
        if (!enableTimeDate) return;
        
        const title = `Enviar Print - ${assignment.post.campaignName}`;
        const description = `Está na hora de enviar o print da sua publicação!\\n\\nAcesse o link para enviar: ${window.location.href}`;
        const endDate = new Date(enableTimeDate.getTime() + 60 * 60 * 1000); // 1 hour duration

        const now = formatDateForICS(new Date());
        const start = formatDateForICS(enableTimeDate);
        const end = formatDateForICS(endDate);

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Equipe Certa//NONSGML v1.0//EN',
            'BEGIN:VEVENT',
            `UID:${now}-${Math.random().toString(36).substring(2)}@equipecerta.com`,
            `DTSTAMP:${now}`,
            `DTSTART:${start}`,
            `DTEND:${end}`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${description}`,
            `URL:${window.location.href}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', 'lembrete_post.ics');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleRequestReminder = async () => {
        setIsRequestingReminder(true);
        try {
          await scheduleWhatsAppReminder(assignment.id);
          onReminderRequested();
        } catch (err: any) {
          alert(err.message || "Erro ao agendar lembrete.");
          setIsRequestingReminder(false);
        }
    };


    if (assignment.proofImageUrls && assignment.proofImageUrls.length > 0) {
        return (<div className="mt-4 text-center"><p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p><div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div></div>);
    }
    const isExpired = timeLeft === 'Tempo esgotado';
    
    return (
        <div className="mt-4 text-center">
            {isExpired ? (
                allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full sm:w-auto px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <button onClick={() => navigate(`/proof/${assignment.id}`)} disabled={!isButtonEnabled} className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Comprovação de Postagem</button>
                    {!isButtonEnabled && enableTimeDate && (
                        <button 
                            onClick={handleAddToCalendar}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-900/30 text-indigo-300 text-xs font-semibold rounded-full border border-indigo-500/30 hover:bg-indigo-900/50 transition-colors"
                        >
                            <CalendarIcon className="w-3 h-3" />
                            Agendar Lembrete no Calendário
                        </button>
                    )}
                    <button
                        onClick={handleRequestReminder}
                        disabled={isRequestingReminder || !!assignment.whatsAppReminderRequestedAt}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-green-900/30 text-green-300 border border-green-700/50 rounded-lg hover:bg-green-900/50 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <WhatsAppIcon className="w-4 h-4" />
                        {isRequestingReminder ? 'Agendando...' : (assignment.whatsAppReminderRequestedAt ? 'Lembrete Agendado!' : 'Agendar lembrete no WhatsApp')}
                    </button>
                </div>
            )}
            <p className={`text-xs mt-2 ${isExpired ? 'text-red-400' : 'text-gray-400'}`}>{timeLeft}</p>
        </div>
    );
};

const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void, onReminderRequested: () => void }> = ({ assignment, onConfirm, onJustify, onReminderRequested }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isMediaProcessing, setIsMediaProcessing] = useState(false);
    const allowJustification = assignment.post.allowJustification !== false;

    if (!assignment.promoterHasJoinedGroup) return (<div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500"><h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}<p className="mt-2 text-yellow-300">Você tem uma nova publicação para este evento!</p><p className="mt-2 text-gray-300 text-sm">Para visualizar, primeiro você precisa confirmar a leitura das regras e entrar no grupo do WhatsApp.</p><div className="mt-4 text-center"><Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors">Verificar Status e Aceitar Regras</Link></div></div>);

    const handleConfirm = async () => { setIsConfirming(true); try { await onConfirm(assignment); } finally { setIsConfirming(false); } };
    const handleCopyLink = () => { if (!assignment.post.postLink) return; navigator.clipboard.writeText(assignment.post.postLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(err => { console.error('Failed to copy link: ', err); alert('Falha ao copiar link.'); }); };
    const now = new Date();
    const isExpired = assignment.post.expiresAt && toDateSafe(assignment.post.expiresAt) < now;
    const isPostDownloadable = assignment.post.isActive && !isExpired;
    
    const handleFirebaseDownload = async () => {
        if (!isPostDownloadable || isMediaProcessing || !assignment.post.mediaUrl) return;
        setIsMediaProcessing(true);
        try {
            const path = assignment.post.mediaUrl;
            let finalUrl = path;
            if (!path.startsWith('http')) { const storageRef = storage.ref(path); finalUrl = await storageRef.getDownloadURL(); }
            const link = document.createElement('a'); link.href = finalUrl; const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download'; link.setAttribute('download', filename); link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } catch (error: any) { console.error('Failed to download from Firebase:', error); alert(`Não foi possível baixar a mídia do Link 1: ${error.message}`); } finally { setIsMediaProcessing(false); }
    };
    const handleGoogleDriveDownload = () => { if (!isPostDownloadable || !assignment.post.googleDriveUrl) return; const { googleDriveUrl, type } = assignment.post; let urlToOpen = googleDriveUrl; if (type === 'video') { const fileId = extractGoogleDriveId(googleDriveUrl); if (fileId) { urlToOpen = `https://drive.google.com/uc?export=download&id=${fileId}`; } } window.open(urlToOpen, '_blank'); };
    
    const renderJustificationStatus = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => { 
        const styles = { pending: "bg-yellow-900/50 text-yellow-300", accepted: "bg-green-900/50 text-green-300", rejected: "bg-red-900/50 text-red-300" }; 
        const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" }; 
        const effectiveStatus = status || 'pending';
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[effectiveStatus]}`}>{text[effectiveStatus]}</span>; 
    };
    
    const hasProof = !!assignment.proofSubmittedAt;
    const hasJustification = !!assignment.justification;

    const renderActions = () => {
        if (hasProof) return (<div className="mt-4 text-center"><p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>{assignment.proofImageUrls && assignment.proofImageUrls.length > 0 ? (<div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div>) : (<p className="text-xs text-gray-400">(Concluído automaticamente)</p>)}</div>);
        
        if (hasJustification) {
            return (
                <div className="mt-4 text-center">
                    <p className="text-sm text-yellow-300 font-semibold mb-2">Justificativa Enviada</p>
                    <p className="text-sm italic text-gray-300 bg-gray-800 p-2 rounded-md mb-2">"{assignment.justification}"</p>
                    <div className="text-xs mb-2">Status: {renderJustificationStatus(assignment.justificationStatus)}</div>
                    {assignment.justificationResponse && (<div className="mt-2 text-left bg-dark p-3 rounded-md border-l-4 border-primary"><p className="text-sm font-semibold text-primary mb-1">Resposta do Organizador:</p><p className="text-sm text-gray-300 whitespace-pre-wrap">{assignment.justificationResponse}</p></div>)}
                </div>
            );
        }

        if (assignment.status === 'pending') {
            if (!assignment.post.isActive || isExpired) {
                return (<div className="w-full flex flex-col sm:flex-row gap-2">{allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)}</div>);
            }
            return (<div className="w-full flex flex-col sm:flex-row gap-2">{allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada ou não é permitida. Por favor, procure o administrador.")} className="w-full px-4 py-2 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)}<button onClick={handleConfirm} disabled={isConfirming} className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">{isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}</button></div>);
        }
        if (assignment.status === 'confirmed') return <ProofSection assignment={assignment} onJustify={onJustify} onReminderRequested={onReminderRequested} />;
        return null;
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-3"><div><p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}{assignment.post.postFormats && assignment.post.postFormats.length > 0 && (<div className="flex gap-2 mt-1">{assignment.post.postFormats.map(format => (<span key={format} className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-600 text-gray-200 capitalize">{format}</span>))}</div>)}</div><div className="flex flex-col items-end gap-1 flex-shrink-0">{assignment.post.expiresAt && (<div className="flex items-center gap-2"><span className="text-xs text-gray-400 font-medium">Tempo restante:</span><CountdownTimer targetDate={assignment.post.expiresAt} /></div>)}<div className="mt-1">{assignment.status === 'confirmed' ? (<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>) : (<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>)}</div></div></div>
            <div className="border-t border-gray-700 pt-3">
                {assignment.post.type === 'text' && (<div className="bg-gray-800 p-3 rounded-md mb-4"><pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre></div>)}
                {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                    <div className="mb-4"><StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} controls={assignment.post.type === 'video'} className="w-full max-w-sm mx-auto rounded-md" /><div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">{assignment.post.mediaUrl && (<button onClick={handleFirebaseDownload} disabled={isMediaProcessing} className={`flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold disabled:opacity-50 ${!isPostDownloadable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}`} title={!isPostDownloadable ? "Download desabilitado para posts inativos" : "Baixar do nosso servidor (Firebase)"}><DownloadIcon className="w-4 h-4" /><span>Download Link 1</span></button>)}{assignment.post.googleDriveUrl && (<button onClick={handleGoogleDriveDownload} disabled={!isPostDownloadable} className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold ${!isPostDownloadable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`} title={!isPostDownloadable ? "Download desabilitado para posts inativos" : "Baixar do Google Drive"}><DownloadIcon className="w-4 h-4" /><span>Download Link 2</span></button>)}</div>{assignment.post.mediaUrl && assignment.post.googleDriveUrl && (<p className="text-center text-xs text-gray-400 mt-2">Link 1 é do servidor da plataforma, Link 2 é do Google Drive.</p>)}</div>
                )}
                <div className="space-y-2"><h4 className="font-semibold text-gray-200">Instruções:</h4><div className="bg-gray-800/50 p-3 rounded-md"><p className="text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p></div></div>
                {assignment.post.postLink && (<div className="space-y-2 mt-4"><h4 className="font-semibold text-gray-200">Link para Postagem:</h4><div className="bg-gray-800/50 p-3 rounded-md"><div className="flex items-center gap-2"><input type="text" readOnly value={assignment.post.postLink} className="flex-grow w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-sm" /><button onClick={handleCopyLink} className="flex-shrink-0 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold w-24">{linkCopied ? 'Copiado!' : 'Copiar'}</button><a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm font-semibold"><ExternalLinkIcon className="w-4 h-4" /><span>Abrir</span></a></div></div></div>)}
            </div>
            {renderActions()}
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[]>([]);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [justificationAssignment, setJustificationAssignment] = useState<PostAssignment | null>(null);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setAssignments([]);
        setScheduledPosts([]);
        setSearched(true);
        try {
            const [promoterProfiles, fetchedAssignments, fetchedScheduled] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getAssignmentsForPromoterByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail)
            ]);

            if (promoterProfiles.length === 0) {
                setError("Nenhum cadastro encontrado com este e-mail.");
                setIsLoading(false);
                return;
            }
            
            setPromoter(promoterProfiles[0]); 

            const assignmentsWithGroupStatus = fetchedAssignments.map(assignment => {
                const promoterProfile = promoterProfiles.find(p => p.id === assignment.promoterId);
                return { ...assignment, promoterHasJoinedGroup: promoterProfile?.hasJoinedGroup || false };
            });

            setAssignments(assignmentsWithGroupStatus);
            setScheduledPosts(fetchedScheduled);

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao buscar.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search, performSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(`/posts?email=${encodeURIComponent(email)}`); 
    };

    const handleConfirmAssignment = async (assignment: PostAssignment) => {
        try {
            await confirmAssignment(assignment.id);
            performSearch(email);
        } catch (err: any) {
            alert(err.message);
        }
    };
    
    const handleReminderRequested = () => {
        // Optimistically update the UI to show the button as disabled
        setAssignments(prev => prev.map(a => 
            a.id === a.id ? { ...a, whatsAppReminderRequestedAt: firebase.firestore.Timestamp.now() } : a
        ));
        alert("Lembrete agendado com sucesso para daqui a 6 horas!");
    };

    const handleOpenJustification = (assignment: PostAssignment) => {
        setJustificationAssignment(assignment);
        setJustificationText('');
        setJustificationFiles([]);
    };

    const handleJustificationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setJustificationFiles(Array.from(e.target.files));
    };

    const handleSubmitJustification = async () => {
        if (!justificationAssignment) return;
        if (!justificationText.trim()) {
            alert("Por favor, explique o motivo.");
            return;
        }
        setIsSubmittingJustification(true);
        try {
            await submitJustification(justificationAssignment.id, justificationText, justificationFiles);
            setJustificationAssignment(null);
            performSearch(email);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsSubmittingJustification(false);
        }
    };

    const renderScheduledPosts = () => {
        if (scheduledPosts.length === 0) return null;
        return (
            <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-300 mb-4 flex items-center gap-2"><ClockIcon className="w-6 h-6" /> Em Breve</h2>
                <div className="space-y-4">
                    {scheduledPosts.map(post => (
                        <div key={post.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between">
                            <div>
                                <p className="font-semibold text-white">{post.postData.campaignName}</p>
                                <p className="text-sm text-gray-400">Agendado para: {toDateSafe(post.scheduledAt)?.toLocaleString('pt-BR')}</p>
                            </div>
                            <span className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-500/30">Aguardando</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Filter active vs history based on updated logic
    const activeAssignments = assignments.filter(a => isAssignmentActive(a));
    const historyAssignments = assignments.filter(a => !isAssignmentActive(a));

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
                {promoter && <button onClick={() => setIsStatsModalOpen(true)} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 text-sm font-semibold">Minhas Estatísticas</button>}
            </div>
            <div className="bg-secondary shadow-2xl rounded-lg p-8 mb-6">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail para ver suas tarefas de divulgação.</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" required />
                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50">{isLoading ? 'Buscando...' : 'Ver Tarefas'}</button>
                </form>
            </div>

            {searched && !isLoading && (
                <div className="space-y-8">
                    {renderScheduledPosts()}
                    
                    {/* Active Assignments */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircleIcon className="w-6 h-6 text-primary" /> Tarefas Pendentes
                        </h2>
                        {activeAssignments.length > 0 ? (
                            activeAssignments.map(assignment => (
                                <PostCard key={assignment.id} assignment={assignment} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} onReminderRequested={handleReminderRequested} />
                            ))
                        ) : (
                            <p className="text-center text-gray-400 py-4 border border-gray-700 rounded-lg bg-dark/50">Nenhuma tarefa pendente no momento! 🎉</p>
                        )}
                    </div>

                    {/* History Assignments */}
                    {historyAssignments.length > 0 && (
                        <div className="space-y-6 pt-6 border-t border-gray-700">
                            <button 
                                onClick={() => setShowHistory(!showHistory)} 
                                className="w-full flex justify-between items-center text-xl font-bold text-gray-400 hover:text-white transition-colors"
                            >
                                <span>Histórico ({historyAssignments.length})</span>
                                <span className="text-sm bg-gray-700 px-3 py-1 rounded-full">{showHistory ? 'Ocultar' : 'Mostrar'}</span>
                            </button>
                            
                            {showHistory && (
                                <div className="space-y-6 animate-fadeIn">
                                    {historyAssignments.map(assignment => (
                                        <PostCard key={assignment.id} assignment={assignment} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} onReminderRequested={handleReminderRequested} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {justificationAssignment && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold text-white mb-4">Justificar Ausência</h3>
                        <p className="text-gray-300 text-sm mb-4">Explique por que você não pôde realizar esta publicação ({justificationAssignment.post.campaignName}).</p>
                        <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Motivo..." rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 mb-4" />
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Anexar Print/Foto (Opcional)</label>
                            <input type="file" onChange={handleJustificationFileChange} multiple accept="image/*" className="text-sm text-gray-400" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setJustificationAssignment(null)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                            <button onClick={handleSubmitJustification} disabled={isSubmittingJustification} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">{isSubmittingJustification ? 'Enviando...' : 'Enviar'}</button>
                        </div>
                    </div>
                </div>
            )}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;