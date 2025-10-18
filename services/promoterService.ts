import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp, FieldValue, getCountFromServer, limit, startAfter, QueryDocumentSnapshot, DocumentData, documentId, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Promoter, PromoterApplicationData, RejectionReason, PromoterStatus } from '../types';

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
    const normalizedEmail = promoterData.email.toLowerCase().trim();
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
      email: normalizedEmail, // Save the normalized email
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

export const getPromoterById = async (id: string): Promise<Promoter | null> => {
    try {
        const docRef = doc(firestore, 'promoters', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Promoter;
        }
        return null;
    } catch (error) {
        console.error("Error getting promoter by ID: ", error);
        throw new Error("Não foi possível buscar os dados da divulgadora.");
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

export const getPromotersByIds = async (promoterIds: string[]): Promise<Promoter[]> => {
    if (promoterIds.length === 0) return [];
    const promoters: Promoter[] = [];
    
    // Firestore 'in' query supports up to 30 elements. Chunk the requests.
    const CHUNK_SIZE = 30;
    for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
        const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
        const q = query(collection(firestore, 'promoters'), where(documentId(), 'in', chunk));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            promoters.push({ id: doc.id, ...doc.data() } as Promoter);
        });
    }
    return promoters;
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
  // This function is complex because Firestore does not allow 'in' queries on multiple fields.
  // To work around this, if we need to filter by multiple states AND multiple campaigns,
  // we must issue multiple queries (one for each state) and merge the results.
  // This breaks traditional pagination with cursors. As a pragmatic solution,
  // we will fetch ALL matching documents in this complex case and paginate on the client.
  // For simpler cases (one or zero 'in' filters), we use efficient server-side pagination.
  try {
    const promotersRef = collection(firestore, "promoters");
    
    let baseFilters: any[] = [];
    
    if (options.organizationId) {
      baseFilters.push(where("organizationId", "==", options.organizationId));
    }
    if (options.statesForScope && options.statesForScope.length > 0) {
      baseFilters.push(where("state", "in", options.statesForScope));
    }

    if (options.status !== 'all') {
      if (options.status === 'pending') {
        baseFilters.push(where("status", "in", ["pending", "rejected_editable"]));
      } else {
        baseFilters.push(where("status", "==", options.status));
      }
    }

    // Handle campaign permissions and filters
    let finalCampaignFilter: string[] | null = options.campaignsInScope;
    if (options.selectedCampaign !== 'all') {
        if (finalCampaignFilter === null) {
            finalCampaignFilter = [options.selectedCampaign];
        } else {
            if (finalCampaignFilter.includes(options.selectedCampaign)) {
                finalCampaignFilter = [options.selectedCampaign];
            } else {
                return { promoters: [], lastVisible: null, totalCount: 0 };
            }
        }
    }

    if (finalCampaignFilter) {
        if (finalCampaignFilter.length === 0) {
             return { promoters: [], lastVisible: null, totalCount: 0 };
        }
        if (finalCampaignFilter.length > 30) {
            console.warn(`Campaign filter has ${finalCampaignFilter.length} items, which exceeds Firestore's limit of 30 for 'in' queries. Results may be incomplete.`);
        }
        baseFilters.push(where("campaignName", "in", finalCampaignFilter.slice(0, 30)));
    }

    if (options.filterOrgId !== 'all') {
      baseFilters.push(where("organizationId", "==", options.filterOrgId));
    }
    if (options.filterState !== 'all') {
      baseFilters.push(where("state", "==", options.filterState));
    }

    // Since we now paginate client-side for all requests to ensure consistency,
    // we fetch all documents that match the filters.
    const countQuery = query(promotersRef, ...baseFilters);
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;

    // We can remove the multi-query logic here if we decide to fetch all and paginate client-side always.
    // However, for performance, it's better to keep server-side pagination for simple queries.
    // The issue is that the logic for detecting when to switch is complex.
    // A simpler, robust solution is to just fetch everything based on filters, then let AdminPanel do the pagination.
    // Let's stick with a simplified full fetch for this function to fix the bug.
    // The AdminPanel already implements client-side pagination on the fetched results.

    const dataQuery = query(promotersRef, ...baseFilters);
    const querySnapshot = await getDocs(dataQuery);
    
    const promoters: Promoter[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    
    // Because we are fetching all results, pagination cursors are not applicable.
    // The AdminPanel handles client-side pagination.
    return { promoters, lastVisible: null, totalCount };

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

    // --- 1. Base Filters (excluding state and campaign) ---
    const baseFilters: any[] = [];
    if (options.organizationId) {
      baseFilters.push(where("organizationId", "==", options.organizationId));
    }
    // Superadmin filter override
    if (options.filterOrgId !== 'all') {
      // Find and remove the base organizationId filter if it exists
      const orgFilterIndex = baseFilters.findIndex(f => f._field.path.segments.join("/") === 'organizationId');
      if (orgFilterIndex > -1) baseFilters.splice(orgFilterIndex, 1);
      baseFilters.push(where("organizationId", "==", options.filterOrgId));
    }
    if (options.status !== 'all') {
      if (options.status === 'pending') {
        baseFilters.push(where("status", "in", ["pending", "rejected_editable"]));
      } else {
        baseFilters.push(where("status", "==", options.status));
      }
    }

    // --- 2. Determine States to Query ---
    let statesToQuery: string[] | null = null;
    if (options.filterState !== 'all') {
        statesToQuery = [options.filterState];
    } else if (options.statesForScope) { // Use admin's scope
        statesToQuery = options.statesForScope;
    }
    // If statesToQuery is an empty array, it means no states in scope, so return early
    if (Array.isArray(statesToQuery) && statesToQuery.length === 0) {
        return [];
    }


    // --- 3. Determine Campaigns to Query ---
    let campaignsToQuery: string[] | null = options.campaignsInScope;
    if (options.selectedCampaign !== 'all') {
        if (campaignsToQuery === null) { // Superadmin case, no initial scope
            campaignsToQuery = [options.selectedCampaign];
        } else { // Admin with scope, filter by selected campaign
            if (campaignsToQuery.includes(options.selectedCampaign)) {
                campaignsToQuery = [options.selectedCampaign];
            } else {
                // Admin selected a campaign they are not scoped for
                return [];
            }
        }
    }
    // If campaignsToQuery is an empty array, it means no campaigns in scope, so return early
    if (Array.isArray(campaignsToQuery) && campaignsToQuery.length === 0) {
        // This is a special case: an admin might have scope for a state, but that state has 0 campaigns.
        // They should still see general applicants (campaignName: null) for that state.
        // So, we don't return early here. The logic below will handle it.
    }


    // --- 4. Build and Execute Queries ---
    const promotersMap = new Map<string, Promoter>();
    const CHUNK_SIZE = 30; // Firestore `in` query limit

    const executeQuery = async (filters: any[]) => {
        const q = query(promotersRef, ...filters);
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            if (!promotersMap.has(doc.id)) {
                promotersMap.set(doc.id, { id: doc.id, ...doc.data() } as Promoter);
            }
        });
    };

    // Case 1: Filtering by states (most common for admins)
    if (statesToQuery) {
        // Case 1a: Full campaign access within the scoped states.
        if (campaignsToQuery === null) {
            // Query for all promoters in the states, regardless of campaign.
            for (let i = 0; i < statesToQuery.length; i += CHUNK_SIZE) {
                const stateChunk = statesToQuery.slice(i, i + CHUNK_SIZE);
                const stateFilter = where("state", "in", stateChunk);
                await executeQuery([...baseFilters, stateFilter]);
            }
        } else { // Case 1b: Restricted campaign access (campaignsToQuery is string[]).
            // Query for specific named campaigns.
            if (campaignsToQuery.length > 0) {
                // Using the more efficient loop based on smaller list size
                if (statesToQuery.length <= campaignsToQuery.length) {
                    for (const state of statesToQuery) {
                        const stateFilter = where("state", "==", state);
                        for (let i = 0; i < campaignsToQuery.length; i += CHUNK_SIZE) {
                            const campaignChunk = campaignsToQuery.slice(i, i + CHUNK_SIZE);
                            const campaignFilter = where("campaignName", "in", campaignChunk);
                            await executeQuery([...baseFilters, stateFilter, campaignFilter]);
                        }
                    }
                } else {
                    for (const campaign of campaignsToQuery) {
                        const campaignFilter = where("campaignName", "==", campaign);
                        for (let i = 0; i < statesToQuery.length; i += CHUNK_SIZE) {
                            const stateChunk = statesToQuery.slice(i, i + CHUNK_SIZE);
                            const stateFilter = where("state", "in", stateChunk);
                            await executeQuery([...baseFilters, campaignFilter, stateFilter]);
                        }
                    }
                }
            }
            // ALWAYS include general applicants (campaignName: null) for the scoped states.
            const nullCampaignFilter = where("campaignName", "==", null);
            for (let i = 0; i < statesToQuery.length; i += CHUNK_SIZE) {
                const stateChunk = statesToQuery.slice(i, i + CHUNK_SIZE);
                const stateFilter = where("state", "in", stateChunk);
                await executeQuery([...baseFilters, nullCampaignFilter, stateFilter]);
            }
        }
    } 
    // Case 2: Filter by campaigns only (no state filter, e.g. superadmin)
    else if (campaignsToQuery && campaignsToQuery.length > 0) {
        for (let i = 0; i < campaignsToQuery.length; i += CHUNK_SIZE) {
            const campaignChunk = campaignsToQuery.slice(i, i + CHUNK_SIZE);
            const campaignFilter = where("campaignName", "in", campaignChunk);
            await executeQuery([...baseFilters, campaignFilter]);
        }
    } 
    // Case 3: No state or campaign filters (e.g., superadmin 'all'/'all')
    else {
        await executeQuery(baseFilters);
    }
    
    return Array.from(promotersMap.values());

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
        const pendingQuery = query(totalQuery, where("status", "in", ["pending", "rejected_editable"]));
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

    // Filter out promoters who have been marked as having left the group
    const activePromoters = promoters.filter(p => p.hasJoinedGroup !== false);

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