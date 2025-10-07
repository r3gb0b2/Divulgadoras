import { Promoter } from '../types';
import { firestore, storage } from '../firebase/config';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';


export const getPromoters = async (): Promise<Promoter[]> => {
  try {
    const promotersCollection = collection(firestore, 'promoters');
    const q = query(promotersCollection, orderBy('submissionDate', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const promoters: Promoter[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      promoters.push({
        id: doc.id,
        name: data.name,
        whatsapp: data.whatsapp,
        email: data.email,
        instagram: data.instagram,
        tiktok: data.tiktok,
        age: data.age,
        photo: data.photo,
        submissionDate: data.submissionDate.toDate().toISOString(),
      });
    });
    return promoters;
  } catch (error) {
    console.error("Failed to fetch promoters from Firestore", error);
    return []; // Return empty array on error to prevent app crash
  }
};

interface PromoterDataWithPhoto extends Omit<Promoter, 'id' | 'submissionDate' | 'photo'> {
    // FIX: Changed type from Blob to File, as File contains the 'name' property needed for storage upload.
    photo: File;
}

export const addPromoter = async (promoterData: PromoterDataWithPhoto): Promise<void> => {
    try {
        // 1. Upload image to Firebase Storage
        const photoFile = promoterData.photo;
        const storageRef = ref(storage, `promoter_photos/${Date.now()}_${photoFile.name}`);
        const snapshot = await uploadBytes(storageRef, photoFile);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // 2. Prepare data for Firestore
        const { photo, ...promoterInfo } = promoterData;
        const docData = {
            ...promoterInfo,
            photo: downloadURL, // Save the image URL, not the file itself
            submissionDate: serverTimestamp(),
        };

        // 3. Add promoter document to Firestore
        const promotersCollection = collection(firestore, 'promoters');
        await addDoc(promotersCollection, docData);

    } catch (error) {
        console.error("Failed to add promoter to Firestore:", error);
        throw new Error(`Failed to save promoter data.`);
    }
};