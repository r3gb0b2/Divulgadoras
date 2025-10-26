import { firestore, storage, functions } from '../firebase/config';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  deleteDoc,
  Timestamp,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Post, PostAssignment, Promoter, ScheduledPost } from '../types';
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
      const storageRef = ref(storage, `posts-media/${fileName}`);
      await uploadBytes(storageRef, mediaFile);
      finalMediaUrl = storageRef.fullPath;
    }

    // 2. Prepare data for the cloud function
    const finalPostData = {
        ...postData,
        mediaUrl: finalMediaUrl, // This is now just for firebase path
        // googleDriveUrl is already in postData from the form
    };

    // 3. Call the cloud function to create docs. Emails will be sent by a Firestore trigger.
    const createPostAndAssignments = httpsCallable(functions, 'createPostAndAssignments');
    const result = await createPostAndAssignments({ postData: finalPostData, assignedPromoters });
    
    const data = result.data as { success: boolean, postId?: string };
    if (!data.success || !data.postId) {
        throw new Error("A função do servidor falhou ao criar a publicação.");
    }
    
    return data.postId;

  } catch (error) {
    console.error("Error creating post via cloud function: ", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("Não foi possível criar a publicação.");
  }
};

export const getPostsForOrg = async (organizationId?: string): Promise<Post[]> => {
    try {
        const postsCollection = collection(firestore, "posts");
        const q = organizationId 
            ? query(postsCollection, where("organizationId", "==", organizationId))
            : query(postsCollection);

        const snapshot = await getDocs(q);
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
        const q = query(collection(firestore, "postAssignments"), where("organizationId", "==", organizationId));
        const snapshot = await getDocs(q);
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
        const postDocRef = doc(firestore, 'posts', postId);
        const postSnap = await getDoc(postDocRef);
        if (!postSnap.exists()) {
            throw new Error("Publicação não encontrada.");
        }
        const post = { id: postSnap.id, ...postSnap.data() } as Post;

        // Fetch assignments
        const q = query(collection(firestore, "postAssignments"), where("postId", "==", postId));
        const snapshot = await getDocs(q);
        const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

        return { post, assignments };

    } catch (error) {
        console.error("Error fetching post details: ", error);
        throw new Error("Não foi possível buscar os detalhes da publicação.");
    }
};

