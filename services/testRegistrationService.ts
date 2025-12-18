
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { AppleTestRegistrant } from '../types';

const COLLECTION = 'appleTestRegistrants';

export const registerForAppleTest = async (data: Omit<AppleTestRegistrant, 'id' | 'createdAt'>): Promise<void> => {
  try {
    await firestore.collection(COLLECTION).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error registering for Apple test:", error);
    throw new Error("Não foi possível realizar a inscrição.");
  }
};

export const getAppleTestRegistrants = async (organizationId?: string): Promise<AppleTestRegistrant[]> => {
  try {
    let q: firebase.firestore.Query = firestore.collection(COLLECTION);
    if (organizationId) {
      q = q.where('organizationId', '==', organizationId);
    }
    const snapshot = await q.get();
    const registrants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppleTestRegistrant));
    
    // Sort by date descending
    registrants.sort((a, b) => {
      const timeA = (a.createdAt as any)?.seconds || 0;
      const timeB = (b.createdAt as any)?.seconds || 0;
      return timeB - timeA;
    });
    
    return registrants;
  } catch (error) {
    console.error("Error fetching registrants:", error);
    throw new Error("Falha ao buscar inscritos.");
  }
};

export const deleteAppleTestRegistrant = async (id: string): Promise<void> => {
    try {
        await firestore.collection(COLLECTION).doc(id).delete();
    } catch (error) {
        throw new Error("Erro ao deletar.");
    }
};
