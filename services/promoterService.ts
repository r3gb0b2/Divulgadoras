import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp, FieldValue, getCountFromServer, limit, startAfter, QueryDocumentSnapshot, DocumentData, documentId, deleteField } from 'firebase/firestore';
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


export const getPromotersPage = async (options: {
  organizationId?: string;
  statesForScope?: string[] | null;
  status: PromoterStatus | 'all';
  campaignsInScope: string[] | null;
  selectedCampaign: string | 'all';
  filterOrgId: string | 'all';
  filterState: string | 'all';
  limitPerPage: number;
  cursor?: QueryDocumentSnapshot<DocumentData>;
}): Promise<{ promoters: Promoter[], lastVisible: QueryDocumentSnapshot<DocumentData> | null, totalCount: number }> => {
  try {
    const promotersRef = collection(firestore, "promoters");
    
    // Sort by document ID to prevent composite index errors with multiple filters.
    let dataQuery = query(promotersRef, orderBy(documentId()));
    let countQuery = query(promotersRef);

    const filters: any[] = [];
    
    if (options.organizationId) {
      filters.push(where("organizationId", "==", options.organizationId));
    }
    if (options.statesForScope && options.statesForScope.length > 0) {
      filters.push(where("state", "in", options.statesForScope));
    }

    if (options.status !== 'all') {
      filters.push(where("status", "==", options.status));
    }

    // Handle campaign permissions and filters
    let finalCampaignFilter: string[] | null = options.campaignsInScope;

    if (options.selectedCampaign !== 'all') {
        if (finalCampaignFilter === null) { // No previous restrictions, just filter by selected
            finalCampaignFilter = [options.selectedCampaign];
        } else { // Has restrictions, so intersection is needed
            if (finalCampaignFilter.includes(options.selectedCampaign)) {
                finalCampaignFilter = [options.selectedCampaign];
            } else {
                // User selected a campaign they can't see, so return nothing
                return { promoters: [], lastVisible: null, totalCount: 0 };
            }
        }
    }

    if (finalCampaignFilter) { // if it's an array (not null)
        if (finalCampaignFilter.length === 0) {
             return { promoters: [], lastVisible: null, totalCount: 0 };
        }
        // Firestore 'in' query has a limit of 30 items. 
        // For now, we assume an admin won't be assigned to more than 30 specific campaigns.
        if (finalCampaignFilter.length > 30) {
            console.warn(`Campaign filter has ${finalCampaignFilter.length} items, which exceeds Firestore's limit of 30 for 'in' queries. Results may be incomplete.`);
            filters.push(where("campaignName", "in", finalCampaignFilter.slice(0, 30)));
        } else {
            filters.push(where("campaignName", "in", finalCampaignFilter));
        }
    }

    if (options.filterOrgId !== 'all') {
      filters.push(where("organizationId", "==", options.filterOrgId));
    }
    if (options.filterState !== 'all') {
      filters.push(where("state", "==", options.filterState));
    }

    if (filters.length > 0) {
      dataQuery = query(dataQuery, ...filters);
      countQuery = query(countQuery, ...filters);
    }
    
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

export const getAllPromoters = async (options: {
  organizationId?: string;
  statesForScope?: string[] | null;
  status: PromoterStatus | 'all';
  campaignsInScope: string[] | null;
  selectedCampaign: string | 'all';
  filterOrgId: string | 'all';
  filterState: string | 'all';
}): Promise<Promoter[]> => {
  try {
    const promotersRef = collection(firestore, "promoters");

    const commonFilters: any[] = [];
    if (options.organizationId) {
      commonFilters.push(where("organizationId", "==", options.organizationId));
    }
    if (options.status !== 'all') {
      commonFilters.push(where("status", "==", options.status));
    }
    if (options.filterOrgId !== 'all') {
      const orgFilterIndex = commonFilters.findIndex(f => f._field.path.segments.join("/") === 'organizationId');
      if (orgFilterIndex > -1) commonFilters.splice(orgFilterIndex, 1);
      commonFilters.push(where("organizationId", "==", options.filterOrgId));
    }

    let campaignFilter: any = null;
    let finalCampaigns: string[] | null = options.campaignsInScope;

    if (options.selectedCampaign !== 'all') {
        if (finalCampaigns === null) {
            finalCampaigns = [options.selectedCampaign];
        } else {
            if (finalCampaigns.includes(options.selectedCampaign)) {
                finalCampaigns = [options.selectedCampaign];
            } else {
                return []; 
            }
        }
    }

    if (finalCampaigns) {
        if (finalCampaigns.length === 0) return [];
        if (finalCampaigns.length === 1) {
            campaignFilter = where("campaignName", "==", finalCampaigns[0]);
        } else if (finalCampaigns.length <= 30) {
            campaignFilter = where("campaignName", "in", finalCampaigns);
        } else {
            console.warn(`Campaign filter exceeds 30 items. Slicing.`);
            campaignFilter = where("campaignName", "in", finalCampaigns.slice(0, 30));
        }
    }

    let statesToQuery: string[] | null = null;
    if (options.filterState !== 'all') {
        statesToQuery = [options.filterState];
    } else if (options.statesForScope && options.statesForScope.length > 0) {
        statesToQuery = options.statesForScope;
    }

    const hasCampaignInFilter = campaignFilter && campaignFilter._op === 'in';
    const hasStateScope = statesToQuery && statesToQuery.length > 0;

    if (hasCampaignInFilter && hasStateScope) {
        const queryPromises = statesToQuery.map(state => {
            const stateFilter = where("state", "==", state);
            const finalFilters = [...commonFilters, campaignFilter, stateFilter];
            const q = query(promotersRef, ...finalFilters);
            return getDocs(q);
        });

        const snapshots = await Promise.all(queryPromises);
        const promotersMap = new Map<string, Promoter>();
        snapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
                if (!promotersMap.has(doc.id)) {
                    promotersMap.set(doc.id, { id: doc.id, ...doc.data() } as Promoter);
                }
            });
        });
        return Array.from(promotersMap.values());
    }

    const finalFilters = [...commonFilters];
    if (campaignFilter) {
        finalFilters.push(campaignFilter);
    }
    if (statesToQuery) {
        if (statesToQuery.length === 1) {
            finalFilters.push(where("state", "==", statesToQuery[0]));
        } else {
            finalFilters.push(where("state", "in", statesToQuery));
        }
    }

    const q = finalFilters.length > 0 ? query(promotersRef, ...finalFilters) : query(promotersRef);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));

  } catch (error) {
    console.error("Error fetching all promoters:", error);
    if (error instanceof Error && error.message.includes("requires an index")) {
        throw new Error("Erro de configuração do banco de dados (índice ausente). Peça para o desenvolvedor criar o índice composto no Firebase Console.");
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