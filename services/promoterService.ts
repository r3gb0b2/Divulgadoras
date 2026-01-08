
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { Promoter, PromoterStatus, RejectionReason, GroupRemovalRequest } from '../types';

export const addPromoter = async (data: any): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  const taxIdClean = data.taxId.replace(/\D/g, '');
  const campaign = data.campaignName || "Inscrição Direta";
  
  if (!data.organizationId) {
      throw new Error("Erro de identificação da produtora.");
  }

  try {
    // 1. Validação de Duplicidade (CPF)
    const existingTaxId = await firestore.collection("promoters")
      .where("taxId", "==", taxIdClean)
      .where("organizationId", "==", data.organizationId)
      .limit(1).get();
      
    if (!existingTaxId.empty && !data.id) {
        throw new Error("Este CPF já possui um cadastro nesta organização.");
    }

    // 2. Upload da Foto de Rosto (Principal)
    let facePhotoUrl = "";
    if (data.facePhoto) {
        const faceRef = storage.ref(`promoters/${emailLower}/face_${Date.now()}.jpg`);
        await faceRef.put(data.facePhoto);
        facePhotoUrl = await faceRef.getDownloadURL();
    }

    // 3. Upload das Fotos de Corpo/Look
    let bodyPhotoUrls: string[] = [];
    if (data.bodyPhotos && data.bodyPhotos.length > 0) {
      bodyPhotoUrls = await Promise.all(
        data.bodyPhotos.map(async (file: File, index: number) => {
          const extension = file.name.split('.').pop() || 'jpg';
          const fileName = `body_${Date.now()}_${index}.${extension}`;
          const path = `promoters/${emailLower}/${fileName}`;
          const fileRef = storage.ref().child(path);
          await fileRef.put(file);
          return await fileRef.getDownloadURL();
        })
      );
    }

    // 4. Montagem do Payload
    const promoterPayload = {
      name: data.name.trim(), 
      email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      taxId: taxIdClean,
      address: data.address || null,
      dateOfBirth: data.dateOfBirth, 
      facePhotoUrl: facePhotoUrl || data.existingFacePhoto || "",
      bodyPhotoUrls: bodyPhotoUrls.length > 0 ? bodyPhotoUrls : (data.existingBodyPhotos || []),
      photoUrls: [facePhotoUrl || data.existingFacePhoto, ...(bodyPhotoUrls.length > 0 ? bodyPhotoUrls : (data.existingBodyPhotos || []))].filter(Boolean),
      status: 'pending' as PromoterStatus, 
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      statusChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
      state: data.state, 
      campaignName: campaign, 
      organizationId: data.organizationId, 
      allCampaigns: firebase.firestore.FieldValue.arrayUnion(campaign)
    };
    
    if (data.id) {
        await firestore.collection('promoters').doc(data.id).update(promoterPayload);
    } else {
        await firestore.collection('promoters').add(promoterPayload);
    }
  } catch (error: any) {
    console.error("AddPromoter Error:", error);
    throw new Error(error.message || "Falha ao processar cadastro.");
  }
};

export const checkPromoterStatus = async (email: string): Promise<Promoter[]> => {
    try {
        const snap = await firestore.collection("promoters")
            .where("email", "==", email.toLowerCase().trim())
            .get();
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

export const getAllPromotersForAdmin = async (options: { organizationId: string; status?: string; filterState?: string; selectedCampaign?: string; filterOrgId?: string; }): Promise<Promoter[]> => {
    let q: firebase.firestore.Query = firestore.collection("promoters");
    
    if (options.organizationId && options.organizationId !== 'all') {
        q = q.where("organizationId", "==", options.organizationId);
    }
    
    if (options.status && options.status !== 'all') q = q.where("status", "==", options.status);
    if (options.filterState && options.filterState !== 'all') q = q.where("state", "==", options.filterState);
    
    const snap = await q.orderBy("createdAt", "desc").get();
    let promoters = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
    
    if (options.selectedCampaign && options.selectedCampaign !== 'all') {
        promoters = promoters.filter(p => p.campaignName === options.selectedCampaign || p.associatedCampaigns?.includes(options.selectedCampaign!));
    }
    
    return promoters;
};

// FIX: Added alias for components requesting getAllPromoters
export const getAllPromoters = getAllPromotersForAdmin;

// FIX: Added getPromotersByIds function
export const getPromotersByIds = async (ids: string[]): Promise<Promoter[]> => {
    if (ids.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10));
    }
    const results = await Promise.all(chunks.map(chunk => 
        firestore.collection("promoters").where(firebase.firestore.FieldPath.documentId(), "in", chunk).get()
    ));
    const promoters: Promoter[] = [];
    results.forEach(snap => {
        snap.forEach(doc => promoters.push({ id: doc.id, ...doc.data() } as Promoter));
    });
    return promoters;
};

