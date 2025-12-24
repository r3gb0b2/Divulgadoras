
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, RejectionReason, GroupRemovalRequest } from '../types';

export const addPromoter = async (data: PromoterApplicationData): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  const campaign = data.campaignName || "Geral";
  
  try {
    // 1. Verificar se já existe cadastro aprovado ou pendente para este evento
    const existing = await firestore.collection("promoters")
      .where("email", "==", emailLower)
      .where("organizationId", "==", data.organizationId)
      .where("campaignName", "==", campaign)
      .limit(1).get();
      
    if (!existing.empty) {
      const p = existing.docs[0].data() as Promoter;
      if (p.status === 'approved' || p.status === 'pending') {
        throw new Error("Você já possui um cadastro ativo para este evento.");
      }
    }

    // 2. Upload das fotos para o Storage
    const photoUrls = await Promise.all(
      data.photos.map(async (file, index) => {
        const timestamp = Date.now();
        const extension = file.name.split('.').pop() || 'jpg';
        const fileName = `${timestamp}_${index}.${extension}`;
        const path = `promoters/${emailLower}/${fileName}`;
        const fileRef = storage.ref().child(path);
        
        await fileRef.put(file, { contentType: file.type });
        return await fileRef.getDownloadURL();
      })
    );

    if (photoUrls.length === 0) throw new Error("Erro ao processar as fotos.");

    // 3. Salvar no Firestore
    const newPromoter: Omit<Promoter, 'id'> = {
      name: data.name.trim(),
      email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      tiktok: data.tiktok?.replace('@', '').trim() || '',
      dateOfBirth: data.dateOfBirth,
      photoUrls: photoUrls,
      facePhotoUrl: photoUrls[0], // A primeira foto é a principal
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: data.state,
      campaignName: campaign,
      organizationId: data.organizationId,
      allCampaigns: [campaign]
    };

    await firestore.collection('promoters').add(newPromoter);
  } catch (error: any) {
    console.error("Promoter Registration Error:", error);
    throw new Error(error.message || "Falha ao salvar cadastro. Verifique sua conexão.");
  }
};

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

// FIX: Added missing getAllPromoters function required by AdminPanel and others.
export const getAllPromoters = async (options: {
  organizationId?: string;
  status?: string | 'all';
  filterState?: string;
  selectedCampaign?: string;
  statesForScope?: string[];
  assignedCampaignsForScope?: { [state: string]: string[] };
  filterOrgId?: string;
} = {}): Promise<Promoter[]> => {
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

  if (options.statesForScope && options.statesForScope.length > 0) {
    results = results.filter(p => options.statesForScope!.includes(p.state));
  }

  if (options.assignedCampaignsForScope && Object.keys(options.assignedCampaignsForScope).length > 0) {
    results = results.filter(p => {
      const allowedCamps = options.assignedCampaignsForScope![p.state];
      if (!allowedCamps) return true;
      if (allowedCamps.length === 0) return true;
      return allowedCamps.includes(p.campaignName || '');
    });
  }

  return results.sort((a, b) => {
    const timeA = (a.createdAt as any)?.seconds || 0;
    const timeB = (b.createdAt as any)?.seconds || 0;
    return timeB - timeA;
  });
};

// FIX: Added missing getPromoterStats function.
export const getPromoterStats = async (options: any): Promise<any> => {
    const promoters = await getAllPromoters(options);
    return {
        total: promoters.length,
        pending: promoters.filter(p => p.status === 'pending').length,
        approved: promoters.filter(p => p.status === 'approved').length,
        rejected: promoters.filter(p => p.status === 'rejected' || p.status === 'rejected_editable').length,
        removed: promoters.filter(p => p.status === 'removed').length,
    };
};

// FIX: Added missing findPromotersByEmail function.
export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters")
        .where("email", "==", email.toLowerCase().trim())
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

