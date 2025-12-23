
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, PromoterStatus, RejectionReason, GroupRemovalRequest } from '../types';

/**
 * Remove recursivamente objetos não serializáveis antes de enviar para Callable Functions.
 */
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

/**
 * Altera o e-mail da divulgadora chamando uma Cloud Function para sincronizar dados vinculados.
 */
export const changePromoterEmail = async (promoterId: string, oldEmail: string, newEmail: string): Promise<void> => {
    try {
        const updateFunc = functions.httpsCallable('updatePromoterEmail');
        await updateFunc({ promoterId, oldEmail, newEmail: newEmail.toLowerCase().trim() });
    } catch (error: any) {
        console.error("Error changing promoter email:", error);
        throw new Error(error.message || "Falha ao alterar e-mail.");
    }
};

/**
 * Adiciona uma nova divulgadora, enviando as fotos para o Storage
 * e salvando os dados no Firestore com normalização.
 */
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
        const metadata = { contentType: file.type };
        await fileRef.put(file, metadata);
        return await fileRef.getDownloadURL();
      })
    );

    if (photoUrls.length === 0) throw new Error("Falha ao processar imagens.");

    const newPromoter: Omit<Promoter, 'id'> = {
      name: data.name.trim(), email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      tiktok: data.tiktok?.replace('@', '').trim() || '',
      dateOfBirth: data.dateOfBirth, photoUrls, facePhotoUrl: photoUrls[0],
      status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: data.state, campaignName: campaign, organizationId: data.organizationId, allCampaigns: [campaign]
    };
    await firestore.collection('promoters').add(newPromoter);
  } catch (error: any) {
    throw new Error(error.message || "Falha ao processar cadastro. Tente novamente.");
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

/**
 * Confirma a entrada no grupo e aceitação de regras.
 * Agora sincroniza com TODAS as inscrições APROVADAS da mesma divulgadora na mesma organização.
 */
export const confirmPromoterGroupEntry = async (id: string): Promise<void> => {
    try {
        const doc = await firestore.collection('promoters').doc(id).get();
        if (!doc.exists) return;
        const data = doc.data() as Promoter;
        
        // Busca todos os registros deste e-mail nesta organização que estejam aprovados
        const relatedSnap = await firestore.collection('promoters')
            .where('email', '==', data.email.toLowerCase().trim())
            .where('organizationId', '==', data.organizationId)
            .where('status', '==', 'approved')
            .get();
        
        const batch = firestore.batch();
        relatedSnap.forEach(doc => {
            batch.update(doc.ref, { hasJoinedGroup: true });
        });
        
        await batch.commit();
    } catch (error) {
        console.error("Erro ao sincronizar aceite de regras:", error);
        // Fallback para o ID individual se a busca falhar
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

export const getAllPromoters = async (options: {
    organizationId?: string; statesForScope?: string[] | null; status?: PromoterStatus | 'all';
    assignedCampaignsForScope?: { [state: string]: string[] }; selectedCampaign?: string;
    filterOrgId?: string; filterState?: string;
}): Promise<Promoter[]> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("promoters");
        if (options.organizationId) q = q.where("organizationId", "==", options.organizationId);
        else if (options.filterOrgId && options.filterOrgId !== 'all') q = q.where("organizationId", "==", options.filterOrgId);
        if (options.status && options.status !== 'all') q = q.where("status", "==", options.status);
        if (options.filterState && options.filterState !== 'all') q = q.where("state", "==", options.filterState);
        if (options.selectedCampaign && options.selectedCampaign !== 'all') q = q.where("campaignName", "==", options.selectedCampaign);
        const snap = await q.get();
        let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
        if (options.statesForScope && !options.filterState) results = results.filter(p => options.statesForScope!.includes(p.state));
        if (options.assignedCampaignsForScope) {
            results = results.filter(p => {
                const allowed = options.assignedCampaignsForScope![p.state];
                if (!allowed) return true;
                return allowed.includes(p.campaignName || '');
            });
        }
        return results;
    } catch (error) { throw new Error("Falha ao buscar divulgadoras."); }
};

export const getPromoterStats = async (options: {
    organizationId?: string; statesForScope?: string[] | null;
    filterOrgId?: string; filterState?: string; selectedCampaign?: string;
}): Promise<{ total: number, pending: number, approved: number, rejected: number, removed: number }> => {
    const all = await getAllPromoters({ ...options, status: 'all' });
    return {
        total: all.length, pending: all.filter(p => p.status === 'pending').length,
        approved: all.filter(p => p.status === 'approved').length,
        rejected: all.filter(p => p.status === 'rejected' || p.status === 'rejected_editable').length,
        removed: all.filter(p => p.status === 'removed').length,
    };
};

export const updatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>): Promise<void> => {
  try {
    if (data.status === 'approved') {
        const updateFunc = functions.httpsCallable('updatePromoterAndSync');
        const cleanedData = cleanForCallable(data);
        await updateFunc({ promoterId: id, data: cleanedData });
    } else { await firestore.collection('promoters').doc(id).update(data); }
  } catch (error) { throw new Error("Falha ao atualizar divulgadora."); }
};

export const deletePromoter = async (id: string): Promise<void> => {
    try { await firestore.collection('promoters').doc(id).delete(); } catch (error) { throw new Error("Falha ao excluir inscrição."); }
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
            campaignName, organizationId, status: 'pending', requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) { throw new Error("Falha ao registrar solicitação."); }
};

export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    try {
        const q = firestore.collection('groupRemovalRequests').where('organizationId', '==', organizationId).where('status', '==', 'pending');
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
    } catch (error) { return []; }
};

export const updateGroupRemovalRequest = async (id: string, data: Partial<GroupRemovalRequest>): Promise<void> => {
    try { await firestore.collection('groupRemovalRequests').doc(id).update(data); } catch (error) { throw new Error("Falha ao atualizar solicitação."); }
};

export const savePushToken = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ promoterId, token, metadata });
        return (result.data as any).success;
    } catch (error) { return false; }
};

export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) { throw new Error("Falha ao remover token."); }
};
