
import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp, onSnapshot, Unsubscribe, DocumentData, FieldValue } from 'firebase/firestore';
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

    const newPromoter: Omit<Promoter, 'id' | 'createdAt'> & { createdAt: FieldValue } = {
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
    
    // Filter by organization if an ID is provided
    if (organizationId) {
      q = query(q, where("organizationId", "==", organizationId));
    }

    if (states && states.length > 0) {
      // Admin with specific state assignments
      q = query(q, where("state", "in", states));
    }
    
    const querySnapshot = await getDocs(q);
    const promoters: Promoter[] = [];
    querySnapshot.forEach((doc) => {
      // FIX: Replace spread operator with Object.assign to resolve "Spread types may only be created from object types" error.
      promoters.push(Object.assign({ id: doc.id }, doc.data()) as Promoter);
    });
    
    // Always sort manually on the client-side for consistency and to include documents without `createdAt`.
    promoters.sort((a, b) => {
        const timeA = (a.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
        const timeB = (b.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
        return timeB - timeA;
    });

    return promoters;
  } catch (error) {
    console.error("Error getting promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras.");
  }
};


export const listenToPromoters = (
  organizationId: string | undefined,
  states: string[] | null | undefined,
  callback: (promoters: Promoter[]) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  try {
    let q = query(collection(firestore, "promoters"));

    if (organizationId) {
      q = query(q, where("organizationId", "==", organizationId));
    }

    if (states && states.length > 0) {
      q = query(q, where("state", "in", states));
    }

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const promoters: Promoter[] = [];
      querySnapshot.forEach((doc) => {
        // FIX: Replace spread operator with Object.assign to resolve "Spread types may only be created from object types" error.
        promoters.push(Object.assign({ id: doc.id }, doc.data()) as Promoter);
      });

      promoters.sort((a, b) => {
          const timeA = (a.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
          const timeB = (b.createdAt as unknown as Timestamp)?.toDate?.().getTime() || 0;
          return timeB - timeA;
      });

      callback(promoters);
    }, (error) => {
        console.error("Error listening to promoters: ", error);
        onError(new Error("Não foi possível receber atualizações em tempo real."));
    });

    return unsubscribe;
  } catch (error) {
    console.error("Error setting up promoter listener: ", error);
    throw new Error("Não foi possível iniciar a escuta de divulgadoras.");
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

export const checkPromoterStatus = async (email: string, organizationId?: string): Promise<Promoter[] | null> => {
    try {
        let q = query(
            collection(firestore, "promoters"), 
            where("email", "==", email.toLowerCase().trim())
        );

        if (organizationId) {
            q = query(q, where("organizationId", "==", organizationId));
        }

        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }
        
        const promoters: Promoter[] = [];
        querySnapshot.forEach((doc) => {
            // FIX: Replace spread operator with Object.assign to resolve "Spread types may only be created from object types" error.
            promoters.push(Object.assign({ id: doc.id }, doc.data()) as Promoter);
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

export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
  try {
    const q = query(
      collection(firestore, "promoters"),
      where("organizationId", "==", organizationId),
      where("state", "==", state),
      where("campaignName", "==", campaignName),
      where("status", "==", "approved")
    );
    const querySnapshot = await getDocs(q);
    const promoters: Promoter[] = [];
    querySnapshot.forEach((doc) => {
      promoters.push(Object.assign({ id: doc.id }, doc.data()) as Promoter);
    });
    return promoters.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error getting approved promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras aprovadas.");
  }
};

// --- Rejection Reasons Service ---

export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    try {
        const q = query(
            collection(firestore, "rejectionReasons"),
            where("organizationId", "==", organizationId)
        );
        const querySnapshot = await getDocs(q);
        // FIX: Replace spread operator with Object.assign to resolve "Spread types may only be created from object types" error.
        const reasons = querySnapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()) as RejectionReason);
        
        // Sort client-side to avoid needing a composite index in Firestore
        reasons.sort((a, b) => a.text.localeCompare(b.text));

        return reasons;
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