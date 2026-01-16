
import firebase from 'firebase/compat/app';
import { firestore, storage, functions } from '../firebase/config';
import { VipEvent, VipMembership } from '../types';
import { httpsCallable } from 'firebase/functions';

const COLLECTION_EVENTS = 'vipEvents';
const COLLECTION_MEMBERSHIPS = 'vipMemberships';

const getMs = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds !== undefined) return ts.seconds * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
};

export const getActiveVipEvents = async (): Promise<VipEvent[]> => {
    try {
        const snap = await firestore.collection(COLLECTION_EVENTS)
            .where('isActive', '==', true)
            .get();
        
        const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipEvent));
        return events.sort((a, b) => getMs(a.eventDate) - getMs(b.eventDate));
    } catch (e) {
        console.error("Erro ao buscar eventos VIP ativos:", e);
        return [];
    }
};

export const getAllVipEvents = async (): Promise<VipEvent[]> => {
    try {
        const snap = await firestore.collection(COLLECTION_EVENTS).get();
        const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipEvent));
        return events.sort((a, b) => getMs(a.eventDate) - getMs(b.eventDate));
    } catch (e) {
        console.error("Erro ao buscar todos os eventos VIP:", e);
        return [];
    }
};

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
            batch.set(codesRef.doc(trimmed), {
                code: trimmed,
                used: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    });
    return batch.commit();
};

export const getVipEventCodes = async (eventId: string) => {
    const snap = await firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
        .sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
};

export const getVipCodeStats = async (eventId: string) => {
    try {
        const snap = await firestore.collection(COLLECTION_EVENTS).doc(eventId).collection('availableCodes')
            .where('used', '==', false).get();
        return snap.size;
    } catch (e) {
        return 0;
    }
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
        .limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as VipMembership;
};

export const getAllVipMemberships = async (vipEventId?: string) => {
    let query: firebase.firestore.Query = firestore.collection(COLLECTION_MEMBERSHIPS);
    if (vipEventId && vipEventId !== 'all') query = query.where('vipEventId', '==', vipEventId);
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VipMembership))
        .sort((a, b) => getMs(b.submittedAt) - getMs(a.submittedAt));
};

export const updateVipMembership = async (id: string, data: Partial<VipMembership>) => {
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(id).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const refundVipMembership = async (membershipId: string) => {
    // IMPORTANTE: NÃO limpamos o benefitCode aqui para ele aparecer no XLS como BLOQUEADO
    return firestore.collection(COLLECTION_MEMBERSHIPS).doc(membershipId).update({
        status: 'refunded',
        isBenefitActive: false,
        refundedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
};

export const transferVipMembership = async (membershipId: string, newEvent: VipEvent) => {
    const batch = firestore.batch();
    const oldMembRef = firestore.collection(COLLECTION_MEMBERSHIPS).doc(membershipId);
    const oldSnap = await oldMembRef.get();
    const oldData = oldSnap.data() as VipMembership;

    // 1. Invalida o ingresso no evento atual (mantendo o código vinculado para o XLS)
    batch.update(oldMembRef, {
        status: 'refunded',
        isBenefitActive: false,
        observation: `Transferido para: ${newEvent.name}`,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Cria um novo documento de adesão no evento de destino (será ativado com novo código)
    const newMembRef = firestore.collection(COLLECTION_MEMBERSHIPS).doc();
    batch.set(newMembRef, {
        ...oldData,
        id: newMembRef.id,
        vipEventId: newEvent.id,
        vipEventName: newEvent.name,
        status: 'pending', // Fica pendente para o backend disparar a ativação (novo código)
        benefitCode: null,
        isBenefitActive: false,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return batch.commit();
};