export const getApprovedPromoters = async (organizationId: string, state: string, campaignName: string): Promise<Promoter[]> => {
    try {
        const q = firestore.collection("promoters")
            .where("organizationId", "==", organizationId)
            .where("state", "==", state)
            .where("status", "==", "approved");
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter))
            .filter(p => p.campaignName === campaignName || p.associatedCampaigns?.includes(campaignName));
    } catch (error) { return []; }
};

export const deletePromoter = async (id: string) => firestore.collection('promoters').doc(id).delete();

export const confirmPromoterGroupEntry = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection("promoters").doc(promoterId).update({
            hasJoinedGroup: true,
            groupJoinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) { throw new Error("Falha ao confirmar entrada no grupo."); }
};

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

// FIX: Added missing getPromoterStats function
export const getPromoterStats = async (options: { organizationId: string }): Promise<any> => {
    const snap = await firestore.collection("promoters")
        .where("organizationId", "==", options.organizationId)
        .get();
    
    const stats = { total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 };
    snap.forEach(doc => {
        const data = doc.data();
        stats.total++;
        if (data.status === 'pending') stats.pending++;
        else if (data.status === 'approved') stats.approved++;
        else if (data.status === 'rejected' || data.status === 'rejected_editable') stats.rejected++;
        else if (data.status === 'removed') stats.removed++;
    });
    return stats;
};

// FIX: Added missing getRejectionReasons function
export const getRejectionReasons = async (organizationId: string): Promise<RejectionReason[]> => {
    const snap = await firestore.collection("rejectionReasons")
        .where("organizationId", "==", organizationId)
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RejectionReason));
};

// FIX: Added missing addRejectionReason function
export const addRejectionReason = async (text: string, organizationId: string): Promise<void> => {
    await firestore.collection("rejectionReasons").add({ text, organizationId });
};

// FIX: Added missing updateRejectionReason function
export const updateRejectionReason = async (id: string, text: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).update({ text });
};

// FIX: Added missing deleteRejectionReason function
export const deleteRejectionReason = async (id: string): Promise<void> => {
    await firestore.collection("rejectionReasons").doc(id).delete();
};

// FIX: Added missing findPromotersByEmail function
export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters")
        .where("email", "==", email.toLowerCase().trim())
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

// FIX: Added missing notifyPromoterEmail function
export const notifyPromoterEmail = async (promoterId: string): Promise<void> => {
    const func = functions.httpsCallable('notifyPromoterEmail');
    await func({ promoterId });
};

// FIX: Added missing requestGroupRemoval function
export const requestGroupRemoval = async (promoterId: string, campaignName: string, organizationId: string): Promise<void> => {
    await firestore.collection("groupRemovalRequests").add({
        promoterId,
        campaignName,
        organizationId,
        status: 'pending',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

// FIX: Added missing getGroupRemovalRequests function
export const getGroupRemovalRequests = async (organizationId: string): Promise<GroupRemovalRequest[]> => {
    const q = firestore.collection("groupRemovalRequests")
        .where("organizationId", "==", organizationId)
        .where("status", "==", "pending");
    const snap = await q.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupRemovalRequest));
};

// FIX: Added missing updateGroupRemovalRequest function
export const updateGroupRemovalRequest = async (id: string, data: Partial<GroupRemovalRequest>): Promise<void> => {
    await firestore.collection("groupRemovalRequests").doc(id).update(data);
};

// FIX: Added missing changePromoterEmail function
export const changePromoterEmail = async (promoterId: string, newEmail: string): Promise<void> => {
    await firestore.collection("promoters").doc(promoterId).update({
        email: newEmail.toLowerCase().trim()
    });
};
