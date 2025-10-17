import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp, FieldValue, getCountFromServer, limit, startAfter, QueryDocumentSnapshot, DocumentData, documentId, deleteField, QueryConstraint } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Promoter, PromoterApplicationData, RejectionReason, PromoterStatus } from '../types';

export const addPromoter = async (promoterData: PromoterApplicationData, promoterIdToUpdate: string | null = null): Promise<void> => {
  try {
    const normalizedEmail = promoterData.email.toLowerCase().trim();

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
    
    if (promoterIdToUpdate) {
      const dataToUpdate = {
        ...rest,
        email: normalizedEmail,
        campaignName: promoterData.campaignName || null,
        photoUrls,
        status: 'pending' as const,
        rejectionReason: deleteField(),
        canReapply: deleteField(),
        statusChangedAt: deleteField(),
        actionTakenByEmail: deleteField(),
        actionTakenByUid: deleteField(),
        lastManualNotificationAt: deleteField(),
        hasJoinedGroup: false,
        updatedAt: serverTimestamp(),
      };
      
      const promoterDoc = doc(firestore, 'promoters', promoterIdToUpdate);
      await updateDoc(promoterDoc, dataToUpdate);

    } else {
      // Check for existing registration for the same email, state, campaign and organization
      const q = query(
        collection(firestore, "promoters"),
        where("email", "==", normalizedEmail),
        where("state", "==", promoterData.state),
        where("campaignName", "==", promoterData.campaignName || null),
        where("organizationId", "==", promoterData.organizationId)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        throw new Error("Você já se cadastrou para este evento/gênero.");
      }

      const newPromoter: Omit<Promoter, 'id' | 'createdAt'> & { createdAt: FieldValue } = {
        ...rest,
        email: normalizedEmail,
        campaignName: promoterData.campaignName || null,
        photoUrls,
        status: 'pending' as const,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(firestore, 'promoters'), newPromoter);
    }
  } catch (error) {
    console.error("Error in submit promoter process: ", error);
    if (error instanceof Error) {
        throw error; // Re-throw the specific error
    }
    throw new Error("Não foi possível enviar o cadastro. Tente novamente.");
  }
};

