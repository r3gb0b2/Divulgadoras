import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, PromoterStatus, RejectionReason, GroupRemovalRequest } from '../types';

/**
 * Cria um perfil básico para quem quer apenas o VIP
 */
export const createVipPromoter = async (data: { name: string, email: string, whatsapp: string }): Promise<string> => {
    const emailLower = data.email.toLowerCase().trim();
    const promoterRef = firestore.collection('promoters').doc();
    
    await promoterRef.set({
        id: promoterRef.id,
        name: data.name,
        email: emailLower,
        whatsapp: data.whatsapp.replace(/\D/g, ''),
        instagram: 'vip_member',
        status: 'approved',
        organizationId: 'club-vip-global',
        campaignName: 'Membro Clube VIP',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        state: 'N/A',
        photoUrls: []
    });
    
    return promoterRef.id;
};

const getUnixTime = (ts: any): number => {
    if (!ts) return 0; 
    if (typeof ts.toMillis === 'function') return ts.toMillis() / 1000;
    if (ts.seconds !== undefined) return ts.seconds;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime() / 1000;
};

export const addPromoter = async (data: PromoterApplicationData): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  const campaign = (data.campaignName && data.campaignName.trim() !== '') ? data.campaignName.trim() : "Inscrição Direta";
  
  if (!data.organizationId || data.organizationId === 'register' || data.organizationId === 'undefined') {
      throw new Error("Erro de identificação da produtora. Por favor, utilize o link oficial enviado pela sua organização.");
  }

  try {
    const existing = await firestore.collection("promoters")
      .where("email", "==", emailLower)
      .where("organizationId", "==", data.organizationId)
      .where("campaignName", "==", campaign)
      .limit(1).get();
      
    if (!existing.empty) {
      const p = existing.docs[0].data() as Promoter;
      if (p.status !== 'rejected' && p.status !== 'rejected_editable') {
        throw new Error("Você já possui um cadastro em análise para este evento.");
      }
    }

    const photoUrls = await Promise.all(
      data.photos.map(async (file, index) => {
        const extension = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${index}.${extension}`;
        const path = `promoters/${emailLower}/${fileName}`;
        const fileRef = storage.ref().child(path);
        await fileRef.put(file);
        return await fileRef.getDownloadURL();
      })
    );

    const newPromoter: any = {
      name: data.name.trim(), 
      email: emailLower,
      cpf: (data as any).cpf || '',
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      tiktok: data.tiktok?.replace('@', '').trim() || '',
      dateOfBirth: data.dateOfBirth,
      cep: (data as any).cep || '',
      address: (data as any).address || '',
      city: (data as any).city || '',
      photoUrls, 
      facePhotoUrl: photoUrls[0],
      status: 'pending', 
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: data.state, 
      campaignName: campaign, 
      organizationId: data.organizationId, 
      allCampaigns: [campaign]
    };
    
    const editId = (data as any).id;
    if (editId) {
        await firestore.collection('promoters').doc(editId).update(newPromoter);
    } else {
        await firestore.collection('promoters').add(newPromoter);
    }
  } catch (error: any) {
    throw new Error(error.message || "Falha ao processar cadastro.");
  }
};

export const checkPromoterStatus = async (email: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

export const getLatestPromoterProfileByEmail = async (email: string): Promise<Promoter | null> => {
    try {
        const q = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim());
        const snap = await q.get();
        if (snap.empty) return null;
        
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        docs.sort((a, b) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
        
        return docs[0];
    } catch (error) { return null; }
};

export const getPromoterById = async (id: string): Promise<Promoter | null> => {
  try {
    const doc = await firestore.collection('promoters').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as Promoter : null;
  } catch (error) { return null; }
};

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
        results.sort((a, b) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
        return results;
    } catch (error) { return []; }
};

export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    try {
        const snap = await firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).get();
        return snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Promoter))
            .filter(p => p && p.email && p.name)
            .sort((a, b) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
    } catch (error) { return []; }
};

export const getAllPromoters = async (options: {
    organizationId: string;
    filterOrgId?: string;
    filterState?: string;
    selectedCampaign?: string;
    status?: PromoterStatus | 'all';
}): Promise<Promoter[]> => {
    try {
        const orgId = options.filterOrgId && options.filterOrgId !== 'all' ? options.filterOrgId : options.organizationId;
        
        if (!orgId) return [];

        let q: firebase.firestore.Query = firestore.collection("promoters")
            .where("organizationId", "==", orgId);
        
        if (options.status && options.status !== 'all') {
            q = q.where("status", "==", options.status);
        }

        if (options.filterState && options.filterState !== 'all') {
            q = q.where("state", "==", options.filterState);
        }

        q = q.orderBy("createdAt", "desc");

        const snap = await q.limit(5000).get();
        let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));

        if (options.selectedCampaign && options.selectedCampaign !== 'all') {
            const campaign = options.selectedCampaign;
            results = results.filter(p => 
                p.campaignName === campaign || 
                (p.associatedCampaigns && p.associatedCampaigns.includes(campaign))
            );
        }

        return results;
    } catch (error: any) {
        console.error("Erro ao buscar divulgadoras:", error);
        throw new Error("Não foi possível carregar a lista de equipe.");
    }
};

export const getAllPromotersForAdmin = async (options: {
    organizationId: string;
    status?: PromoterStatus | 'all';
    filterState?: string;
}): Promise<Promoter[]> => {
    return getAllPromoters({
        organizationId: options.organizationId,
        status: options.status,
        filterState: options.filterState
    });
};

export const getPromoterStats = async (options: {
    organizationId?: string; filterState?: string; selectedCampaign?: string;
}): Promise<{ total: number, pending: number, approved: number, rejected: number, removed: number }> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("promoters");
        if (options.organizationId) q = q.where("organizationId", "==", options.organizationId);
        
        const snap = await q.get();
        const all = snap.docs.map(doc => doc.data() as Promoter);
        return {
            total: all.length,
            pending: all.filter(p => p.status === 'pending').length,
            approved: all.filter(p => p.status === 'approved').length,
            rejected: all.filter(p => (p.status as string) === 'rejected' || (p.status as string) === 'rejected_editable').length,
            removed: all.filter(p => p.status === 'removed').length,
        };
    } catch (error) { return { total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 }; }
};

export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    const finalData = {
        ...data,
        statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await firestore.collection('promoters').doc(id).update(finalData);
  } catch (error) { 
    throw new Error("Falha ao atualizar cadastro."); 
  }
};

export const deletePromoter = async (id: string): Promise<void> => {
    try { await firestore.collection('promoters').doc(id).delete(); } catch (error) { throw new Error("Falha ao excluir."); }
};

export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    try {
        const q = firestore.collection("rejectionReasons").where("organizationId", "==", organizationId);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RejectionReason));
    } catch (error) { return []; }
};

export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters")
            .where("organizationId", "==", organizationId)
            .where("state", "==", state)
            .where("status", "==", "approved");
            
        const snap = await q.get();
        const allApproved = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        const results = allApproved.filter(p => p.campaignName === campaignName || (p.associatedCampaigns && p.associatedCampaigns.includes(campaignName)));
        return results;
    } catch (error) { return []; }
};

export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    try {
        const q = firestore.collection('groupRemovalRequests').where('organizationId', '==', organizationId).where('status', '==', 'pending');
        const snap = await q.get();
        const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
        return results;
    } catch (error) { return []; }
};

export const updateGroupRemovalRequest = async (id: string, data: Partial<GroupRemovalRequest>): Promise<void> => {
    try { await firestore.collection('groupRemovalRequests').doc(id).update(data); } catch (error) { throw new Error("Falha ao atualizar solicitação."); }
}

export const notifyPromoterEmail = async (id: string): Promise<void> => {
  try {
    const func = functions.httpsCallable('notifyPromoterEmail');
    await func({ promoterId: id });
  } catch (error) {
    console.error("Erro ao notificar por e-mail:", error);
    throw new Error("Não foi possível enviar o e-mail de notificação.");
  }
};

export const confirmPromoterGroupEntry = async (id: string): Promise<void> => {
  try {
    await firestore.collection('promoters').doc(id).update({
      hasJoinedGroup: true,
      statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Erro ao confirmar entrada no grupo:", error);
    throw new Error("Não foi possível confirmar a entrada no grupo.");
  }
};

export const addRejectionReason = async (text: string, organizationId: string): Promise<string> => {
  try {
    const docRef = await firestore.collection('rejectionReasons').add({
      text: text.trim(),
      organizationId
    });
    return docRef.id;
  } catch (error) {
    throw new Error("Falha ao adicionar motivo de rejeição.");
  }
};

export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
  try {
    await firestore.collection('rejectionReasons').doc(id).update({
      text: text.trim()
    });
  } catch (error) {
    throw new Error("Falha ao atualizar motivo de rejeição.");
  }
};

export const deleteRejectionReason = async (id: string): Promise<void> => {
  try {
    await firestore.collection('rejectionReasons').doc(id).delete();
  } catch (error) {
    throw new Error("Falha ao remover motivo de rejeição.");
  }
};

export const requestGroupRemoval = async (promoterId: string, campaignName: string, organizationId: string): Promise<void> => {
  try {
    const p = await getPromoterById(promoterId);
    await firestore.collection('groupRemovalRequests').add({
      promoterId,
      promoterName: p?.name || 'Desconhecido',
      promoterEmail: p?.email || '',
      campaignName,
      organizationId,
      status: 'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    throw new Error("Falha ao solicitar remoção.");
  }
};

export const changePromoterEmail = async (id: string, newEmail: string): Promise<void> => {
  try {
    await firestore.collection('promoters').doc(id).update({
      email: newEmail.toLowerCase().trim()
    });
  } catch (error) {
    throw new Error("Falha ao alterar e-mail.");
  }
};
