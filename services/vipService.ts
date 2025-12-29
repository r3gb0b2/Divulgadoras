
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

export const submitVipMembership = async (data: Omit<VipMembership, 'id' | 'submittedAt' | 'updatedAt' | 'proofUrl'>, file: File) => {
    const fileName = `vip_proofs/${data.vipEventId}_${data.promoterId}_${Date.now()}`;
    const ref = storage.ref(fileName);
    await ref.put(file);
    const proofUrl = await ref.getDownloadURL();

    const membershipData = {
        ...data,
        proofUrl,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    return firestore.collection(COLLECTION_MEMBERSHIPS).add(membershipData);
};

export const getAllVipMemberships = async (vipEventId?: string) => {
    let query = firestore.collection(COLLECTION_MEMBERSHIPS).orderBy('submittedAt', 'desc');
    if (vipEventId && vipEventId !== 'all') {
        query = query.where('vipEventId', '==', vipEventId);
    }
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipMembership));
};

export const updateVipMembership = async (id: string, data: Partial<VipMembership>) => {
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(id).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};