export const getLatestPromoterProfileByEmail = async (email: string): Promise<Promoter | null> => {
    try {
        const q = query(
            collection(firestore, "promoters"),
            where("email", "==", email.toLowerCase().trim())
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }

        // Sort documents by createdAt timestamp descending to find the latest one
        const promoterDocs = querySnapshot.docs.sort((a, b) => {
            const dataA = a.data();
            const dataB = b.data();
            const timeA = (dataA.createdAt instanceof Timestamp) ? dataA.createdAt.toMillis() : 0;
            const timeB = (dataB.createdAt instanceof Timestamp) ? dataB.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        const latestPromoterDoc = promoterDocs[0];

        // FIX: Replace spread operator with Object.assign to resolve "Spread types may only be created from object types" error.
        return Object.assign({ id: latestPromoterDoc.id }, latestPromoterDoc.data()) as Promoter;
    } catch (error) {
        console.error("Error fetching latest promoter profile: ", error);
        throw new Error("Não foi possível buscar os dados do seu cadastro anterior.");
    }
};

export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    try {
        const q = query(
            collection(firestore, "promoters"),
            where("email", "==", email.toLowerCase().trim())
        );
        const querySnapshot = await getDocs(q);
        const promoters: Promoter[] = [];
        querySnapshot.forEach((doc) => {
            promoters.push(Object.assign({ id: doc.id }, doc.data()) as Promoter);
        });
        
        // Sort by most recent first
        promoters.sort((a, b) => {
            const timeA = (a.createdAt instanceof Timestamp) ? a.createdAt.toMillis() : 0;
            const timeB = (b.createdAt instanceof Timestamp) ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        return promoters;
    } catch (error) {
        console.error("Error finding promoters by email: ", error);
        throw new Error("Não foi possível buscar as divulgadoras por e-mail.");
    }
};


interface PromoterQueryOptions {
  organizationId?: string;
  statesForScope?: string[] | null;
  status: PromoterStatus | 'all';
  campaignsInScope: string[] | null;
  selectedCampaign: string | 'all';
  filterOrgId: string | 'all';
  filterState: string | 'all';
}

const buildQueryConstraints = (options: PromoterQueryOptions): { constraints: QueryConstraint[], shouldAbort: boolean } => {
    const constraints: QueryConstraint[] = [];

    // Status filter
    if (options.status !== 'all') {
        constraints.push(where("status", "==", options.status));
    }

    // Organization filter
    const isSuperAdminView = !options.organizationId;

    if (options.filterOrgId !== 'all') {
        // An explicit filter from the UI is selected (by a super admin). This takes priority.
        constraints.push(where("organizationId", "==", options.filterOrgId));
    } else if (!isSuperAdminView) {
        // This is a regular admin view (their org ID is passed), so filter by their organization.
        constraints.push(where("organizationId", "==", options.organizationId));
    }
    // If it is a super admin view (`isSuperAdminView` is true) AND no filter is selected (`filterOrgId` is 'all'),
    // then no organization filter is applied, which allows them to see all promoters.


    // State filter (super admin filter takes precedence)
    const effectiveStates = options.filterState !== 'all' ? [options.filterState] : options.statesForScope;
    if (effectiveStates && effectiveStates.length > 0) {
        // Firestore 'in' query has a limit of 30 items. 
        if (effectiveStates.length > 30) {
            console.warn(`State filter has ${effectiveStates.length} items, exceeding Firestore's limit of 30 for 'in' queries. Using first 30.`);
            constraints.push(where("state", "in", effectiveStates.slice(0, 30)));
        } else {
            constraints.push(where("state", "in", effectiveStates));
        }
    }

    // Campaign filter (combines user scope and super admin filter)
    let finalCampaignFilter: string[] | null = options.campaignsInScope;
    if (options.selectedCampaign !== 'all') {
        if (finalCampaignFilter === null) { // Super admin or admin with full access
            finalCampaignFilter = [options.selectedCampaign];
        } else if (finalCampaignFilter.includes(options.selectedCampaign)) { // Admin with restricted access, selected is valid
            finalCampaignFilter = [options.selectedCampaign];
        } else { // Admin selected a campaign they can't see
            return { constraints: [], shouldAbort: true };
        }
    }
    
    if (finalCampaignFilter) {
      if (finalCampaignFilter.length === 0) return { constraints: [], shouldAbort: true };
      
      // Protect against multiple 'in' queries which Firestore forbids
      const hasInFilter = constraints.some(c => (c as any)._op === 'in');
      if (hasInFilter && finalCampaignFilter.length > 1) {
          throw new Error("Busca inválida. Não é possível filtrar por múltiplos estados e múltiplos eventos ao mesmo tempo.");
      }
      
      // Firestore 'in' query has a limit of 30 items.
      if (finalCampaignFilter.length > 30) {
          console.warn(`Campaign filter has ${finalCampaignFilter.length} items, exceeding Firestore's limit of 30 for 'in' queries. Using first 30.`);
          constraints.push(where("campaignName", "in", finalCampaignFilter.slice(0, 30)));
      } else {
          constraints.push(where("campaignName", "in", finalCampaignFilter));
      }
    }

    return { constraints, shouldAbort: false };
};


export const getPromotersPage = async (options: PromoterQueryOptions & {
  limitPerPage: number;
  cursor?: QueryDocumentSnapshot<DocumentData>;
}): Promise<{ promoters: Promoter[], lastVisible: QueryDocumentSnapshot<DocumentData> | null, totalCount: number }> => {
  try {
    const promotersRef = collection(firestore, "promoters");
    const { constraints, shouldAbort } = buildQueryConstraints(options);
    
    if (shouldAbort) {
        return { promoters: [], lastVisible: null, totalCount: 0 };
    }
    
    // Create separate queries for data and total count
    const countQuery = query(promotersRef, ...constraints);
    let dataQuery = query(promotersRef, ...constraints, orderBy(documentId())); // Order by ID for stable pagination

    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;
    
    if (options.cursor) {
      dataQuery = query(dataQuery, startAfter(options.cursor));
    }
    
    dataQuery = query(dataQuery, limit(options.limitPerPage));
    
    const querySnapshot = await getDocs(dataQuery);
    const promoters: Promoter[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    
    const lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { promoters, lastVisible, totalCount };

  } catch (error) {
    console.error("Error fetching promoter page:", error);
    if (error instanceof Error && error.message.includes("requires an index")) {
        throw new Error("Erro de configuração do banco de dados (índice ausente). Peça para o desenvolvedor criar o índice composto no Firebase Console.");
    }
    throw new Error("Não foi possível buscar as divulgadoras.");
  }
};


export const getAllPromoters = async (options: PromoterQueryOptions): Promise<Promoter[]> => {
  try {
    const promotersRef = collection(firestore, "promoters");
    const { constraints, shouldAbort } = buildQueryConstraints(options);

    if (shouldAbort) {
        return [];
    }
    
    const q = query(promotersRef, ...constraints);
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));

  } catch (error) {
    console.error("Error fetching all promoters:", error);
    if (error instanceof Error && error.message.includes("requires an index")) {
        throw new Error("Erro de configuração do banco de dados (índice ausente). Peça para o desenvolvedor criar o índice composto no Firebase Console.");
    }
    if (error instanceof Error && error.message.includes("Invalid query. You cannot have more than one 'in' filter.")) {
        throw new Error("Busca inválida. Não é possível filtrar por múltiplos estados e múltiplos eventos ao mesmo tempo.");
    }
    throw new Error("Não foi possível buscar as divulgadoras.");
  }
};


export const getPromoterStats = async (options: {
  organizationId?: string;
  statesForScope?: string[] | null;
}): Promise<{ total: number, pending: number, approved: number, rejected: number }> => {
    try {
        const promotersRef = collection(firestore, "promoters");
        
        const baseFilters: any[] = [];
        if (options.organizationId) {
            baseFilters.push(where("organizationId", "==", options.organizationId));
        }
        if (options.statesForScope && options.statesForScope.length > 0) {
            baseFilters.push(where("state", "in", options.statesForScope));
        }

        const totalQuery = baseFilters.length > 0 ? query(promotersRef, ...baseFilters) : query(promotersRef);
        const pendingQuery = query(totalQuery, where("status", "==", "pending"));
        const approvedQuery = query(totalQuery, where("status", "==", "approved"));
        const rejectedQuery = query(totalQuery, where("status", "==", "rejected"));

        const [totalSnap, pendingSnap, approvedSnap, rejectedSnap] = await Promise.all([
            getCountFromServer(totalQuery),
            getCountFromServer(pendingQuery),
            getCountFromServer(approvedQuery),
            getCountFromServer(rejectedQuery)
        ]);
        
        return {
            total: totalSnap.data().count,
            pending: pendingSnap.data().count,
            approved: approvedSnap.data().count,
            rejected: rejectedSnap.data().count,
        };
    } catch (error) {
        console.error("Error getting promoter stats: ", error);
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
            const timeA = (a.createdAt instanceof Timestamp) ? a.createdAt.toMillis() : 0;
            const timeB = (b.createdAt instanceof Timestamp) ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        return promoters;
    } catch (error) {
        console.error("Error checking promoter status: ", error);
        throw new Error("Não foi possível verificar o status.");
    }
};

export const getApprovedEventsForPromoter = async (email: string): Promise<Promoter[]> => {
    try {
        const q = query(
            collection(firestore, "promoters"),
            where("email", "==", email.toLowerCase().trim()),
            where("status", "==", "approved")
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return [];

        const promoters: Promoter[] = [];
        querySnapshot.forEach((doc) => {
            promoters.push(Object.assign({ id: doc.id }, doc.data()) as Promoter);
        });

        return promoters;
    } catch (error) {
        console.error("Error getting approved events for promoter: ", error);
        throw new Error("Não foi possível buscar os eventos aprovados.");
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

    // Filter out promoters who have left on the client-side
    // This is more robust as it includes promoters where `leftGroup` is not set (i.e., undefined)
    const activePromoters = promoters.filter(p => p.leftGroup !== true);
    
    return activePromoters.sort((a, b) => a.name.localeCompare(b.name));
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