export const getAssignmentsForPromoterByEmail = async (email: string): Promise<PostAssignment[]> => {
    try {
        const q = query(collection(firestore, "postAssignments"), where("promoterEmail", "==", email.toLowerCase().trim()));
        const snapshot = await getDocs(q);
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
        const docRef = doc(firestore, 'postAssignments', assignmentId);
        await updateDoc(docRef, {
            status: 'confirmed',
            confirmedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error confirming assignment: ", error);
        throw new Error("Não foi possível confirmar a publicação.");
    }
}

export const getAssignmentById = async (assignmentId: string): Promise<PostAssignment | null> => {
    try {
        const docRef = doc(firestore, 'postAssignments', assignmentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
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
                const storageRef = ref(storage, `posts-proofs/${fileName}`);
                await uploadBytes(storageRef, photo);
                return await getDownloadURL(storageRef);
            })
        );
        
        // 2. Update Firestore document
        const docRef = doc(firestore, 'postAssignments', assignmentId);
        await updateDoc(docRef, {
            proofImageUrls: proofImageUrls,
            proofSubmittedAt: serverTimestamp(),
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
    const q = query(collection(firestore, "postAssignments"), where("promoterId", "==", promoterId));
    const snapshot = await getDocs(q);
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
    const q = query(collection(firestore, "postAssignments"), where("promoterEmail", "==", email.toLowerCase().trim()));
    const snapshot = await getDocs(q);
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
        const updatePostStatus = httpsCallable(functions, 'updatePostStatus');
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
    const batch = writeBatch(firestore);
    try {
        // Find all assignments for the post
        const q = query(collection(firestore, "postAssignments"), where("postId", "==", postId));
        const assignmentsSnapshot = await getDocs(q);
        
        // Add assignments to the batch for deletion
        assignmentsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Add the post itself to the batch for deletion
        const postDocRef = doc(firestore, 'posts', postId);
        batch.delete(postDocRef);

        await batch.commit();

    } catch (error) {
        console.error("Error deleting post and assignments: ", error);
        throw new Error("Não foi possível deletar a publicação.");
    }
}

export const addAssignmentsToPost = async (postId: string, promoterIds: string[]): Promise<void> => {
    try {
        const func = httpsCallable(functions, 'addAssignmentsToPost');
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
        const func = httpsCallable(functions, 'sendPostReminder');
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
        const func = httpsCallable(functions, 'sendSingleProofReminder');
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
        const func = httpsCallable(functions, 'acceptAllJustifications');
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
        const batch = writeBatch(firestore);

        const promoterDocRef = doc(firestore, 'promoters', promoterId);
        batch.update(promoterDocRef, { hasJoinedGroup: false });

        const assignmentDocRef = doc(firestore, 'postAssignments', assignmentId);
        batch.delete(assignmentDocRef);

        await batch.commit();
    } catch (error) {
        console.error("Error removing promoter from post and group:", error);
        throw new Error("Não foi possível remover a divulgadora.");
    }
};

export const renewAssignmentDeadline = async (assignmentId: string): Promise<void> => {
    try {
        const docRef = doc(firestore, 'postAssignments', assignmentId);
        await updateDoc(docRef, {
            confirmedAt: serverTimestamp(),
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
                    const storageRef = ref(storage, `justifications-proofs/${fileName}`);
                    await uploadBytes(storageRef, photo);
                    return await getDownloadURL(storageRef);
                })
            );
        }

        const docRef = doc(firestore, 'postAssignments', assignmentId);
        await updateDoc(docRef, {
            justification: justification,
            justificationStatus: 'pending',
            justificationSubmittedAt: serverTimestamp(),
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
        const docRef = doc(firestore, 'postAssignments', assignmentId);
        await updateDoc(docRef, data);
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
        const docRef = await addDoc(collection(firestore, 'scheduledPosts'), data);
        return docRef.id;
    } catch (error) {
        console.error("Error scheduling post: ", error);
        throw new Error("Não foi possível agendar a publicação.");
    }
};

export const getScheduledPosts = async (organizationId: string): Promise<ScheduledPost[]> => {
    try {
        const q = query(
            collection(firestore, "scheduledPosts"),
            where("organizationId", "==", organizationId)
        );
        const snapshot = await getDocs(q);
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

export const updateScheduledPost = async (id: string, data: Partial<Omit<ScheduledPost, 'id'>>): Promise<void> => {
    try {
        const docRef = doc(firestore, 'scheduledPosts', id);
        await updateDoc(docRef, data);
    } catch (error) {
        console.error("Error updating scheduled post: ", error);
        throw new Error("Não foi possível atualizar o agendamento.");
    }
};

export const deleteScheduledPost = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, "scheduledPosts", id));
    } catch (error) {
        console.error("Error deleting scheduled post: ", error);
        throw new Error("Não foi possível cancelar o agendamento.");
    }
};

// FIX: Added missing 'getScheduledPostsForPromoter' function.
export const getScheduledPostsForPromoter = async (email: string): Promise<ScheduledPost[]> => {
    try {
        const promoterProfiles = await findPromotersByEmail(email);
        if (promoterProfiles.length === 0) {
            return [];
        }

        const orgIds = [...new Set(promoterProfiles.map(p => p.organizationId))];
        if (orgIds.length === 0) {
            return [];
        }

        // Firestore 'in' query can take up to 30 elements. Chunk if necessary.
        const CHUNK_SIZE = 30;
        const scheduledPosts: ScheduledPost[] = [];

        for (let i = 0; i < orgIds.length; i += CHUNK_SIZE) {
            const orgChunk = orgIds.slice(i, i + CHUNK_SIZE);
            const q = query(
                collection(firestore, "scheduledPosts"),
                where("organizationId", "in", orgChunk),
                where("status", "==", "pending")
            );
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
                scheduledPosts.push({ id: doc.id, ...doc.data() } as ScheduledPost);
            });
        }
        
        const promoterIdSet = new Set(promoterProfiles.map(p => p.id));
        const lowerCaseEmail = email.toLowerCase().trim();

        const promoterScheduledPosts = scheduledPosts.filter(post => 
            post.assignedPromoters.some(assigned => 
                promoterIdSet.has(assigned.id) || assigned.email.toLowerCase() === lowerCaseEmail
            )
        );
        
        promoterScheduledPosts.sort((a, b) => 
            ((a.scheduledAt as Timestamp)?.toMillis() || 0) - ((b.scheduledAt as Timestamp)?.toMillis() || 0)
        );

        return promoterScheduledPosts;
    } catch (error) {
        console.error("Error fetching scheduled posts for promoter: ", error);
        throw new Error("Não foi possível buscar as publicações agendadas.");
    }
};