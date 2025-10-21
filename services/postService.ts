import firebase from '../firebase/config';
import { firestore, storage, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Post, PostAssignment, Promoter } from '../types';
import { Timestamp } from 'firebase/firestore';

export const createPost = async (
  postData: Omit<Post, 'id' | 'createdAt'>,
  mediaFile: File | null, // This is now only for images
  assignedPromoters: Promoter[]
): Promise<string> => {
  try {
    const finalPostData = { ...postData };

    // 1. Upload image on the client ONLY if it's an image post
    if (mediaFile && postData.type === 'image') {
      const fileExtension = mediaFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const storageRef = storage.ref(`posts-media/${fileName}`);
      await storageRef.put(mediaFile);
      finalPostData.mediaUrl = await storageRef.getDownloadURL();
    }
    // For video posts, we assume postData.mediaUrl is already the Google Drive link.
    // For text posts, mediaUrl should be null/undefined.

    // 2. Call the cloud function to create docs. Emails will be sent by a Firestore trigger.
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
        let q: firebase.firestore.Query = firestore.collection("posts");
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

export const getStatsForPromoter = async (promoterId: string): Promise<{
  stats: { assigned: number; completed: number; missed: number; proofDeadlineMissed: number; pending: number };
  assignments: PostAssignment[];
}> => {
  try {
    const q = firestore.collection("postAssignments").where("promoterId", "==", promoterId);
    const snapshot = await q.get();
    const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

    let completed = 0;
    let missed = 0; // Post expired
    let proofDeadlineMissed = 0; // 24h proof window expired
    let pending = 0;
    const now = new Date();

    assignments.forEach(assignment => {
      if (assignment.proofSubmittedAt) {
        completed++;
      } else if (!assignment.post.allowLateSubmissions) {
        let deadlineHasPassed = false;
        
        // Proof deadline is more specific, check it first for confirmed posts
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmationTime = (assignment.confirmedAt as Timestamp).toDate();
            const proofExpireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
            if (now > proofExpireTime) {
                proofDeadlineMissed++;
                deadlineHasPassed = true;
            }
        }

        // If not caught by proof deadline, check general post expiration
        if (!deadlineHasPassed) {
            const postExpiresAt = assignment.post.expiresAt;
            if (postExpiresAt && (postExpiresAt as Timestamp).toDate() < now) {
                missed++;
                deadlineHasPassed = true;
            }
        }

        if (!deadlineHasPassed) {
            pending++;
        }
      } else { // Late submissions are allowed, so it's always pending until submitted
          pending++;
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
        proofDeadlineMissed,
        pending,
      },
      assignments,
    };
  } catch (error) {
    console.error("Error getting promoter stats: ", error);
    throw new Error("Não foi possível buscar as estatísticas da divulgadora.");
  }
};

export const getStatsForPromoterByEmail = async (email: string): Promise<{
  stats: { assigned: number; completed: number; missed: number; proofDeadlineMissed: number; pending: number };
  assignments: PostAssignment[];
}> => {
  try {
    const q = firestore.collection("postAssignments").where("promoterEmail", "==", email.toLowerCase().trim());
    const snapshot = await q.get();
    const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

    let completed = 0;
    let missed = 0; // Post expired
    let proofDeadlineMissed = 0; // 24h proof window expired
    let pending = 0;
    const now = new Date();

    assignments.forEach(assignment => {
      if (assignment.proofSubmittedAt) {
        completed++;
      } else if (!assignment.post.allowLateSubmissions) {
        let deadlineHasPassed = false;
        
        // Proof deadline is more specific, check it first for confirmed posts
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmationTime = (assignment.confirmedAt as Timestamp).toDate();
            const proofExpireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
            if (now > proofExpireTime) {
                proofDeadlineMissed++;
                deadlineHasPassed = true;
            }
        }

        // If not caught by proof deadline, check general post expiration
        if (!deadlineHasPassed) {
            const postExpiresAt = assignment.post.expiresAt;
            if (postExpiresAt && (postExpiresAt as Timestamp).toDate() < now) {
                missed++;
                deadlineHasPassed = true;
            }
        }

        if (!deadlineHasPassed) {
            pending++;
        }
      } else { // Late submissions are allowed, so it's always pending until submitted
          pending++;
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
        proofDeadlineMissed,
        pending,
      },
      assignments,
    };
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