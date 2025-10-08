import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, where, DocumentSnapshot, getCountFromServer, limit, orderBy, startAfter, QueryDocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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

    if (statusFilter !== 'all') {
        queryConstraints.push(where("status", "==", statusFilter));
    } else {
        queryConstraints.push(where("isArchived", "==", false));
    }
    
    // To ensure stable pagination without needing a custom Firestore index,
    // we will sort by the document ID ("__name__"). The on-screen sorting
    // is handled in the AdminPanel component. This avoids complex query errors.
    queryConstraints.push(orderBy("__name__"));
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

export const getPromotersCount = async (): Promise<{ total: number, pending: number, approved: number, rejected: number }> => {
    try {
        const promotersRef = collection(firestore, "promoters");

        // Queries for each status
        const totalQuery = query(promotersRef, where("isArchived", "==", false));
        const pendingQuery = query(promotersRef, where("status", "==", "pending"), where("isArchived", "==", false));
        const approvedQuery = query(promotersRef, where("status", "==", "approved"), where("isArchived", "==", false));
        const rejectedQuery = query(promotersRef, where("status", "==", "rejected"), where("isArchived", "==", false));

        // Get counts from server
        const [totalSnapshot, pendingSnapshot, approvedSnapshot, rejectedSnapshot] = await Promise.all([
            getCountFromServer(totalQuery),
            getCountFromServer(pendingQuery),
            getCountFromServer(approvedQuery),
            getCountFromServer(rejectedQuery)
        ]);
        
        return {
            total: totalSnapshot.data().count,
            pending: pendingSnapshot.data().count,
            approved: approvedSnapshot.data().count,
            rejected: rejectedSnapshot.data().count,
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
      // Note: This does not delete photos from storage.
    } catch (error) {
      console.error("Error archiving promoter: ", error);
      throw new Error("Não foi possível arquivar a divulgadora.");
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