// FIX: Added missing getApprovedPromoters function.
export const getApprovedPromoters = async (orgId: string, stateAbbr: string, campaignName: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters")
        .where("organizationId", "==", orgId)
        .where("state", "==", stateAbbr)
        .where("status", "==", "approved")
        .get();
    
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter))
        .filter(p => p.campaignName === campaignName || (p.associatedCampaigns || []).includes(campaignName));
};

// FIX: Added missing getPromotersByIds function.
export const getPromotersByIds = async (ids: string[]): Promise<Promoter[]> => {
    if (ids.length === 0) return [];
    const results: Promoter[] = [];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10));
    }
    
    for (const chunk of chunks) {
        const snap = await firestore.collection("promoters")
            .where(firebase.firestore.FieldPath.documentId(), "in", chunk)
            .get();
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() } as Promoter));
    }
    return results;
};

// FIX: Added missing getPromoterById function.
export const getPromoterById = async (id: string): Promise<Promoter | null> => {
    const doc = await firestore.collection("promoters").doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as Promoter : null;
};

// FIX: Added missing deletePromoter function.
export const deletePromoter = async (id: string): Promise<void> => {
    await firestore.collection("promoters").doc(id).delete();
};

// FIX: Added missing getRejectionReasons function.
export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    const snap = await firestore.collection("rejectionReasons")
        .where("organizationId", "==", organizationId)
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RejectionReason));
};

// FIX: Added missing addRejectionReason function.
export const addRejectionReason = async (text: string, organizationId: string): Promise<void> => {
    await firestore.collection("rejectionReasons").add({ text, organizationId });
};

// FIX: Added missing updateRejectionReason function.
export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).update({ text });
};

// FIX: Added missing deleteRejectionReason function.
export const deleteRejectionReason = async (id: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).delete();
};

// FIX: Added missing confirmPromoterGroupEntry function.
export const confirmPromoterGroupEntry = async (id: string): Promise<void> => {
    await firestore.collection("promoters").doc(id).update({ hasJoinedGroup: true });
};

// FIX: Added missing changePromoterEmail function.
export const changePromoterEmail = async (id: string, oldEmail: string, newEmail: string): Promise<void> => {
    await firestore.collection("promoters").doc(id).update({ email: newEmail.toLowerCase().trim() });
};

// FIX: Added missing requestGroupRemoval function.
export const requestGroupRemoval = async (promoterId: string, campaignName: string, orgId: string): Promise<void> => {
    const promoter = await getPromoterById(promoterId);
    if (!promoter) throw new Error("Promoter não encontrada.");
    
    await firestore.collection("groupRemovalRequests").add({
        promoterId,
        promoterName: promoter.name,
        promoterEmail: promoter.email,
        campaignName,
        organizationId: orgId,
        status: 'pending',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

// FIX: Added missing getGroupRemovalRequests function.
export const getGroupRemovalRequests = async (orgId: string): Promise<GroupRemovalRequest[]> => {
    const snap = await firestore.collection("groupRemovalRequests")
        .where("organizationId", "==", orgId)
        .where("status", "==", "pending")
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
};

// FIX: Added missing updateGroupRemovalRequest function.
export const updateGroupRemovalRequest = async (id: string, data: any): Promise<void> => {
    await firestore.collection("groupRemovalRequests").doc(id).update(data);
};

// FIX: Added missing savePushToken function.
export const savePushToken = async (promoterId: string, token: string, metadata: any): Promise<boolean> => {
    try {
        await firestore.collection("promoters").doc(promoterId).update({
            fcmToken: token,
            pushDiagnostics: {
                ...metadata,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
        return true;
    } catch (e) {
        return false;
    }
};

// FIX: Added missing deletePushToken function.
export const deletePushToken = async (promoterId: string): Promise<void> => {
    await firestore.collection("promoters").doc(promoterId).update({
        fcmToken: firebase.firestore.FieldValue.delete(),
        pushDiagnostics: firebase.firestore.FieldValue.delete()
    });
};

export const checkPromoterStatus = async (email: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

export const updatePromoter = async (id: string, data: Partial<Promoter>): Promise<void> => {
    await firestore.collection('promoters').doc(id).update(data);
};
