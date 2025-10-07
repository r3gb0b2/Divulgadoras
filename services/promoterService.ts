
import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, where, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Promoter, PromoterApplicationData } from '../types';

export const addPromoter = async (promoterData: PromoterApplicationData): Promise<void> => {
  try {
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

    const newPromoter = {
      ...rest,
      photoUrls,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(firestore, 'promoters'), newPromoter);
  } catch (error) {
    console.error("Error adding promoter: ", error);
    throw new Error("Não foi possível enviar o cadastro. Tente novamente.");
  }
};

export const getPromoters = async (): Promise<Promoter[]> => {
  try {
    const q = query(collection(firestore, "promoters"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const promoters: Promoter[] = [];
    querySnapshot.forEach((doc) => {
      promoters.push({ id: doc.id, ...doc.data() } as Promoter);
    });
    return promoters;
  } catch (error) {
    console.error("Error getting promoters: ", error);
    throw new Error("Não foi possível buscar as divulgadoras.");
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
      // Note: This does not delete photos from storage. That would require more logic.
    } catch (error) {
      console.error("Error deleting promoter: ", error);
      throw new Error("Não foi possível deletar a divulgadora.");
    }
};

export const checkPromoterStatus = async (email: string): Promise<Promoter | null> => {
    try {
        const q = query(collection(firestore, "promoters"), where("email", "==", email.toLowerCase().trim()));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return null;
        }
        // Assuming one registration per email
        const promoterDoc = querySnapshot.docs[0];
        return { id: promoterDoc.id, ...promoterDoc.data() } as Promoter;
    } catch (error) {
        console.error("Error checking promoter status: ", error);
        throw new Error("Não foi possível verificar o status.");
    }
};
