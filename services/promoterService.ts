import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, RejectionReason, PromoterStatus, Timestamp, GroupRemovalRequest } from '../types';

type QueryDocumentSnapshot = firebase.firestore.QueryDocumentSnapshot;
type DocumentData = firebase.firestore.DocumentData;

// Helper to safely get milliseconds for sorting
const toMillisSafe = (timestamp: any): number => {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return timestamp.seconds * 1000;
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? 0 : date.getTime();
};

/**
 * Salva o token FCM no perfil da divulgadora com limpeza de string.
 */
export const savePushToken = async (promoterId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<void> => {
    if (!token || typeof token !== 'string') return;

    // LIMPEZA: Remove espaços, quebras de linha e caracteres de controle invisíveis
    const cleanToken = token.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");

    if (cleanToken === '' || cleanToken === 'undefined' || cleanToken === 'null') {
        return;
    }

    console.log(`Push: Salvando token limpo para ${promoterId}...`);
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: cleanToken,
            platform: platform,
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("Push: Token atualizado com sucesso no banco.");
    } catch (error) {
        console.error("Push: Erro ao gravar token no banco:", error);
        throw error;
    }
};

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
    const normalizedEmail = promoterData.email.toLowerCase().trim();
    
    const q = firestore.collection("promoters")
      .where("email", "==", normalizedEmail)
      .where("state", "==", promoterData.state)
      .where("campaignName", "==", promoterData.campaignName || null)
      .where("organizationId", "==", promoterData.organizationId);
      
    const querySnapshot = await q.get();
    if (!querySnapshot.empty) throw new Error("Você já se cadastrou para este evento/gênero.");

    if (promoterData.campaignName) {
        const campaignQuery = firestore.collection('campaigns')
            .where('organizationId', '==', promoterData.organizationId)
            .where('stateAbbr', '==', promoterData.state)
            .where('name', '==', promoterData.campaignName)
            .limit(1);
        
        const campaignSnap = await campaignQuery.get();
        if (!campaignSnap.empty) {
            const campaignData = campaignSnap.docs[0].data();
            if (campaignData.preventDuplicateInOrg) {
                const existingApprovedQuery = firestore.collection('promoters')
                    .where('organizationId', '==', promoterData.organizationId)
                    .where('email', '==', normalizedEmail)
                    .where('status', '==', 'approved')
                    .limit(1);
                
                const existingApprovedSnap = await existingApprovedQuery.get();
                if (!existingApprovedSnap.empty) throw new Error("Você já possui um cadastro aprovado nesta organização.");
            }
        }
    }

    // Upload das fotos de perfil
    const photoUrls = await Promise.all(
      promoterData.photos.map(async (photo) => {
        const fileExtension = photo.name.split('.').pop() || 'jpg';
        const fileName = `profile/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const storageRef = storage.ref(`promoters-photos/${fileName}`);
        await storageRef.put(photo);
        return await storageRef.getDownloadURL();
      })
    );

    // Upload das fotos de documentos
    const documentUrls = await Promise.all(
      promoterData.documentPhotos.map(async (photo) => {
        const fileExtension = photo.name.split('.').pop() || 'jpg';
        const fileName = `docs/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        const storageRef = storage.ref(`promoters-photos/${fileName}`);
        await storageRef.put(photo);
        return await storageRef.getDownloadURL();
      })
    );

    const { photos, documentPhotos, facePhoto, ...rest } = promoterData;
    const newPromoter: Omit<Promoter, 'id' | 'createdAt'> & { createdAt: firebase.firestore.FieldValue } = {
      ...rest,
      email: normalizedEmail,
      campaignName: promoterData.campaignName || null,
      photoUrls,
      documentUrls,
      status: 'pending' as const,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      allCampaigns: promoterData.campaignName ? [promoterData.campaignName] : [],
    };
    
    await firestore.collection('promoters').add(newPromoter);
  } catch (error) {
    console.error("Error adding promoter: ", error);
    if (error instanceof Error) throw error;
    throw new Error("Não foi possível enviar o cadastro. Tente novamente.");
  }
};

export const getPromoterById = async (id: string): Promise<Promoter | null> => {
    try {
        const docRef = firestore.collection('promoters').doc(id);
        const docSnap = await docRef.get();
        return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } as Promoter : null;
    } catch (error) {
        console.error("Error getting promoter: ", error);
        throw new Error("Não foi possível buscar os dados da divulgadora.");
    }
};

export const getLatestPromoterProfileByEmail = async (email: string): Promise<Promoter | null> => {
    try {
        const q = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim());
        const querySnapshot = await q.get();
        if (querySnapshot.empty) return null;
        const promoterDocs = querySnapshot.docs.sort((a, b) => toMillisSafe(b.data().createdAt) - toMillisSafe(a.data().createdAt));
        return { id: promoterDocs[0].id, ...promoterDocs[0].data() } as Promoter;
    } catch (error) {
        console.error("Error fetching latest profile: ", error);
        throw new Error("Não foi possível buscar os dados do seu cadastro anterior.");
    }
};

