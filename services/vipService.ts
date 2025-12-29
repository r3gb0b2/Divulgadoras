
import firebase from 'firebase/compat/app';
import { firestore, storage } from '../firebase/config';
import { VipEvent, VipMembership } from '../types';

const COLLECTION_EVENTS = 'vipEvents';
const COLLECTION_MEMBERSHIPS = 'vipMemberships';

export const getActiveVipEvents = async (): Promise<VipEvent[]> => {
    const snap = await firestore.collection(COLLECTION_EVENTS).where('isActive', '==', true).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipEvent));
};

export const getAllVipEvents = async (): Promise<VipEvent[]> => {
    const snap = await firestore.collection(COLLECTION_EVENTS).orderBy('createdAt', 'desc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipEvent));
};

export const createVipEvent = async (data: Omit<VipEvent, 'id' | 'createdAt'>) => {
    return firestore.collection(COLLECTION_EVENTS).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const updateVipEvent = async (id: string, data: Partial<VipEvent>) => {
    return firestore.collection(COLLECTION_EVENTS).doc(id).update(data);
};

export const deleteVipEvent = async (id: string) => {
    return firestore.collection(COLLECTION_EVENTS).doc(id).delete();
};

export const checkVipMembership = async (email: string, vipEventId: string): Promise<VipMembership | null> => {
    const snap = await firestore.collection(COLLECTION_MEMBERSHIPS)
        .where('promoterEmail', '==', email.toLowerCase().trim())
        .where('vipEventId', '==', vipEventId)
        .limit(1)
        .get();
    
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as VipMembership;
};

export const getAllVipMemberships = async (vipEventId?: string) => {
    let query = firestore.collection(COLLECTION_MEMBERSHIPS);
    
    if (vipEventId && vipEventId !== 'all') {
        query = query.where('vipEventId', '==', vipEventId);
    }
    
    // Nota: Requer índice no Firebase se ordenar por submittedAt com filtro de ID
    const snap = await query.get();
    const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipMembership));
    
    // Ordenação em memória para evitar erros de índice ausente durante a migração
    results.sort((a, b) => {
        const timeA = (a.submittedAt as any)?.seconds || 0;
        const timeB = (b.submittedAt as any)?.seconds || 0;
        return timeB - timeA;
    });
    
    return results;
};

export const updateVipMembership = async (id: string, data: Partial<VipMembership>) => {
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(id).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};
