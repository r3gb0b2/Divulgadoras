import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Promoter, PromoterApplicationData, RejectionReason } from '../types';

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
    // Check for existing registration for the same email, state, and campaign
    const q = query(
      collection(firestore, "promoters"),
      where("email", "==", promoterData.email.toLowerCase().trim()),
      where("state", "==", promoterData.state),
      where("campaignName", "==", promoterData.campaignName || null)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error("Você já se cadastrou para este evento/gênero.");
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
      campaignName: promoterData.campaignName || null,
      photoUrls,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
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

export const getPromoters = async (states?: string[] | null): Promise<Promoter[]> => {
  try {
    const promotersRef = collection(firestore, "promoters");
    let q;
    let shouldSortManually = false;

    if (states && states.length > 0) {
      // FIX: Query without orderBy to avoid composite index errors.
      // Sorting will be handled on the client-side after fetching.
      q = query(promotersRef, where("state", "in", states));
      shouldSortManually = true;
    } else if (states === null) { // null means fetch all (for superadmin)
      q = query(promotersRef, orderBy("createdAt", "desc"));
    } else { // states is an empty array, so return nothing.
      return [];
    }
    
    const querySnapshot = await getDocs(q);
    const promoters: Promoter[] = [];
    querySnapshot.forEach((doc) => {
      promoters.push({ id: doc.id, ...doc.data() } as Promoter);
    });
    
    // If we couldn't order by date in the query, do it now.
    if (shouldSortManually) {
        promoters.sort((a, b) => {
            // Firestore timestamps need to be converted to compare.
            const timeA = (a.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
            const timeB = (b.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
            return timeB - timeA; // Sort descending (newest first).
        });
    }

    return promoters;
  } catch (error) {
    console.error("Error getting promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras.");
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

export const deletePromoter = async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(firestore, "promoters", id));
      // Note: This does not delete photos from storage. That would require more logic.
    } catch (error) {
      console.error("Error deleting promoter: ", error);
      throw new Error("Não foi possível deletar a divulgadora.");
    }
};

export const checkPromoterStatus = async (email: string): Promise<Promoter[] | null> => {
    try {
        const q = query(
            collection(firestore, "promoters"), 
            where("email", "==", email.toLowerCase().trim()),
            orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }
        
        const promoters: Promoter[] = [];
        querySnapshot.forEach((doc) => {
            promoters.push({ id: doc.id, ...doc.data() } as Promoter);
        });
        return promoters;
    } catch (error) {
        console.error("Error checking promoter status: ", error);
        throw new Error("Não foi possível verificar o status.");
    }
};

// --- Rejection Reasons Service ---

export const getRejectionReasons = async (): Promise<RejectionReason[]> => {
    try {
        const q = query(collection(firestore, "rejectionReasons"), orderBy("text", "asc"));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, text: doc.data().text } as RejectionReason));
    } catch (error) {
        console.error("Error getting rejection reasons: ", error);
        throw new Error("Não foi possível buscar os motivos de rejeição.");
    }
};

export const addRejectionReason = async (text: string): Promise<string> => {
    try {
        const docRef = await addDoc(collection(firestore, 'rejectionReasons'), { text });
        return docRef.id;
    } catch (error) {
        console.error("Error adding rejection reason: ", error);
        throw new Error("Não foi possível adicionar o motivo de rejeição.");
    }
};

export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    try {
        await updateDoc(doc(firestore, 'rejectionReasons', id), { text });
    } catch (error) {
        console.error("Error updating rejection reason: ", error);
        throw new Error("Não foi possível atualizar o motivo de rejeição.");
    }
};

export const deleteRejectionReason = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, "rejectionReasons", id));
    } catch (error) {
        console.error("Error deleting rejection reason: ", error);
        throw new Error("Não foi possível deletar o motivo de rejeição.");
    }
};