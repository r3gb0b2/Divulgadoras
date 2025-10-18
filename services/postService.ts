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
import { Post, PostAssignment, Promoter } from '../types';

export const createPost = async (
  postData: Omit<Post, 'id' | 'createdAt' | 'mediaUrl'>,
  mediaFile: File | null,
  assignedPromoters: Promoter[]
): Promise<string> => {
  try {
    let finalMediaUrl: string | undefined = undefined;

    // 1. Upload image/video on the client if it exists
    if (mediaFile) {
      const fileExtension = mediaFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const storageRef = ref(storage, `posts-media/${fileName}`);
      await uploadBytes(storageRef, mediaFile);
      finalMediaUrl = await getDownloadURL(storageRef);
    }

    // 2. Prepare data for the cloud function
    const finalPostData = {
        ...postData,
        mediaUrl: finalMediaUrl,
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
        
        // Filter out inactive or expired posts
        const now = new Date();
        const visibleAssignments = assignments.filter(assignment => {
            const post = assignment.post;
            if (!post.isActive) {
                return false;
            }
            if (post.expiresAt) {
                const expiryDate = (post.expiresAt as Timestamp).toDate();
                if (expiryDate < now) {
                    return false;
                }
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

export const getStatsForPromoter = async (promoterId: string): Promise<{
  stats: { assigned: number; completed: number; missed: number; pending: number };
  assignments: PostAssignment[];
}> => {
  try {
    const q = query(collection(firestore, "postAssignments"), where("promoterId", "==", promoterId));
    const snapshot = await getDocs(q);
    const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

    let completed = 0;
    let missed = 0;
    let pending = 0;
    const now = new Date();

    assignments.forEach(assignment => {
      if (assignment.proofSubmittedAt) {
        completed++;
      } else {
        const expiresAt = assignment.post.expiresAt;
        if (expiresAt && (expiresAt as Timestamp).toDate() < now) {
          missed++;
        } else {
          pending++;
        }
      }
    });

    // Sort assignments by date for display (most recent first)
    assignments.sort((a, b) => {
        const timeA = (a.post.createdAt as Timestamp)?.toMillis() || 0;
        const timeB = (b.post.createdAt as Timestamp)?.toMillis() || 0;
        return timeB - timeA;
    });


    return {
      stats: {
        assigned: assignments.length,
        completed,
        missed,
        pending,
      },
      assignments,
    };
  } catch (error) {
    console.error("Error getting promoter stats: ", error);
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