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
  postData: Omit<Post, 'id' | 'createdAt' | 'imageUrl'>,
  imageFile: File | null,
  assignedPromoters: Promoter[]
): Promise<string> => {
  try {
    let finalImageUrl: string | undefined = undefined;

    // 1. Upload image on the client if it exists
    if (imageFile) {
      const fileExtension = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const storageRef = ref(storage, `posts-images/${fileName}`);
      await uploadBytes(storageRef, imageFile);
      finalImageUrl = await getDownloadURL(storageRef);
    }

    // 2. Prepare data for the cloud function
    const finalPostData = {
        ...postData,
        imageUrl: finalImageUrl,
    };

    // 3. Call the cloud function to create docs and send emails
    const createPostAndNotify = httpsCallable(functions, 'createPostAndNotify');
    const result = await createPostAndNotify({ postData: finalPostData, assignedPromoters });
    
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

export const getPostsForOrg = async (organizationId: string): Promise<Post[]> => {
    try {
        const q = query(collection(firestore, "posts"), where("organizationId", "==", organizationId));
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
        
        // Sort by pending first, then by date
        assignments.sort((a, b) => {
            if (a.status === 'pending' && b.status === 'confirmed') return -1;
            if (a.status === 'confirmed' && b.status === 'pending') return 1;
            const postA = a.post as any;
            const postB = b.post as any;
            return ((postB.createdAt as Timestamp)?.toMillis() || 0) - ((postA.createdAt as Timestamp)?.toMillis() || 0)
        });
        return assignments;
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