import { firestore, storage, functions } from '../firebase/config';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Post, PostAssignment, Promoter, ScheduledPost } from '../types';

export const createPost = async (postData: Omit<Post, 'id' | 'createdAt'>, mediaFile: File | null, assignedPromoters: Promoter[]): Promise<string> => {
    try {
        const createPostAndAssignments = httpsCallable(functions, 'createPostAndAssignments');

        let mediaUrl: string | null = null;
        if (mediaFile) {
            const fileExtension = mediaFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = ref(storage, `posts-media/${fileName}`);
            await uploadBytes(storageRef, mediaFile);
            mediaUrl = storageRef.fullPath; // Send path to function, not full URL
        }

        const finalPostData = { ...postData, mediaUrl };

        const result = await createPostAndAssignments({
            postData: finalPostData,
            assignedPromoters: assignedPromoters.map(p => ({id: p.id, name: p.name, email: p.email}))
        });

        const data = result.data as { success: boolean, postId: string };
        if (!data.success) {
            throw new Error('A função do servidor falhou ao criar a publicação.');
        }
        return data.postId;

    } catch (error) {
        console.error("Error creating post and assignments: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível criar a publicação.");
    }
};

export const schedulePost = async (postData: Omit<Post, 'id' | 'createdAt'>, mediaFile: File | null, assignedPromoters: Promoter[], scheduledAt: Timestamp): Promise<string> => {
    try {
        let mediaUrl: string | null = null;
        if (mediaFile) {
            const fileExtension = mediaFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = ref(storage, `posts-media/${fileName}`);
            await uploadBytes(storageRef, mediaFile);
            mediaUrl = storageRef.fullPath;
        }

        const scheduledPostData = {
            ...postData,
            mediaUrl,
            assignedPromoters: assignedPromoters.map(p => ({ id: p.id, name: p.name, email: p.email })),
            scheduledAt,
            status: 'scheduled' as const
        };
        
        const docRef = await addDoc(collection(firestore, 'scheduledPosts'), scheduledPostData);
        return docRef.id;

    } catch (error) {
        console.error("Error scheduling post: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível agendar a publicação.");
    }
};

