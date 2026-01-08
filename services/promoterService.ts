
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterApplicationData, PromoterStatus, RejectionReason, GroupRemovalRequest } from '../types';

export const addPromoter = async (data: any): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  const taxIdClean = data.taxId.replace(/\D/g, '');
  const campaign = data.campaignName || "Inscrição Direta";
  
  if (!data.organizationId) {
      throw new Error("Erro de identificação da produtora.");
  }

  try {
    // Validação de Duplicidade por CPF e Organização
    const existingTaxId = await firestore.collection("promoters")
      .where("taxId", "==", taxIdClean)
      .where("organizationId", "==", data.organizationId)
      .limit(1).get();
      
    if (!existingTaxId.empty) {
        const p = existingTaxId.docs[0].data() as Promoter;
        if (p.status !== 'rejected') {
            throw new Error("Já existe um cadastro aprovado ou pendente para este CPF nesta organização.");
        }
    }

    const photoUrls = await Promise.all(
      data.photos.map(async (file: File, index: number) => {
        const extension = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${index}.${extension}`;
        const path = `promoters/${emailLower}/${fileName}`;
        const fileRef = storage.ref().child(path);
        await fileRef.put(file);
        return await fileRef.getDownloadURL();
      })
    );

    const newPromoter = {
      name: data.name.trim(), 
      email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      taxId: taxIdClean,
      address: data.address || null,
      dateOfBirth: data.dateOfBirth, 
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
    
    if (data.id) {
        await firestore.collection('promoters').doc(data.id).update(newPromoter);
    } else {
        await firestore.collection('promoters').add(newPromoter);
    }
  } catch (error: any) {
    throw new Error(error.message || "Falha ao processar cadastro.");
  }
};

// Fix: Added checkPromoterStatus function
export const checkPromoterStatus = async (email: string): Promise<Promoter[]> => {
    try {
        const snap = await firestore.collection("promoters")
            .where("email", "==", email.toLowerCase().trim())
            .get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    } catch (error) {
        console.error("Error checking promoter status:", error);
        return [];
    }
};

// Fix: Added confirmPromoterGroupEntry function
export const confirmPromoterGroupEntry = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection("promoters").doc(promoterId).update({
            hasJoinedGroup: true,
            groupJoinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error confirming group entry:", error);
        throw new Error("Falha ao confirmar entrada no grupo.");
    }
};

export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    try {
        const snap = await firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    } catch (error) { return []; }
};

export const getLatestPromoterProfileByEmail = async (email: string): Promise<Promoter | null> => {
    try {
        const q = firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).orderBy('createdAt', 'desc').limit(1);
        const snap = await q.get();
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Promoter;
    } catch (error) { return null; }
};

// Fix: Added getPromoterById function
export const getPromoterById = async (id: string): Promise<Promoter | null> => {
    try {
        const doc = await firestore.collection('promoters').doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } as Promoter : null;
    } catch (error) { return null; }
};

export const updatePromoter = async (id: string, data: Partial<Promoter>): Promise<void> => {
  await firestore.collection('promoters').doc(id).update({
      ...data,
      statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
};

export const getAllPromotersForAdmin = async (options: { organizationId: string; status?: string; filterState?: string; }): Promise<Promoter[]> => {
    let q: firebase.firestore.Query = firestore.collection("promoters").where("organizationId", "==", options.organizationId);
    if (options.status && options.status !== 'all') q = q.where("status", "==", options.status);
    if (options.filterState && options.filterState !== 'all') q = q.where("state", "==", options.filterState);
    const snap = await q.orderBy("createdAt", "desc").get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

// Fix: Added generic getAllPromoters function used in dashboards and newsletter
export const getAllPromoters = async (options: { organizationId: string; status?: string | 'all'; filterOrgId?: string; filterState?: string; selectedCampaign?: string; }): Promise<Promoter[]> => {
    let q: firebase.firestore.Query = firestore.collection("promoters");
    
    if (options.organizationId && options.organizationId !== 'all') {
        q = q.where("organizationId", "==", options.organizationId);
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
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

// Fix: Added getApprovedPromoters function
export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters")
            .where("organizationId", "==", organizationId)
            .where("state", "==", state)
            .where("status", "==", "approved");
            
        const snap = await q.get();
        // Since we can't easily do multiple equality on campaignName + associatedCampaigns in one query, we filter client-side
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter))
            .filter(p => p.campaignName === campaignName || p.associatedCampaigns?.includes(campaignName));
    } catch (error) {
        console.error("Error getting approved promoters:", error);
        return [];
    }
};

export const getPromoterStats = async (options: { organizationId: string }): Promise<any> => {
    const snap = await firestore.collection("promoters").where("organizationId", "==", options.organizationId).get();
    const all = snap.docs.map(doc => doc.data() as Promoter);
    return {
        total: all.length,
        pending: all.filter(p => p.status === 'pending').length,
        approved: all.filter(p => p.status === 'approved').length,
        rejected: all.filter(p => p.status === 'rejected' || p.status === 'rejected_editable').length
    };
};

export const getPromotersByIds = async (ids: string[]): Promise<Promoter[]> => {
    if (ids.length === 0) return [];
    const results: Promoter[] = [];
    for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const snap = await firestore.collection("promoters").where(firebase.firestore.FieldPath.documentId(), "in", chunk).get();
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() } as Promoter));
    }
    return results;
};

export const deletePromoter = async (id: string) => firestore.collection('promoters').doc(id).delete();

export const getRejectionReasons = async (orgId: string) => {
    const snap = await firestore.collection("rejectionReasons").where("organizationId", "==", orgId).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Fix: Added rejection reason management functions
export const addRejectionReason = async (text: string, organizationId: string): Promise<void> => {
    await firestore.collection("rejectionReasons").add({ text, organizationId });
};

export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).update({ text });
};

export const deleteRejectionReason = async (id: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).delete();
};

export const notifyPromoterEmail = async (id: string) => { console.log("Notify", id); };

// Fix: Added group removal functions
export const requestGroupRemoval = async (promoterId: string, campaignName: string, organizationId: string): Promise<void> => {
    await firestore.collection("groupRemovalRequests").add({
        promoterId,
        campaignName,
        organizationId,
        status: 'pending',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    const snap = await firestore.collection("groupRemovalRequests")
        .where("organizationId", "==", organizationId)
        .where("status", "==", "pending")
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
};

export const updateGroupRemovalRequest = async (id: string, data: Partial<GroupRemovalRequest>): Promise<void> => {
    await firestore.collection("groupRemovalRequests").doc(id).update(data);
};

// Fix: Added VIP promoter creation
export const createVipPromoter = async (data: { name: string, email: string, whatsapp: string }): Promise<string> => {
    const docRef = await firestore.collection('promoters').add({
        ...data,
        status: 'approved',
        organizationId: 'club-vip-global',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        hasJoinedGroup: true
    });
    return docRef.id;
};

// Fix: Added email change function
export const changePromoterEmail = async (id: string, newEmail: string): Promise<void> => {
    await firestore.collection('promoters').doc(id).update({ email: newEmail.toLowerCase().trim() });
};
