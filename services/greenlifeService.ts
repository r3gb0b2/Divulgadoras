
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { VipEvent, VipMembership } from '../types';

const COLLECTION_EVENTS = 'greenlifeEvents';
const COLLECTION_MEMBERSHIPS = 'greenlifeMemberships';

export const getActiveGreenlifeEvents = async (): Promise<VipEvent[]> => {
    const snap = await firestore.collection(COLLECTION_EVENTS).where('isActive', '==', true).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipEvent));
};

export const getAllGreenlifeEvents = async (): Promise<VipEvent[]> => {
    const snap = await firestore.collection(COLLECTION_EVENTS).orderBy('createdAt', 'desc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipEvent));
};

export const addGreenlifeCodes = async (eventId: string, codes: string[]) => {
    const batch = firestore.batch();
    const codesRef = firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes');
    codes.forEach(code => {
        const trimmed = code.trim();
        if (trimmed) {
            batch.set(codesRef.doc(trimmed), {
                code: trimmed,
                used: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    return batch.commit();
};

export const getGreenlifeCodeStats = async (eventId: string) => {
    const snap = await firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes')
        .where('used', '==', false).get();
    return snap.size;
};

export const getGreenlifeEventCodes = async (eventId: string) => {
    const snap = await firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes')
        .orderBy('createdAt', 'desc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const createGreenlifeEvent = async (data: Omit<VipEvent, 'id' | 'createdAt'>): Promise<string> => {
    const docRef = await firestore.collection(COLLECTION_EVENTS).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
};

export const updateGreenlifeEvent = async (id: string, data: Partial<VipEvent>) => {
    return firestore.collection(COLLECTION_EVENTS).doc(id).update(data);
};

export const deleteGreenlifeEvent = async (id: string) => {
    return firestore.collection(COLLECTION_EVENTS).doc(id).delete();
};

export const checkGreenlifeMembership = async (email: string, eventId: string): Promise<VipMembership | null> => {
    const snap = await firestore.collection(COLLECTION_MEMBERSHIPS)
        .where('promoterEmail', '==', email.toLowerCase().trim())
        .where('vipEventId', '==', eventId)
        .limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as VipMembership;
};

export const getAllGreenlifeMemberships = async (eventId?: string) => {
    let query: firebase.firestore.Query = firestore.collection(COLLECTION_MEMBERSHIPS);
    if (eventId && eventId !== 'all') query = query.where('vipEventId', '==', eventId);
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipMembership))
        .sort((a, b) => (b.submittedAt as any).seconds - (a.submittedAt as any).seconds);
};

export const refundGreenlifeMembership = async (id: string) => {
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(id).update({
        status: 'refunded',
        isBenefitActive: false,
        refundedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};
