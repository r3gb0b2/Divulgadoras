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
    
    // Base query: only fetch non-archived promoters
    // Using '!=' includes documents where the field is false OR missing.
    queryConstraints.push(where("isArchived", "!=", true));

    if (statusFilter !== 'all') {
        queryConstraints.push(where("status", "==", statusFilter));
    }
    
    // CRITICAL FIX: Order by a single field to avoid complex composite indexes.
    // The visual sorting for other fields will happen on the client-side.
    // We order by createdAt to keep the list roughly chronological.
    queryConstraints.push(orderBy("createdAt", "desc"));
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
    // Check if it's an index error and provide a helpful message.
    if (error instanceof Error && error.message.includes('requires an index')) {
        console.error("Firestore index required. Please create it using the link in the browser console error message.");
        throw new Error("O banco de dados precisa de uma configuração. Por favor, verifique o console de erros do navegador para um link de criação de índice.");
    }
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
      orderBy("createdAt", "desc"), // Order by date for consistency
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

        const pendingQuery = query(promotersRef, where("status", "==", "pending"), where("isArchived", "!=", true));
        const approvedQuery = query(promotersRef, where("status", "==", "approved"), where("isArchived", "!=", true));
        const rejectedQuery = query(promotersRef, where("status", "==", "rejected"), where("isArchived", "!=", true));
        
        const [pendingSnapshot, approvedSnapshot, rejectedSnapshot] = await Promise.all([
            getCountFromServer(pendingQuery),
            getCountFromServer(approvedQuery),
            getCountFromServer(rejectedQuery)
        ]);
        
        const pendingCount = pendingSnapshot.data().count;
        const approvedCount = approvedSnapshot.data().count;
        const rejectedCount = rejectedSnapshot.data().count;

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