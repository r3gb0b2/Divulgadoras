import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, PromoterStatus, RejectionReason, GroupRemovalRequest } from '../types';

const cleanForCallable = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof firebase.firestore.FieldValue) return undefined; 
    if (Array.isArray(obj)) return obj.map(cleanForCallable);
    const cleaned: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = cleanForCallable(obj[key]);
            if (val !== undefined) cleaned[key] = val;
        }
    }
    return cleaned;
};

export const changePromoterEmail = async (promoterId: string, oldEmail: string, newEmail: string): Promise<void> => {
    try {
        const updateFunc = functions.httpsCallable('updatePromoterEmail');
        await updateFunc({ promoterId, oldEmail, newEmail: newEmail.toLowerCase().trim() });
    } catch (error: any) {
        throw new Error(error.message || "Falha ao alterar e-mail.");
    }
};

export const addPromoter = async (data: PromoterApplicationData): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  const campaign = (data.campaignName && data.campaignName.trim() !== '') ? data.campaignName.trim() : "Geral";
  
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

    const newPromoter: Omit<Promoter, 'id'> = {
      name: data.name.trim(), email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      tiktok: data.tiktok?.replace('@', '').trim() || '',
      dateOfBirth: data.dateOfBirth, photoUrls, facePhotoUrl: photoUrls[0],
      status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: data.state, campaignName: campaign, organizationId: data.organizationId, allCampaigns: [campaign]
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
        const q = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).orderBy("createdAt", "desc").limit(1);
        const snap = await q.get();
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Promoter;
    } catch (error) { return null; }
};

export const confirmPromoterGroupEntry = async (id: string): Promise<void> => {
    try {
        const doc = await firestore.collection('promoters').doc(id).get();
        if (!doc.exists) return;
        const data = doc.data() as Promoter;
        const relatedSnap = await firestore.collection('promoters').where('email', '==', data.email.toLowerCase().trim()).where('organizationId', '==', data.organizationId).where('status', '==', 'approved').get();
        const batch = firestore.batch();
        relatedSnap.forEach(doc => { batch.update(doc.ref, { hasJoinedGroup: true }); });
        await batch.commit();
    } catch (error) {
        await firestore.collection('promoters').doc(id).update({ hasJoinedGroup: true });
    }
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
        return results;
    } catch (error) { return []; }
};

export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    try {
        const snap = await firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    } catch (error) { return []; }
};

export const getAllPromotersPaginated = async (options: {
    organizationId?: string; status?: PromoterStatus | 'all';
    filterState?: string; selectedCampaign?: string;
    pageSize: number; lastDoc?: any;
}): Promise<{ promoters: Promoter[], lastDoc: any }> => {
    const fetchWithQuery = async (useOrderBy: boolean) => {
        let q: firebase.firestore.Query = firestore.collection("promoters");
        if (options.organizationId) q = q.where("organizationId", "==", options.organizationId);
        if (options.status && options.status !== 'all') q = q.where("status", "==", options.status);
        if (options.filterState && options.filterState !== 'all') q = q.where("state", "==", options.filterState);
        if (options.selectedCampaign && options.selectedCampaign !== 'all') q = q.where("campaignName", "==", options.selectedCampaign);
        if (useOrderBy) q = q.orderBy("createdAt", "desc");
        if (options.lastDoc) q = q.startAfter(options.lastDoc);
        q = q.limit(options.pageSize);
        return await q.get();
    };

    try {
        let snap;
        try { snap = await fetchWithQuery(true); } catch (e) { snap = await fetchWithQuery(false); }
        const promoters = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        const lastVisible = snap.docs[snap.docs.length - 1];
        return { promoters, lastDoc: lastVisible };
    } catch (error) { throw new Error("Erro ao buscar no banco."); }
};

