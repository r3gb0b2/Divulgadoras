import firebase from '../firebase/config';
import { firestore, storage } from '../firebase/config';
import { Promoter, PromoterApplicationData, RejectionReason, PromoterStatus } from '../types';
import { Timestamp, DocumentData } from 'firebase/firestore';

type QueryDocumentSnapshot<T> = firebase.firestore.QueryDocumentSnapshot<T>;

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
    const normalizedEmail = promoterData.email.toLowerCase().trim();
    // Check for existing registration for the same email, state, campaign and organization
    const q = firestore
      .collection("promoters")
      .where("email", "==", normalizedEmail)
      .where("state", "==", promoterData.state)
      .where("campaignName", "==", promoterData.campaignName || null)
      .where("organizationId", "==", promoterData.organizationId);
    
    const querySnapshot = await q.get();
    if (!querySnapshot.empty) {
      throw new Error("Você já se cadastrou para este evento/gênero.");
    }

    const photoUrls = await Promise.all(
      promoterData.photos.map(async (photo) => {
        const fileExtension = photo.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2)}.${fileExtension}`;
        const storageRef = storage.ref(`promoters-photos/${fileName}`);
        await storageRef.put(photo);
        return await storageRef.getDownloadURL();
      })
    );

    const { photos, ...rest } = promoterData;

    const newPromoter: Omit<Promoter, 'id' | 'createdAt'> & { createdAt: firebase.firestore.FieldValue } = {
      ...rest,
      email: normalizedEmail, // Save the normalized email
      campaignName: promoterData.campaignName || null,
      photoUrls,
      status: 'pending' as const,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await firestore.collection('promoters').add(newPromoter);
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
        const docRef = firestore.collection('promoters').doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
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
        const q = firestore
            .collection("promoters")
            .where("email", "==", email.toLowerCase().trim());
        
        const querySnapshot = await q.get();
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
        const q = firestore
            .collection("promoters")
            .where("email", "==", email.toLowerCase().trim());
        
        const querySnapshot = await q.get();
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
        const q = firestore.collection('promoters').where(firebase.firestore.FieldPath.documentId(), 'in', chunk);
        const snapshot = await q.get();
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
    let baseQuery: firebase.firestore.Query = firestore.collection("promoters");
    
    if (options.organizationId) {
      baseQuery = baseQuery.where("organizationId", "==", options.organizationId);
    }
    if (options.statesForScope && options.statesForScope.length > 0) {
      baseQuery = baseQuery.where("state", "in", options.statesForScope);
    }

    if (options.status !== 'all') {
      if (options.status === 'pending') {
        baseQuery = baseQuery.where("status", "in", ["pending", "rejected_editable"]);
      } else {
        baseQuery = baseQuery.where("status", "==", options.status);
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
        baseQuery = baseQuery.where("campaignName", "in", finalCampaignFilter.slice(0, 30));
    }

    if (options.filterOrgId !== 'all') {
      baseQuery = baseQuery.where("organizationId", "==", options.filterOrgId);
    }
    if (options.filterState !== 'all') {
      baseQuery = baseQuery.where("state", "==", options.filterState);
    }

    // Since we now paginate client-side for all requests to ensure consistency,
    // we fetch all documents that match the filters.
    const countSnapshot = await baseQuery.get();
    const totalCount = countSnapshot.size;

    const querySnapshot = await baseQuery.get();
    
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
  selectedCampaign: string | 'all';
  filterOrgId: string | 'all';
  filterState: string | 'all';
  assignedCampaignsForScope?: { [stateAbbr: string]: string[] };
}): Promise<Promoter[]> => {
  try {
    const promotersRef = firestore.collection("promoters");
    const promotersMap = new Map<string, Promoter>();
    const CHUNK_SIZE = 30; // Firestore `in` query limit

    // --- Helper to execute queries and populate the map ---
    const executeQuery = async (query: firebase.firestore.Query) => {
        const snapshot = await query.get();
        snapshot.forEach(doc => {
            if (!promotersMap.has(doc.id)) {
                promotersMap.set(doc.id, { id: doc.id, ...doc.data() } as Promoter);
            }
        });
    };

    let baseQuery: firebase.firestore.Query = promotersRef;

    // --- 1. Base Filters (org, status) ---
    if (options.organizationId) {
        baseQuery = baseQuery.where("organizationId", "==", options.organizationId);
    }
    if (options.filterOrgId !== 'all') { // Superadmin filter override
        // This is tricky with compat syntax. A new query must be started.
        baseQuery = firestore.collection("promoters").where("organizationId", "==", options.filterOrgId);
    }
    if (options.status !== 'all') {
        baseQuery = baseQuery.where("status", "in", options.status === 'pending' ? ["pending", "rejected_editable"] : [options.status]);
    }

    // --- 2. Determine States to Query ---
    let statesToQuery: string[] | null = null;
    if (options.filterState !== 'all') {
        statesToQuery = [options.filterState];
    } else if (options.statesForScope) {
        statesToQuery = options.statesForScope;
    }
    if (Array.isArray(statesToQuery) && statesToQuery.length === 0) {
        return []; // Admin has no states in scope.
    }

    // --- 3. Superadmin / No State Scope ---
    if (!statesToQuery) {
        let finalQuery = baseQuery;
        if (options.selectedCampaign !== 'all') {
            finalQuery = finalQuery.where("campaignName", "==", options.selectedCampaign);
        }
        await executeQuery(finalQuery);
        return Array.from(promotersMap.values());
    }

    // --- 4. Admin with State Scope ---
    if (options.selectedCampaign !== 'all') {
        const campaignQuery = baseQuery.where("campaignName", "==", options.selectedCampaign);
        for (let i = 0; i < statesToQuery.length; i += CHUNK_SIZE) {
            const stateChunk = statesToQuery.slice(i, i + CHUNK_SIZE);
            await executeQuery(campaignQuery.where("state", "in", stateChunk));
        }
        return Array.from(promotersMap.values());
    }
    
    // --- 4b. Handle "All Campaigns" ---
    const statesWithFullAccess = new Set<string>();
    const statesWithRestrictedAccess = new Map<string, string[]>();

    for (const state of statesToQuery) {
        if (!options.assignedCampaignsForScope || options.assignedCampaignsForScope[state] === undefined) {
            statesWithFullAccess.add(state);
        } else {
            statesWithRestrictedAccess.set(state, options.assignedCampaignsForScope[state]);
        }
    }

    if (statesWithFullAccess.size > 0) {
        const states = Array.from(statesWithFullAccess);
        for (let i = 0; i < states.length; i += CHUNK_SIZE) {
            const stateChunk = states.slice(i, i + CHUNK_SIZE);
            await executeQuery(baseQuery.where("state", "in", stateChunk));
        }
    }

    for (const [state, campaigns] of statesWithRestrictedAccess.entries()) {
        const stateQuery = baseQuery.where("state", "==", state);
        if (campaigns.length > 0) {
            for (let i = 0; i < campaigns.length; i += CHUNK_SIZE) {
                const campaignChunk = campaigns.slice(i, i + CHUNK_SIZE);
                await executeQuery(stateQuery.where("campaignName", "in", campaignChunk));
            }
        }
        await executeQuery(stateQuery.where("campaignName", "==", null));
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
        let baseQuery: firebase.firestore.Query = firestore.collection("promoters");
        
        if (options.organizationId) {
            baseQuery = baseQuery.where("organizationId", "==", options.organizationId);
        }
        if (options.statesForScope && options.statesForScope.length > 0) {
            baseQuery = baseQuery.where("state", "in", options.statesForScope);
        }

        const pendingQuery = baseQuery.where("status", "in", ["pending", "rejected_editable"]);
        const approvedQuery = baseQuery.where("status", "==", "approved");
        const rejectedQuery = baseQuery.where("status", "==", "rejected");

        const [totalSnap, pendingSnap, approvedSnap, rejectedSnap] = await Promise.all([
            baseQuery.get(),
            pendingQuery.get(),
            approvedQuery.get(),
            rejectedQuery.get()
        ]);
        
        return {
            total: totalSnap.size,
            pending: pendingSnap.size,
            approved: approvedSnap.size,
            rejected: rejectedSnap.size,
        };
    } catch (error) {
        console.error("Error getting promoter stats: ", error);
        throw new Error("Não foi possível carregar as estatísticas.");
    }
};


export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    const promoterDoc = firestore.collection('promoters').doc(id);
    await promoterDoc.update(data);
  } catch (error) {
    console.error("Error updating promoter: ", error);
    throw new Error("Não foi possível atualizar a divulgadora.");
  }
};

export const deletePromoter = async (id: string): Promise<void> => {
    try {
      await firestore.collection("promoters").doc(id).delete();
    } catch (error) {
      console.error("Error deleting promoter: ", error);
      throw new Error("Não foi possível deletar a divulgadora.");
    }
};

export const checkPromoterStatus = async (email: string, organizationId?: string): Promise<Promoter[] | null> => {
    try {
        let q: firebase.firestore.Query = firestore
            .collection("promoters")
            .where("email", "==", email.toLowerCase().trim());

        if (organizationId) {
            q = q.where("organizationId", "==", organizationId);
        }

        const querySnapshot = await q.get();
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
        const q = firestore
            .collection("promoters")
            .where("email", "==", email.toLowerCase().trim())
            .where("status", "==", "approved");

        const querySnapshot = await q.get();
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
    const q = firestore
      .collection("promoters")
      .where("organizationId", "==", organizationId)
      .where("state", "==", state)
      .where("campaignName", "==", campaignName)
      .where("status", "==", "approved");
    
    const querySnapshot = await q.get();
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
        const q = firestore
            .collection("rejectionReasons")
            .where("organizationId", "==", organizationId);

        const querySnapshot = await q.get();
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
        const docRef = await firestore.collection('rejectionReasons').add({ text, organizationId });
        return docRef.id;
    } catch (error) {
        console.error("Error adding rejection reason: ", error);
        throw new Error("Não foi possível adicionar o motivo de rejeição.");
    }
};

export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    try {
        await firestore.collection('rejectionReasons').doc(id).update({ text });
    } catch (error) {
        console.error("Error updating rejection reason: ", error);
        throw new Error("Não foi possível atualizar o motivo de rejeição.");
    }
};

export const deleteRejectionReason = async (id: string): Promise<void> => {
    try {
        await firestore.collection("rejectionReasons").doc(id).delete();
    } catch (error) {
        console.error("Error deleting rejection reason: ", error);
        throw new Error("Não foi possível deletar o motivo de rejeição.");
    }
};