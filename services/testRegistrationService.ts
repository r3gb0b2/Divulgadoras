
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { AppleTestRegistrant } from '../types';

const COLLECTION = 'appleTestRegistrants';

/**
 * Registra um novo interessado no teste beta do iOS.
 */
export const registerForAppleTest = async (data: Omit<AppleTestRegistrant, 'id' | 'createdAt'>): Promise<void> => {
  try {
    await firestore.collection(COLLECTION).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Error registering for Apple test:", error);
    throw new Error("Não foi possível realizar a inscrição para o teste beta.");
  }
};

/**
 * Busca todos os inscritos para o teste Apple, opcionalmente filtrados por organização.
 */
export const getAppleTestRegistrants = async (organizationId?: string): Promise<AppleTestRegistrant[]> => {
  try {
    let q: firebase.firestore.Query = firestore.collection(COLLECTION);
    if (organizationId && organizationId !== 'sistema-global') {
      q = q.where('organizationId', '==', organizationId);
    }
    const snapshot = await q.get();
    const registrants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppleTestRegistrant));
    
    // Ordenar por data decrescente
    registrants.sort((a, b) => {
      const timeA = (a.createdAt as any)?.seconds || 0;
      const timeB = (b.createdAt as any)?.seconds || 0;
      return timeB - timeA;
    });
    
    return registrants;
  } catch (error) {
    console.error("Error fetching registrants:", error);
    throw new Error("Falha ao buscar lista de inscritos.");
  }
};

/**
 * Remove um inscrito da lista de testes.
 */
export const deleteAppleTestRegistrant = async (id: string): Promise<void> => {
    try {
        await firestore.collection(COLLECTION).doc(id).delete();
    } catch (error) {
        console.error("Error deleting registrant:", error);
        throw new Error("Erro ao deletar o registro.");
    }
};