export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim());
        const querySnapshot = await q.get();
        const promoters = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        promoters.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
        return promoters;
    } catch (error) {
        console.error("Error finding promoters: ", error);
        throw new Error("Não foi possível buscar as divulgadoras por e-mail.");
    }
};

export const getPromotersByIds = async (promoterIds: string[]): Promise<Promoter[]> => {
    if (promoterIds.length === 0) return [];
    const promoters: Promoter[] = [];
    const CHUNK_SIZE = 30;
    for (let i = 0; i < promoterIds.length; i += CHUNK_SIZE) {
        const chunk = promoterIds.slice(i, i + CHUNK_SIZE);
        const q = firestore.collection('promoters').where(firebase.firestore.FieldPath.documentId(), 'in', chunk);
        const snapshot = await q.get();
        snapshot.forEach(doc => promoters.push({ id: doc.id, ...doc.data() } as Promoter));
    }
    return promoters;
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
    const promotersMap = new Map<string, Promoter>();
    const CHUNK_SIZE = 30;
    const executeQuery = async (query: firebase.firestore.Query) => {
        const snapshot = await query.get();
        snapshot.forEach(doc => {
            if (!promotersMap.has(doc.id)) promotersMap.set(doc.id, { id: doc.id, ...doc.data() } as Promoter);
        });
    };

    let baseQuery: firebase.firestore.Query = firestore.collection("promoters");
    if (options.filterOrgId !== 'all') baseQuery = baseQuery.where("organizationId", "==", options.filterOrgId);
    else if (options.organizationId) baseQuery = baseQuery.where("organizationId", "==", options.organizationId);
    
    if (options.status !== 'all') {
        if (options.status === 'rejected') baseQuery = baseQuery.where("status", "in", ["rejected", "rejected_editable"]);
        else baseQuery = baseQuery.where("status", "==", options.status);
    }

    let statesToQuery = options.filterState !== 'all' ? [options.filterState] : options.statesForScope;
    if (statesToQuery && statesToQuery.length === 0) return [];

    if (!statesToQuery) {
        let finalQuery = baseQuery;
        if (options.selectedCampaign !== 'all') finalQuery = finalQuery.where("campaignName", "==", options.selectedCampaign);
        await executeQuery(finalQuery);
    } else {
        if (options.selectedCampaign !== 'all') {
            const campaignQuery = baseQuery.where("campaignName", "==", options.selectedCampaign);
            for (let i = 0; i < statesToQuery.length; i += CHUNK_SIZE) {
                await executeQuery(campaignQuery.where("state", "in", statesToQuery.slice(i, i + CHUNK_SIZE)));
            }
        } else {
            for (let i = 0; i < statesToQuery.length; i += CHUNK_SIZE) {
                await executeQuery(baseQuery.where("state", "in", statesToQuery.slice(i, i + CHUNK_SIZE)));
            }
        }
    }

    return Array.from(promotersMap.values());
  } catch (error) {
    console.error("Error fetching promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras.");
  }
};

export const getPromoterStats = async (options: {
  organizationId?: string;
  statesForScope?: string[] | null;
  filterOrgId: string | 'all';
  filterState: string | 'all';
  selectedCampaign: string | 'all';
}): Promise<{ total: number, pending: number, approved: number, rejected: number, removed: number }> => {
    try {
        let query: firebase.firestore.Query = firestore.collection("promoters");
        if (options.filterOrgId !== 'all') query = query.where("organizationId", "==", options.filterOrgId);
        else if (options.organizationId) query = query.where("organizationId", "==", options.organizationId);

        if (options.filterState !== 'all') query = query.where("state", "==", options.filterState);
        else if (options.statesForScope && options.statesForScope.length > 0) query = query.where("state", "in", options.statesForScope);

        if (options.selectedCampaign !== 'all') query = query.where("campaignName", "==", options.selectedCampaign);

        const [totalSnap, pendingSnap, approvedSnap, rejectedSnap, removedSnap] = await Promise.all([
            query.get(),
            query.where("status", "==", "pending").get(),
            query.where("status", "==", "approved").get(),
            query.where("status", "in", ["rejected", "rejected_editable"]).get(),
            query.where("status", "==", "removed").get()
        ]);
        
        return { total: totalSnap.size, pending: pendingSnap.size, approved: approvedSnap.size, rejected: rejectedSnap.size, removed: removedSnap.size };
    } catch (error) {
        console.error("Error getting stats: ", error);
        throw new Error("Não foi possível carregar as estatísticas.");
    }
};

export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    const updatePromoterAndSync = functions.httpsCallable('updatePromoterAndSync');
    await updatePromoterAndSync({ promoterId: id, data });
  } catch (error) {
    console.error("Error updating promoter: ", error);
    if (error instanceof Error) {
        const details = (error as any).details?.message || error.message;
        throw new Error(`Não foi possível atualizar a divulgadora. Detalhes: ${details}`);
    }
    throw new Error("Não foi possível atualizar a divulgadora.");
  }
};

