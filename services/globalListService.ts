
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { GlobalList } from '../types';

const COLLECTION = 'globalLists';

export const createGlobalList = async (data: Omit<GlobalList, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await firestore.collection(COLLECTION).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
};

export const getGlobalLists = async (): Promise<GlobalList[]> => {
    const snap = await firestore.collection(COLLECTION).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GlobalList));
};

export const getGlobalListById = async (id: string): Promise<GlobalList | null> => {
    const doc = await firestore.collection(COLLECTION).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } as GlobalList : null;
};

export const updateGlobalList = async (id: string, data: Partial<GlobalList>): Promise<void> => {
    await firestore.collection(COLLECTION).doc(id).update(data);
};

export const deleteGlobalList = async (id: string): Promise<void> => {
    await firestore.collection(COLLECTION).doc(id).delete();
};
