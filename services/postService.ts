import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Post, PostAssignment, Promoter, ScheduledPost, Timestamp, OneTimePost, OneTimePostSubmission } from '../types';
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
    let finalMediaUrl: string | undefined = postData.googleDriveUrl; // Start with GDrive URL

    // 1. Upload media file to Firebase Storage if provided (it takes precedence)
    if (mediaFile) {
      const fileExtension = mediaFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const storageRef = storage.ref(`posts-media/${fileName}`);
      await storageRef.put(mediaFile);
      finalMediaUrl = await storageRef.getDownloadURL(); // Get the full URL for immediate use
    }

    // 2. Prepare data for the cloud function
    const finalPostData = {
        ...postData,
        mediaUrl: finalMediaUrl,
        // The form now provides both, so let's ensure both are passed if they exist.
        googleDriveUrl: postData.googleDriveUrl, 
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
    } else if (assignment.justification) {
      justifications++;
      if (assignment.justificationStatus === 'accepted') {
        acceptedJustifications++;
      } else if (assignment.justificationStatus === 'rejected') {
        missed++;
      } else { // 'pending' justification
        pending++;
      }
    } else { // No proof, no justification
      let deadlineHasPassed = false;
      if (!assignment.post.allowLateSubmissions) {
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
          const confirmationTime = toDateSafe(assignment.confirmedAt);
          if (confirmationTime) {
            const proofExpireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
            if (now > proofExpireTime) {
              deadlineHasPassed = true;
            }
          }
        }
        if (!deadlineHasPassed) {
          const postExpiresAt = assignment.post.expiresAt;
          const postExpiresDate = toDateSafe(postExpiresAt);
          if (postExpiresDate && postExpiresDate < now) {
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
            if (!a.post || !a.post.createdAt) {
                console.warn(`[Stats] Filtering out assignment ${a.id} for promoter ${promoterId} due to missing 'post' or 'post.createdAt' field.`);
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
            if (!a.post || !a.post.createdAt) {
                console.warn(`[Stats] Filtering out assignment ${a.id} for email ${email} due to missing 'post' or 'post.createdAt' field.`);
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

export const sendSinglePostReminder = async (assignmentId: string): Promise<{message: string}> => {
    try {
        const func = functions.httpsCallable('sendSingleProofReminder');
        const result = await func({ assignmentId });
        return result.data as {message: string};
    } catch (error) {
        console.error("Error sending single post reminder:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Não foi possível enviar o lembrete.");
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
            proofImageUrls: [], 
            proofSubmittedAt: null,
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

export const getOneTimePostsForOrg = async (organizationId: string): Promise<OneTimePost[]> => {
    try {
        const q = firestore.collection("oneTimePosts").where("organizationId", "==", organizationId).orderBy("createdAt", "desc");
        const snapshot = await q.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePost));
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
        const docRef = await firestore.collection('oneTimePostSubmissions').add({
            ...data,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating one-time post submission: ", error);
        if (error instanceof Error) {
            throw new Error(`Não foi possível enviar sua comprovação e nome. Detalhes: ${error.message}`);
        }
        throw new Error("Não foi possível enviar sua comprovação e nome. Ocorreu um erro desconhecido.");
    }
};

export const getOneTimePostSubmissions = async (postId: string): Promise<OneTimePostSubmission[]> => {
    try {
        const q = firestore.collection("oneTimePostSubmissions").where("oneTimePostId", "==", postId).orderBy("submittedAt", "desc");
        const snapshot = await q.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OneTimePostSubmission));
    } catch (error) {
        console.error("Error getting one-time post submissions: ", error);
        throw new Error("Não foi possível buscar as submissões.");
    }
};

export const deleteOneTimePost = async (postId: string): Promise<void> => {
  const batch = firestore.batch();
  try {
      const q = firestore.collection("oneTimePostSubmissions").where("oneTimePostId", "==", postId);
      const submissionsSnapshot = await q.get();
      submissionsSnapshot.forEach(doc => {
          batch.delete(doc.ref);
      });
      const postDocRef = firestore.collection('oneTimePosts').doc(postId);
      batch.delete(postDocRef);
      await batch.commit();
  } catch (error) {
      console.error("Error deleting one-time post and submissions: ", error);
      throw new Error("Não foi possível deletar o post e suas submissões.");
  }
};