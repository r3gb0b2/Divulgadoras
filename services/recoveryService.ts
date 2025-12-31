
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { RecoveryTemplate } from '../types';

const COLLECTION = 'recoveryTemplates';

export const getRecoveryTemplates = async (organizationId: string): Promise<RecoveryTemplate[]> => {
    try {
        const q = firestore.collection(COLLECTION).where('organizationId', '==', organizationId);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecoveryTemplate));
    } catch (e) {
        console.error("Error fetching recovery templates:", e);
        return [];
    }
};

export const saveRecoveryTemplate = async (organizationId: string, data: Partial<RecoveryTemplate>): Promise<void> => {
    if (data.id) {
        await firestore.collection(COLLECTION).doc(data.id).update(data);
    } else {
        await firestore.collection(COLLECTION).add({
            ...data,
            organizationId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
};

export const deleteRecoveryTemplate = async (id: string): Promise<void> => {
    await firestore.collection(COLLECTION).doc(id).delete();
};
