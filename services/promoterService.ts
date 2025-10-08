import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, where, DocumentSnapshot, getCountFromServer, limit, orderBy, startAfter, QueryDocumentSnapshot, QueryConstraint, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Promoter, PromoterApplicationData } from '../types';

const PAGE_SIZE = 20;

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
    // Check for existing email before proceeding
    const q = query(collection(firestore, "promoters"), where("email", "==", promoterData.email.toLowerCase().trim()));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error("Este e-mail já foi cadastrado.");
    }

    const photoUrls = await Promise.all(
      promoterData.photos.map(async (photo) => {
        const fileExtension = photo.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}.${fileExtension}`;
        const storageRef = ref(storage, `promoters-photos/${fileName}`);
        await uploadBytes(storageRef, photo);
        return await getDownloadURL(storageRef);
      })
    );

    const { photos, ...rest } = promoterData;

    const newPromoter = {
      ...rest,
      photoUrls,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      notes: '',
      isArchived: false,
    };

    await addDoc(collection(firestore, 'promoters'), newPromoter);
  } catch (error) {
    console.error("Error adding promoter: ", error);
    if (error instanceof Error) {
        throw error; // Re-throw the specific error
    }
    throw new Error("Não foi possível enviar o cadastro. Tente novamente.");
  }
};

export const getPromoters = async (
    statusFilter: 'pending' | 'approved' | 'rejected' | 'all',
    lastVisible: QueryDocumentSnapshot | null = null
): Promise<{ promoters: Promoter[], lastDoc: QueryDocumentSnapshot | null }> => {
  try {
    const promotersRef = collection(firestore, "promoters");
    const queryConstraints: QueryConstraint[] = [];
    
    // NOTE: The isArchived filter was removed from the query to avoid invalid
    // compound queries that require a manual index in Firestore.
    // Filtering is now handled on the client-side in AdminPanel.tsx.

    if (statusFilter !== 'all') {
        queryConstraints.push(where("status", "==", statusFilter));
    }
    
    // Order by document ID to support pagination without custom indexes.
    queryConstraints.push(orderBy("__name__", "desc"));
    queryConstraints.push(limit(PAGE_SIZE));
    
    if (lastVisible) {
        queryConstraints.push(startAfter(lastVisible));
    }

    const q = query(promotersRef, ...queryConstraints);
    const documentSnapshots = await getDocs(q);
    
    const promoters: Promoter[] = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1] || null;

    return { promoters, lastDoc };

  } catch (error) {
    console.error("Error getting promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras.");
  }
};

export const getArchivedPromoters = async (
    lastVisible: QueryDocumentSnapshot | null = null
): Promise<{ promoters: Promoter[], lastDoc: QueryDocumentSnapshot | null }> => {
  try {
    const promotersRef = collection(firestore, "promoters");
    const queryConstraints: QueryConstraint[] = [
      where("isArchived", "==", true),
      orderBy("__name__", "desc"),
      limit(PAGE_SIZE)
    ];
    
    if (lastVisible) {
        queryConstraints.push(startAfter(lastVisible));
    }

    const q = query(promotersRef, ...queryConstraints);
    const documentSnapshots = await getDocs(q);
    
    const promoters: Promoter[] = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1] || null;

    return { promoters, lastDoc };

  } catch (error) {
    console.error("Error getting archived promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras arquivadas.");
  }
};

export const getPromotersCount = async (): Promise<{ total: number, pending: number, approved: number, rejected: number }> => {
    try {
        const promotersRef = collection(firestore, "promoters");

        // Helper function to get counts for a status, avoiding invalid compound queries.
        const getStatusCount = async (status: 'pending' | 'approved' | 'rejected') => {
            const totalQuery = query(promotersRef, where("status", "==", status));
            const archivedQuery = query(promotersRef, where("status", "==", status), where("isArchived", "==", true));
            
            const [totalSnapshot, archivedSnapshot] = await Promise.all([
                getCountFromServer(totalQuery),
                getCountFromServer(archivedQuery)
            ]);

            // The final count is the total for a status minus the archived ones for that same status.
            return totalSnapshot.data().count - archivedSnapshot.data().count;
        };
        
        const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
            getStatusCount('pending'),
            getStatusCount('approved'),
            getStatusCount('rejected')
        ]);
        
        const totalCount = pendingCount + approvedCount + rejectedCount;

        return {
            total: totalCount,
            pending: pendingCount,
            approved: approvedCount,
            rejected: rejectedCount,
        };
    } catch (error) {
        console.error("Error getting promoter counts: ", error);
        throw new Error("Não foi possível carregar as estatísticas.");
    }
};


export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    const promoterDoc = doc(firestore, 'promoters', id);
    await updateDoc(promoterDoc, data);
  } catch (error) {
    console.error("Error updating promoter: ", error);
    throw new Error("Não foi possível atualizar a divulgadora.");
  }
};

export const archivePromoter = async (id: string): Promise<void> => {
    try {
      const promoterDoc = doc(firestore, 'promoters', id);
      await updateDoc(promoterDoc, { isArchived: true });
    } catch (error) {
      console.error("Error archiving promoter: ", error);
      throw new Error("Não foi possível arquivar a divulgadora.");
    }
};

export const restorePromoter = async (id: string): Promise<void> => {
    try {
      const promoterDoc = doc(firestore, 'promoters', id);
      await updateDoc(promoterDoc, { isArchived: false });
    } catch (error) {
      console.error("Error restoring promoter: ", error);
      throw new Error("Não foi possível restaurar a divulgadora.");
    }
};

export const deletePromoterPermanently = async (promoter: Promoter): Promise<void> => {
    try {
        // Delete photos from Storage first
        if (promoter.photoUrls && promoter.photoUrls.length > 0) {
            await Promise.all(promoter.photoUrls.map(async (url) => {
                try {
                    const photoRef = ref(storage, url);
                    await deleteObject(photoRef);
                } catch (storageError: any) {
                    // Log error but continue, e.g., if file doesn't exist
                    console.warn(`Could not delete photo ${url}:`, storageError.code);
                }
            }));
        }
        
        // Then, delete the document from Firestore
        const promoterDoc = doc(firestore, 'promoters', promoter.id);
        await deleteDoc(promoterDoc);

    } catch (error) {
      console.error("Error permanently deleting promoter: ", error);
      throw new Error("Não foi possível excluir permanentemente a divulgadora.");
    }
};

export const checkPromoterStatus = async (email: string): Promise<Promoter | null> => {
    try {
        const q = query(collection(firestore, "promoters"), where("email", "==", email.toLowerCase().trim()));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }
        // Assuming one registration per email
        const promoterDoc = querySnapshot.docs[0];
        return { id: promoterDoc.id, ...promoterDoc.data() } as Promoter;
    } catch (error) {
        console.error("Error checking promoter status: ", error);
        throw new Error("Não foi possível verificar o status.");
    }
};