export const getScheduledPosts = async (organizationId: string): Promise<ScheduledPost[]> => {
    try {
        const q = query(collection(firestore, "scheduledPosts"), where("organizationId", "==", organizationId), orderBy("scheduledAt", "asc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledPost));
    } catch (error) {
        console.error("Error getting scheduled posts: ", error);
        throw new Error("Não foi possível buscar as publicações agendadas.");
    }
};

export const updateScheduledPost = async (id: string, data: Partial<Omit<ScheduledPost, 'id'>>): Promise<void> => {
    try {
        const postDoc = doc(firestore, 'scheduledPosts', id);
        await updateDoc(postDoc, data);
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

export const getPostsForOrg = async (organizationId?: string): Promise<Post[]> => {
    try {
        let q = query(collection(firestore, "posts"), orderBy("createdAt", "desc"));
        if (organizationId) {
            q = query(q, where("organizationId", "==", organizationId));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
    } catch (error) {
        console.error("Error getting posts: ", error);
        throw new Error("Não foi possível buscar as publicações.");
    }
};

export const getPostWithAssignments = async (postId: string): Promise<{ post: Post, assignments: PostAssignment[] }> => {
    try {
        const postDocRef = doc(firestore, 'posts', postId);
        const postSnap = await getDoc(postDocRef);
        if (!postSnap.exists()) {
            throw new Error("Publicação não encontrada.");
        }
        const post = { id: postSnap.id, ...postSnap.data() } as Post;

        const assignmentsQuery = query(collection(firestore, "postAssignments"), where("postId", "==", postId));
        const assignmentsSnapshot = await getDocs(assignmentsQuery);
        const assignments = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));

        return { post, assignments };
    } catch (error) {
        console.error("Error getting post with assignments: ", error);
        throw new Error("Não foi possível buscar os detalhes da publicação.");
    }
};

export const getAssignmentsForOrganization = async (organizationId: string): Promise<PostAssignment[]> => {
    try {
        const q = query(collection(firestore, "postAssignments"), where("organizationId", "==", organizationId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PostAssignment));
    } catch (error) {
        console.error("Error getting assignments for organization: ", error);
        throw new Error("Não foi possível buscar as atribuições de posts.");
    }
};


export const updatePost = async (postId: string, updateData: Partial<Post>): Promise<void> => {
    try {
        const updatePostStatus = httpsCallable(functions, 'updatePostStatus');
        await updatePostStatus({ postId, updateData });
    } catch (error) {
        console.error("Error updating post status: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível atualizar o post.");
    }
};


export const deletePost = async (postId: string): Promise<void> => {
    try {
        const batch = writeBatch(firestore);
        
        // Delete post
        const postRef = doc(firestore, "posts", postId);
        batch.delete(postRef);

        // Delete assignments
        const assignmentsQuery = query(collection(firestore, "postAssignments"), where("postId", "==", postId));
        const assignmentsSnapshot = await getDocs(assignmentsQuery);
        assignmentsSnapshot.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

    } catch (error) {
        console.error("Error deleting post: ", error);
        throw new Error("Não foi possível deletar a publicação.");
    }
};

export const getAssignmentById = async (assignmentId: string): Promise<PostAssignment | null> => {
    try {
        const docRef = doc(firestore, 'postAssignments', assignmentId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as PostAssignment : null;
    } catch (error) {
        console.error("Error getting assignment by ID: ", error);
        throw new Error("Não foi possível buscar os dados da tarefa.");
    }
};

export const submitProof = async (assignmentId: string, files: File[]): Promise<void> => {
    if (files.length === 0) throw new Error("Nenhum arquivo de comprovação enviado.");
    try {
        const imageUrls = await Promise.all(files.map(async file => {
            const fileName = `${assignmentId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, `proofs/${fileName}`);
            await uploadBytes(storageRef, file);
            return await getDownloadURL(storageRef);
        }));

        await updateDoc(doc(firestore, "postAssignments", assignmentId), {
            proofImageUrls: imageUrls,
            proofSubmittedAt: serverTimestamp(),
            status: 'completed',
        });
    } catch (error) {
        console.error("Error submitting proof: ", error);
        throw new Error("Não foi possível enviar a comprovação.");
    }
};

export const getStatsForPromoter = async (promoterId: string): Promise<{ stats: any, assignments: PostAssignment[] }> => {
    try {
        const q = query(collection(firestore, 'postAssignments'), where('promoterId', '==', promoterId), orderBy('post.createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const assignments = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as PostAssignment));
        
        const now = new Date();
        const stats = assignments.reduce((acc, a) => {
            acc.assigned++;
            if (a.proofSubmittedAt) {
                acc.completed++;
            } else {
                 const expiresAt = a.post.expiresAt ? (a.post.expiresAt as Timestamp).toDate() : null;
                 if (expiresAt && now > expiresAt) acc.missed++;
                 else acc.pending++;
            }
            return acc;
        }, { assigned: 0, completed: 0, missed: 0, proofDeadlineMissed: 0, pending: 0}); // proofDeadlineMissed requires more logic

        return { stats, assignments };
    } catch (error) {
        console.error("Error getting promoter stats:", error);
        throw new Error("Não foi possível buscar as estatísticas.");
    }
};

export const getStatsForPromoterByEmail = async (email: string): Promise<{ stats: any, assignments: PostAssignment[] }> => {
    try {
        const q = query(collection(firestore, 'postAssignments'), where('promoterEmail', '==', email), orderBy('post.createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const assignments = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as PostAssignment));
        
        const now = new Date();
        const stats = assignments.reduce((acc, a) => {
            acc.assigned++;
            if (a.proofSubmittedAt) {
                acc.completed++;
            } else {
                 const expiresAt = a.post.expiresAt ? (a.post.expiresAt as Timestamp).toDate() : null;
                 if (expiresAt && now > expiresAt) acc.missed++;
                 else acc.pending++;
            }
            return acc;
        }, { assigned: 0, completed: 0, missed: 0, proofDeadlineMissed: 0, pending: 0});

        return { stats, assignments };
    } catch (error) {
        console.error("Error getting promoter stats by email:", error);
        throw new Error("Não foi possível buscar as estatísticas.");
    }
};

export const addAssignmentsToPost = async (postId: string, promoterIds: string[]): Promise<void> => {
    try {
        const addAssignments = httpsCallable(functions, 'addAssignmentsToPost');
        await addAssignments({ postId, promoterIds });
    } catch (error) {
        console.error("Error adding assignments to post: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível adicionar as atribuições.");
    }
};

export const sendPostReminder = async (postId: string): Promise<{ success: boolean; count: number; message: string; }> => {
    try {
        const sendReminder = httpsCallable(functions, 'sendPostReminder');
        const result = await sendReminder({ postId });
        return result.data as { success: boolean; count: number; message: string; };
    } catch (error) {
        console.error("Error sending post reminder: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível enviar os lembretes.");
    }
};

export const removePromoterFromPostAndGroup = async (assignmentId: string, promoterId: string): Promise<void> => {
     try {
        const batch = writeBatch(firestore);
        // Remove assignment
        batch.delete(doc(firestore, "postAssignments", assignmentId));
        // Update promoter status
        batch.update(doc(firestore, "promoters", promoterId), { hasJoinedGroup: false });
        await batch.commit();
    } catch (error) {
        console.error("Error removing promoter from post/group: ", error);
        throw new Error("Não foi possível remover a divulgadora.");
    }
};

export const sendSinglePostReminder = async (assignmentId: string): Promise<{ success: boolean, message: string }> => {
     try {
        const sendReminder = httpsCallable(functions, 'sendSingleProofReminder');
        const result = await sendReminder({ assignmentId });
        return result.data as { success: boolean, message: string };
    } catch (error) {
        console.error("Error sending single reminder: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível enviar o lembrete.");
    }
};

export const renewAssignmentDeadline = async (assignmentId: string): Promise<void> => {
    try {
        await updateDoc(doc(firestore, "postAssignments", assignmentId), {
            confirmedAt: serverTimestamp() // Reset the confirmation time to now
        });
    } catch (error) {
        console.error("Error renewing assignment deadline: ", error);
        throw new Error("Não foi possível renovar o prazo.");
    }
};

export const updateAssignment = async (assignmentId: string, data: Partial<Omit<PostAssignment, 'id'>>): Promise<void> => {
    try {
        await updateDoc(doc(firestore, "postAssignments", assignmentId), data);
    } catch (error) {
        console.error("Error updating assignment: ", error);
        throw new Error("Não foi possível atualizar a atribuição.");
    }
};