export const resubmitPromoterApplication = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    await firestore.collection("promoters").doc(id).update(data);
  } catch (error) {
    console.error("Error resubmitting: ", error);
    throw new Error("Não foi possível reenviar o cadastro. Tente novamente.");
  }
};

export const confirmPromoterGroupEntry = async (promoterId: string): Promise<void> => {
  try {
    await firestore.collection('promoters').doc(promoterId).update({ hasJoinedGroup: true });
  } catch (error) {
    console.error("Error confirming group entry:", error);
    throw new Error("Não foi possível confirmar a entrada no grupo.");
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
        let q: firebase.firestore.Query = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim());
        if (organizationId) q = q.where("organizationId", "==", organizationId);
        const querySnapshot = await q.get();
        if (querySnapshot.empty) return null;
        const promoters = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        promoters.sort((a, b) => toMillisSafe(a.createdAt) - toMillisSafe(b.createdAt));
        return promoters;
    } catch (error) {
        console.error("Error checking status: ", error);
        throw new Error("Não foi possível verificar o status.");
    }
};

export const getApprovedEventsForPromoter = async (email: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).where("status", "==", "approved");
        const querySnapshot = await q.get();
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    } catch (error) {
        console.error("Error getting approved events: ", error);
        throw new Error("Não foi possível buscar os eventos aprovados.");
    }
};

export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
  try {
    const q = firestore.collection("promoters")
      .where("organizationId", "==", organizationId)
      .where("state", "==", state)
      .where("campaignName", "==", campaignName)
      .where("status", "==", "approved");
    const querySnapshot = await q.get();
    const activePromoters = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter)).filter(p => p.hasJoinedGroup !== false);
    return activePromoters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (error) {
    console.error("Error getting approved promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras aprovadas.");
  }
};

export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    try {
        const q = firestore.collection("rejectionReasons").where("organizationId", "==", organizationId);
        const querySnapshot = await q.get();
        const reasons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RejectionReason));
        return reasons.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
    } catch (error) {
        console.error("Error getting reasons: ", error);
        throw new Error("Não foi possível buscar os motivos de rejeição.");
    }
};

export const addRejectionReason = async (text: string, organizationId: string): Promise<string> => {
    try {
        const docRef = await firestore.collection('rejectionReasons').add({ text, organizationId });
        return docRef.id;
    } catch (error) {
        console.error("Error adding reason: ", error);
        throw new Error("Não foi possível adicionar o motivo.");
    }
};

export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    try {
        await firestore.collection('rejectionReasons').doc(id).update({ text });
    } catch (error) {
        console.error("Error updating reason: ", error);
        throw new Error("Não foi possível atualizar o motivo.");
    }
};

export const deleteRejectionReason = async (id: string): Promise<void> => {
    try {
        await firestore.collection("rejectionReasons").doc(id).delete();
    } catch (error) {
        console.error("Error deleting reason: ", error);
        throw new Error("Não foi possível deletar o motivo.");
    }
};

export const requestGroupRemoval = async (promoterId: string, campaignName: string, orgId: string): Promise<void> => {
    try {
        const promoter = await getPromoterById(promoterId);
        if (!promoter) throw new Error("Divulgadora não encontrada.");
        
        const existing = await firestore.collection("groupRemovalRequests")
            .where("promoterId", "==", promoterId)
            .where("campaignName", "==", campaignName)
            .where("organizationId", "==", orgId)
            .where("status", "==", "pending").get();
        if (!existing.empty) throw new Error("Você já tem uma solicitação pendente.");

        await firestore.collection("groupRemovalRequests").add({
            organizationId: orgId,
            promoterId: promoterId,
            promoterName: promoter.name,
            promoterEmail: promoter.email,
            campaignName: campaignName,
            status: 'pending',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error("Error removal request: ", error);
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível enviar a solicitação.");
    }
};

export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    try {
        const q = firestore.collection("groupRemovalRequests").where("organizationId", "==", organizationId).where("status", "==", "pending");
        const snapshot = await q.get();
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
        requests.sort((a, b) => toMillisSafe(b.requestedAt) - toMillisSafe(a.requestedAt));
        return requests;
    } catch (error) {
        console.error("Error getting removal requests: ", error);
        throw new Error("Não foi possível buscar as solicitações.");
    }
};

export const updateGroupRemovalRequest = async (requestId: string, data: Partial<Omit<GroupRemovalRequest, 'id'>>): Promise<void> => {
    try {
        await firestore.collection("groupRemovalRequests").doc(requestId).update(data);
    } catch (error) {
        console.error("Error updating removal request: ", error);
        throw new Error("Não foi possível atualizar a solicitação.");
    }
};