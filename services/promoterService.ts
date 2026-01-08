import firebase from 'firebase/compat/app';
import { firestore, storage } from '../firebase/config';
import { Promoter, PromoterStatus } from '../types';

export const addPromoter = async (data: any): Promise<void> => {
  const emailLower = data.email.toLowerCase().trim();
  const taxIdClean = data.taxId.replace(/\D/g, '');
  const campaign = data.campaignName || "Inscrição Direta";
  
  if (!data.organizationId) {
      throw new Error("Erro de identificação da produtora.");
  }

  try {
    // 1. Verificação de Duplicidade de CPF no Banco de Dados
    const existingTaxId = await firestore.collection("promoters")
      .where("taxId", "==", taxIdClean)
      .where("organizationId", "==", data.organizationId)
      .limit(1).get();
      
    if (!existingTaxId.empty && !data.id) {
        throw new Error("Este CPF já possui um cadastro pendente ou aprovado nesta produtora.");
    }

    // 2. Upload da Foto de Rosto
    let facePhotoUrl = data.existingFacePhoto || "";
    if (data.facePhoto) {
        const faceRef = storage.ref(`promoters/${emailLower}/face_${Date.now()}.jpg`);
        await faceRef.put(data.facePhoto);
        facePhotoUrl = await faceRef.getDownloadURL();
    }

    // 3. Upload das Fotos de Look
    let bodyPhotoUrls: string[] = data.existingBodyPhotos || [];
    if (data.bodyPhotos && data.bodyPhotos.length > 0) {
      const newUrls = await Promise.all(
        data.bodyPhotos.map(async (file: File, index: number) => {
          const extension = file.name.split('.').pop() || 'jpg';
          const path = `promoters/${emailLower}/body_${Date.now()}_${index}.${extension}`;
          const fileRef = storage.ref().child(path);
          await fileRef.put(file);
          return await fileRef.getDownloadURL();
        })
      );
      bodyPhotoUrls = [...bodyPhotoUrls, ...newUrls];
    }

    // 4. Salvar no Firestore
    const promoterPayload = {
      name: data.name.trim(), 
      email: emailLower,
      whatsapp: data.whatsapp.replace(/\D/g, ''),
      instagram: data.instagram.replace('@', '').trim(),
      taxId: taxIdClean,
      address: data.address,
      dateOfBirth: data.dateOfBirth, 
      facePhotoUrl,
      bodyPhotoUrls,
      photoUrls: [facePhotoUrl, ...bodyPhotoUrls].filter(url => !!url),
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
    console.error("Erro ao salvar divulgadora:", error);
    throw new Error(error.message || "Falha ao processar cadastro no banco de dados.");
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

export const findPromotersByEmail = async (email: string): Promise<Promoter[]> => {
    const snap = await firestore.collection("promoters").where("email", "==", email.toLowerCase().trim()).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
};

export const updatePromoter = async (id: string, data: Partial<Promoter>): Promise<void> => {
  await firestore.collection('promoters').doc(id).update({
      ...data,
      statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
};

export const getPromoterById = async (id: string): Promise<Promoter | null> => {
    const doc = await firestore.collection('promoters').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as Promoter : null;
};
