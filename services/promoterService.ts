import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Promoter, PromoterApplicationData, RejectionReason } from '../types';

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
    // Check for existing registration for the same email, state, campaign and organization
    const q = query(
      collection(firestore, "promoters"),
      where("email", "==", promoterData.email.toLowerCase().trim()),
      where("state", "==", promoterData.state),
      where("campaignName", "==", promoterData.campaignName || null),
      where("organizationId", "==", promoterData.organizationId)
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

export const getPromoters = async (organizationId: string | undefined, states?: string[] | null): Promise<Promoter[]> => {
  try {
    let q = query(collection(firestore, "promoters"));
    let shouldSortManually = false;

    // Filter by organization if an ID is provided
    if (organizationId) {
      q = query(q, where("organizationId", "==", organizationId));
    }

    if (states && states.length > 0) {
      q = query(q, where("state", "in", states));
      shouldSortManually = true;
    } else if (states === null) {
       // null means fetch all (for superadmin with no orgId or org admin for their org)
       q = query(q, orderBy("createdAt", "desc"));
    } else {
      return [];
    }
    
    const querySnapshot = await getDocs(q);
    const promoters: Promoter[] = [];
    querySnapshot.forEach((doc) => {
      promoters.push({ id: doc.id, ...doc.data() } as Promoter);
    });
    
    if (shouldSortManually) {
        promoters.sort((a, b) => {
            const timeA = (a.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
            const timeB = (b.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
            return timeB - timeA;
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
    } catch (error) {
      console.error("Error deleting promoter: ", error);
      throw new Error("Não foi possível deletar a divulgadora.");
    }
};

export const checkPromoterStatus = async (email: string, organizationId: string): Promise<Promoter[] | null> => {
    try {
        const q = query(
            collection(firestore, "promoters"), 
            where("email", "==", email.toLowerCase().trim()),
            where("organizationId", "==", organizationId)
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }
        
        const promoters: Promoter[] = [];
        querySnapshot.forEach((doc) => {
            promoters.push({ id: doc.id, ...doc.data() } as Promoter);
        });

        promoters.sort((a, b) => {
            const timeA = (a.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
            const timeB = (b.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
            return timeB - timeA;
        });

        return promoters;
    } catch (error) {
        console.error("Error checking promoter status: ", error);
        throw new Error("Não foi possível verificar o status.");
    }
};

// --- Rejection Reasons Service ---

export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    try {
        const q = query(
            collection(firestore, "rejectionReasons"),
            where("organizationId", "==", organizationId),
            orderBy("text", "asc")
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RejectionReason));
    } catch (error) {
        console.error("Error getting rejection reasons: ", error);
        throw new Error("Não foi possível buscar os motivos de rejeição.");
    }
};

export const addRejectionReason = async (text: string, organizationId: string): Promise<string> => {
    try {
        const docRef = await addDoc(collection(firestore, 'rejectionReasons'), { text, organizationId });
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
