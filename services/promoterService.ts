
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, PromoterStatus, RejectionReason, GroupRemovalRequest } from '../types';

/**
 * Adiciona uma nova divulgadora, enviando as fotos para o Storage
 * e salvando os dados no Firestore com normalização.
 */
export const addPromoter = async (data: PromoterApplicationData): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  // CRITICAL: Ensure campaign is NEVER null or empty string to avoid disappearing from filters
  const campaign = (data.campaignName && data.campaignName.trim() !== '') ? data.campaignName.trim() : "Geral";
  
  try {
    // 1. Verificar se já existe cadastro pendente ou aprovado para este evento
    const existing = await firestore.collection("promoters")
      .where("email", "==", emailLower)
      .where("organizationId", "==", data.organizationId)
      .where("campaignName", "==", campaign)
      .limit(1).get();
      
    // Se houver um cadastro que não seja 'rejected' (rejeitado definitivo), bloqueia
    if (!existing.empty) {
      const p = existing.docs[0].data() as Promoter;
      if (p.status !== 'rejected' && p.status !== 'rejected_editable') {
        throw new Error("Você já possui um cadastro em análise para este evento.");
      }
    }

    // 2. Upload das fotos
    const photoUrls = await Promise.all(
      data.photos.map(async (file, index) => {
        const extension = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${index}.${extension}`;
        const path = `promoters/${emailLower}/${fileName}`;
        const fileRef = storage.ref().child(path);
        
        const metadata = { contentType: file.type };
        await fileRef.put(file, metadata);
        return await fileRef.getDownloadURL();
      })
    );

    if (photoUrls.length === 0) throw new Error("Falha ao processar imagens.");

    // 3. Salvar documento no Firestore
    const newPromoter: Omit<Promoter, 'id'> = {
      name: data.name.trim(),
      email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''), // Salva apenas números
      instagram: data.instagram.replace('@', '').trim(),
      tiktok: data.tiktok?.replace('@', '').trim() || '',
      dateOfBirth: data.dateOfBirth,
      photoUrls: photoUrls,
      facePhotoUrl: photoUrls[0], // Primeira foto como principal
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: data.state,
      campaignName: campaign,
      organizationId: data.organizationId,
      allCampaigns: [campaign]
    };

    await firestore.collection('promoters').add(newPromoter);
  } catch (error: any) {
    console.error("Erro no cadastro:", error);
    throw new Error(error.message || "Falha ao processar cadastro. Tente novamente.");
  }
};

/**
 * Busca o status de cadastro por e-mail.
 */
export const checkPromoterStatus = async (email: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters")
        .where("email", "==", email.toLowerCase().trim())
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

/**
 * Busca o perfil mais recente por e-mail.
 */
export const getLatestPromoterProfileByEmail = async (email: string): Promise<Promoter | null> => {
    try {
        const q = firestore.collection("promoters")
            .where("email", "==", email.toLowerCase().trim())
            .orderBy("createdAt", "desc")
            .limit(1);
        const snap = await q.get();
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Promoter;
    } catch (error) {
        return null;
    }
};

/**
 * Confirma a entrada da divulgadora no grupo.
 */
export const confirmPromoterGroupEntry = async (id: string): Promise<void> => {
    await firestore.collection('promoters').doc(id).update({ hasJoinedGroup: true });
};

/**
 * Busca uma divulgadora pelo ID.
 */
export const getPromoterById = async (id: string): Promise<Promoter | null> => {
  try {
    const doc = await firestore.collection('promoters').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as Promoter : null;
  } catch (error) {
    return null;
  }
};

/**
 * Busca várias divulgadoras pelos seus IDs.
 */
export const getPromotersByIds = async (ids: string[]): Promise<Promoter[]> => {
    if (ids.length === 0) return [];
    try {
        const results: Promoter[] = [];
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const q = firestore.collection("promoters").where(firebase.firestore.FieldPath.documentId(), "in", chunk);
            const snap = await q.get();
            snap.forEach(doc => results.push({ id: doc.id, ...doc.data() } as Promoter));
        }
        return results;
    } catch (error) {
        console.error("Error fetching promoters by IDs:", error);
        return [];
    }
};

/**
 * Busca divulgadoras pelo email em toda a base (Global).
 */
export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    try {
        const snap = await firestore.collection("promoters")
            .where("email", "==", email.toLowerCase().trim())
            .get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    } catch (error) {
        console.error("Error finding promoters by email:", error);
        return [];
    }
};

/**
 * Busca todas as divulgadoras com filtros.
 */
export const getAllPromoters = async (options: {
    organizationId?: string;
    statesForScope?: string[] | null;
    status?: PromoterStatus | 'all';
    assignedCampaignsForScope?: { [state: string]: string[] };
    selectedCampaign?: string;
    filterOrgId?: string;
    filterState?: string;
}): Promise<Promoter[]> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("promoters");

        if (options.organizationId) {
            q = q.where("organizationId", "==", options.organizationId);
        } else if (options.filterOrgId && options.filterOrgId !== 'all') {
            q = q.where("organizationId", "==", options.filterOrgId);
        }

        if (options.status && options.status !== 'all') {
            q = q.where("status", "==", options.status);
        }

        if (options.filterState && options.filterState !== 'all') {
            q = q.where("state", "==", options.filterState);
        }

        if (options.selectedCampaign && options.selectedCampaign !== 'all') {
            q = q.where("campaignName", "==", options.selectedCampaign);
        }

        const snap = await q.get();
        let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));

        if (options.statesForScope && !options.filterState) {
            results = results.filter(p => options.statesForScope!.includes(p.state));
        }

        if (options.assignedCampaignsForScope) {
            results = results.filter(p => {
                const allowed = options.assignedCampaignsForScope![p.state];
                if (!allowed) return true;
                return allowed.includes(p.campaignName || '');
            });
        }

        return results;
    } catch (error) {
        console.error("Error getting promoters:", error);
        throw new Error("Falha ao buscar divulgadoras.");
    }
};

/**
 * Retorna estatísticas de contagem de divulgadoras por status.
 */
export const getPromoterStats = async (options: {
    organizationId?: string;
    statesForScope?: string[] | null;
    filterOrgId?: string;
    filterState?: string;
    selectedCampaign?: string;
}): Promise<{ total: number, pending: number, approved: number, rejected: number, removed: number }> => {
    const all = await getAllPromoters({ ...options, status: 'all' });
    return {
        total: all.length,
        pending: all.filter(p => p.status === 'pending').length,
        approved: all.filter(p => p.status === 'approved').length,
        rejected: all.filter(p => p.status === 'rejected' || p.status === 'rejected_editable').length,
        removed: all.filter(p => p.status === 'removed').length,
    };
};

/**
 * Atualiza dados de uma divulgadora.
 */
export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    if (data.status === 'approved') {
        const updateFunc = functions.httpsCallable('updatePromoterAndSync');
        await updateFunc({ promoterId: id, data });
    } else {
        await firestore.collection('promoters').doc(id).update(data);
    }
  } catch (error) {
    console.error("Error updating promoter:", error);
    throw new Error("Falha ao atualizar divulgadora.");
  }
};

/**
 * Exclui permanentemente uma inscrição.
 */
export const deletePromoter = async (id: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(id).delete();
    } catch (error) {
        throw new Error("Falha ao excluir inscrição.");
    }
};

/**
 * Busca motivos de rejeição de uma organização.
 */
export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    try {
        const q = firestore.collection("rejectionReasons").where("organizationId", "==", organizationId);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RejectionReason));
    } catch (error) {
        return [];
    }
};

/**
 * Adiciona um motivo de rejeição.
 */
export const addRejectionReason = async (text: string, organizationId: string): Promise<void> => {
    await firestore.collection("rejectionReasons").add({ text, organizationId });
};

/**
 * Atualiza um motivo de rejeição.
 */
export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).update({ text });
};

/**
 * Deleta um motivo de rejeição.
 */
export const deleteRejectionReason = async (id: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).delete();
};

/**
 * Busca divulgadoras aprovadas para um evento específico.
 */
export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters")
            .where("organizationId", "==", organizationId)
            .where("state", "==", state)
            .where("status", "==", "approved");
            
        const snap = await q.get();
        const allApproved = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        
        return allApproved.filter(p => 
            p.campaignName === campaignName || 
            (p.associatedCampaigns && p.associatedCampaigns.includes(campaignName))
        );
    } catch (error) {
        console.error("Error fetching approved promoters:", error);
        return [];
    }
};

/**
 * Registra uma solicitação de remoção de grupo.
 */
export const requestGroupRemoval = async (promoterId: string, campaignName: string, organizationId: string): Promise<void> => {
    try {
        const promoter = await getPromoterById(promoterId);
        if (!promoter) throw new Error("Divulgadora não encontrada.");

        await firestore.collection('groupRemovalRequests').add({
            promoterId,
            promoterName: promoter.name,
            promoterEmail: promoter.email,
            campaignName,
            organizationId,
            status: 'pending',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        throw new Error("Falha ao registrar solicitação.");
    }
};

/**
 * Busca solicitações de remoção pendentes.
 */
export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    try {
        const q = firestore.collection('groupRemovalRequests')
            .where('organizationId', '==', organizationId)
            .where('status', '==', 'pending');
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
    } catch (error) {
        return [];
    }
};

/**
 * Atualiza uma solicitação de remoção.
 */
export const updateGroupRemovalRequest = async (id: string, data: Partial<GroupRemovalRequest>): Promise<void> => {
    try {
        await firestore.collection('groupRemovalRequests').doc(id).update(data);
    } catch (error) {
        throw new Error("Falha ao atualizar solicitação.");
    }
};

/**
 * Salva o token de push no Firestore.
 */
export const savePushToken = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ promoterId, token, metadata });
        return (result.data as any).success;
    } catch (error) {
        console.error("Error saving push token:", error);
        return false;
    }
};

/**
 * Remove o token de push de uma divulgadora.
 */
export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        // FIX: Use promoterId instead of undefined variable 'id'
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        throw new Error("Falha ao remover token.");
    }
};
