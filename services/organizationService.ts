import firebase from '../firebase/config';
import { firestore } from '../firebase/config';
import { Organization } from '../types';
import { Timestamp } from 'firebase/firestore';

/**
 * Fetches all organizations.
 */
export const getOrganizations = async (): Promise<Organization[]> => {
    try {
        const querySnapshot = await firestore.collection("organizations").get();
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
    } catch (error) {
        console.error("Error getting organizations: ", error);
        throw new Error("Não foi possível buscar as organizações.");
    }
};

/**
 * Fetches only organizations marked as public and not expired.
 */
export const getPublicOrganizations = async (): Promise<Organization[]> => {
    try {
        const q = firestore.collection("organizations").where("public", "==", true).where("status", "in", ["active", "trial"]);
        const querySnapshot = await q.get();
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
    } catch (error) {
        console.error("Error getting public organizations: ", error);
        throw new Error("Não foi possível buscar as organizações públicas.");
    }
};

/**
 * Fetches a single organization by its ID.
 */
export const getOrganization = async (id: string): Promise<Organization | null> => {
    try {
        const docRef = firestore.collection('organizations').doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return { id: docSnap.id, ...docSnap.data() } as Organization;
        }
        return null;
    } catch (error) {
        console.error("Error getting organization: ", error);
        throw new Error("Não foi possível buscar a organização.");
    }
};

/**
 * Creates a new organization document in Firestore.
 */
export const createOrganization = async (orgId: string, data: Omit<Organization, 'id' | 'createdAt'>): Promise<void> => {
    try {
        const orgDoc = firestore.collection('organizations').doc(orgId);
        await orgDoc.set({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (error) {
        console.error("Error creating organization: ", error);
        throw new Error("Não foi possível criar a organização.");
    }
};

/**
 * Updates an existing organization.
 */
export const updateOrganization = async (id: string, data: Partial<Omit<Organization, 'id'>>): Promise<void> => {
    try {
        const orgDoc = firestore.collection('organizations').doc(id);
        await orgDoc.update(data);
    } catch (error) {
        console.error("Error updating organization: ", error);
        throw new Error("Não foi possível atualizar a organização.");
    }
};

/**
 * Deletes an organization.
 */
export const deleteOrganization = async (id: string): Promise<void> => {
    try {
        await firestore.collection("organizations").doc(id).delete();
    } catch (error) {
        console.error("Error deleting organization: ", error);
        throw new Error("Não foi possível deletar a organização.");
    }
};