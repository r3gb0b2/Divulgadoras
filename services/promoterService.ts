import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc, Timestamp, FieldValue, getCountFromServer, limit, startAfter, QueryDocumentSnapshot, DocumentData, documentId } from 'firebase/firestore';
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

    const allCampaigns = [`org_${promoterData.organizationId}`];
    if (promoterData.campaignName) {
        allCampaigns.push(promoterData.campaignName);
    }

    const newPromoter: Omit<Promoter, 'id' | 'createdAt'> & { createdAt: FieldValue } = {
      ...rest,
      email: normalizedEmail, // Save the normalized email
      campaignName: promoterData.campaignName || null,
      allCampaigns,
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
    const isSuperAdmin = !options.organizationId;
    const filters: any[] = [];
    let queryNeedsClientSideSort = false;

    // Status filter is common to all queries
    if (options.status !== 'all') {
      filters.push(where("status", "==", options.status));
    }

    if (isSuperAdmin) {
      // --- SUPER ADMIN LOGIC ---
      if (options.selectedCampaign !== 'all') {
        // When filtering by a single campaign, the view is global across all orgs.
        filters.push(where("allCampaigns", "array-contains", options.selectedCampaign));
      } else {
        // Default Super Admin view, can filter by org and state.
        if (options.filterOrgId !== 'all') {
          filters.push(where("organizationId", "==", options.filterOrgId));
        }
        if (options.filterState !== 'all') {
          filters.push(where("state", "==", options.filterState));
        }
      }
    } else {
      // --- UNIFIED REGULAR ADMIN LOGIC ---
      if (!options.organizationId || !options.campaignsInScope) {
        // An org admin must have an orgId and a scope. If not, they see nothing.
        return { promoters: [], lastVisible: null, totalCount: 0 };
      }

      let campaignsToQuery = options.campaignsInScope;

      // If user filters by a specific campaign in the UI, narrow the query to that campaign.
      if (options.selectedCampaign !== 'all') {
          if (options.campaignsInScope.includes(options.selectedCampaign)) {
              campaignsToQuery = [options.selectedCampaign];
          } else {
              // Admin is filtering for a campaign outside their scope, return empty.
              return { promoters: [], lastVisible: null, totalCount: 0 };
          }
      }
      
      if (campaignsToQuery.length === 0) {
         // Admin's scope is empty. Return nothing.
         return { promoters: [], lastVisible: null, totalCount: 0 };
      }

      if (campaignsToQuery.length === 1) {
          // Use 'array-contains' for single-item queries, more efficient.
          filters.push(where("allCampaigns", "array-contains", campaignsToQuery[0]));
      } else {
          // Use 'array-contains-any' for multi-item scope.
          // Limited to 30 items by Firestore.
          filters.push(where("allCampaigns", "array-contains-any", campaignsToQuery.slice(0, 30)));
          // This query cannot be ordered by a different field on the server.
          queryNeedsClientSideSort = true;
      }
    }


    // --- Build and execute queries ---
    const countQuery = query(promotersRef, ...filters);
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;

    let dataQuery;
    // The client will handle sorting if the query is complex
    if (queryNeedsClientSideSort) {
        dataQuery = query(promotersRef, ...filters);
    } else {
        // Simple queries can be ordered by documentId for stable pagination
        dataQuery = query(promotersRef, ...filters, orderBy(documentId()));
    }

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
      where("allCampaigns", "array-contains", campaignName),
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
    const reasonDoc = doc(firestore, 'rejectionReasons', id);
    await updateDoc(reasonDoc, { text });
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
    throw new Error("Não foi possível remover o motivo de rejeição.");
  }
};