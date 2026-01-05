
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { VipEvent, VipMembership } from '../types';
import { httpsCallable } from 'firebase/functions';

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

/**
 * Registra a visualização ou download do ingresso pelo cliente
 */
export const trackVipTicketAction = async (membershipId: string, action: 'view' | 'download') => {
    const field = action === 'view' ? 'viewedAt' : 'downloadedAt';
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(membershipId).update({
        [field]: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const addVipCodes = async (eventId: string, codes: string[]) => {
    const batch = firestore.batch();
    const codesRef = firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes');
    
    codes.forEach(code => {
        const trimmed = code.trim();
        if (trimmed) {
            const docRef = codesRef.doc(trimmed);
            batch.set(docRef, {
                code: trimmed,
                used: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    
    return batch.commit();
};

export const getVipEventCodes = async (eventId: string) => {
    const snap = await firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes')
        .orderBy('createdAt', 'desc')
        .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getVipCodeStats = async (eventId: string) => {
    const snap = await firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes')
        .where('used', '==', false)
        .get();
    return snap.size;
};

export const createVipEvent = async (data: Omit<VipEvent, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await firestore.collection(COLLECTION_EVENTS).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
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
    let query: firebase.firestore.Query = firestore.collection(COLLECTION_MEMBERSHIPS);
    if (vipEventId && vipEventId !== 'all') {
        query = query.where('vipEventId', '==', vipEventId);
    }
    const snap = await query.get();
    const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipMembership));
    results.sort((a, b) => {
        const getTime = (ts: any) => {
            if (!ts) return 0;
            if (ts.toMillis) return ts.toMillis();
            if (ts.seconds) return ts.seconds * 1000;
            return new Date(ts).getTime() || 0;
        };
        return getTime(b.submittedAt) - getTime(a.submittedAt);
    });
    return results;
};

export const updateVipMembership = async (id: string, data: Partial<VipMembership>) => {
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(id).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const refundVipMembership = async (membershipId: string) => {
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(membershipId).update({
        status: 'refunded',
        isBenefitActive: false,
        refundedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};