export const getAllPromoters = async (options: {
    organizationId?: string; statesForScope?: string[] | null; status?: PromoterStatus | 'all';
    assignedCampaignsForScope?: { [state: string]: string[] }; selectedCampaign?: string;
    filterOrgId?: string; filterState?: string; limitCount?: number;
}): Promise<Promoter[]> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("promoters");
        if (options.organizationId) q = q.where("organizationId", "==", options.organizationId);
        else if (options.filterOrgId && options.filterOrgId !== 'all') q = q.where("organizationId", "==", options.filterOrgId);
        if (options.status && options.status !== 'all') q = q.where("status", "==", options.status);
        if (options.filterState && options.filterState !== 'all') q = q.where("state", "==", options.filterState);
        if (options.selectedCampaign && options.selectedCampaign !== 'all') q = q.where("campaignName", "==", options.selectedCampaign);
        if (options.limitCount) q = q.limit(options.limitCount);
        const snap = await q.get();
        let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        if (options.statesForScope && options.statesForScope.length > 0 && !options.filterState) {
            results = results.filter(p => options.statesForScope!.includes(p.state));
        }
        return results;
    } catch (error) { throw new Error("Falha ao buscar divulgadoras."); }
};

export const getPromoterStats = async (options: {
    organizationId?: string; filterState?: string; selectedCampaign?: string;
}): Promise<{ total: number, pending: number, approved: number, rejected: number, removed: number }> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("promoters");
        if (options.organizationId) q = q.where("organizationId", "==", options.organizationId);
        if (options.filterState && options.filterState !== 'all') q = q.where("state", "==", options.filterState);
        if (options.selectedCampaign && options.selectedCampaign !== 'all') q = q.where("campaignName", "==", options.selectedCampaign);
        const snap = await q.get();
        const all = snap.docs.map(doc => doc.data() as Promoter);
        return {
            total: all.length,
            pending: all.filter(p => p.status === 'pending').length,
            approved: all.filter(p => p.status === 'approved').length,
            rejected: all.filter(p => p.status === 'rejected' || p.status === 'rejected_editable').length,
            removed: all.filter(p => p.status === 'removed').length,
        };
    } catch (error) { return { total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 }; }
};

export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    if (data.status === 'approved' || data.status === 'rejected_editable') {
        const updateFunc = functions.httpsCallable('updatePromoterAndSync');
        await updateFunc({ promoterId: id, data: cleanForCallable(data) });
    } else { 
        await firestore.collection('promoters').doc(id).update(data); 
    }
  } catch (error) { throw new Error("Falha ao atualizar."); }
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

export const addRejectionReason = async (text: string, organizationId: string): Promise<void> => {
    await firestore.collection("rejectionReasons").add({ text, organizationId });
};

export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).update({ text });
};

export const deleteRejectionReason = async (id: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).delete();
};

export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters").where("organizationId", "==", organizationId).where("state", "==", state).where("status", "==", "approved");
        const snap = await q.get();
        const allApproved = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        return allApproved.filter(p => p.campaignName === campaignName || (p.associatedCampaigns && p.associatedCampaigns.includes(campaignName)));
    } catch (error) { return []; }
};

export const requestGroupRemoval = async (promoterId: string, campaignName: string, organizationId: string): Promise<void> => {
    try {
        const promoter = await getPromoterById(promoterId);
        if (!promoter) throw new Error("Divulgadora não encontrada.");
        await firestore.collection('groupRemovalRequests').add({
            promoterId, promoterName: promoter.name, promoterEmail: promoter.email,
            campaignName, organizationId, status: 'pending', requestedAt: firebase.firestore.Timestamp.now(),
        });
    } catch (error) { throw new Error("Falha ao registrar."); }
};

export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    try {
        const q = firestore.collection('groupRemovalRequests').where('organizationId', '==', organizationId).where('status', '==', 'pending');
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
    } catch (error) { return []; }
};

export const updateGroupRemovalRequest = async (id: string, data: Partial<GroupRemovalRequest>): Promise<void> => {
    try { await firestore.collection('groupRemovalRequests').doc(id).update(data); } catch (error) { throw new Error("Falha ao atualizar."); }
}