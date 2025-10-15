
import { firestore } from '../firebase/config';
import { collection, doc, getDoc, getDocs, query, where, updateDoc, deleteDoc, Timestamp, setDoc, serverTimestamp } from 'firebase/firestore';
import { Organization } from '../types';

/**
 * Fetches all organizations.
 */
export const getOrganizations = async (): Promise<Organization[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, "organizations"));
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
        const q = query(collection(firestore, "organizations"), where("public", "==", true), where("status", "in", ["active", "trial"]));
        const querySnapshot = await getDocs(q);
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
        const docRef = doc(firestore, 'organizations', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
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
        const orgDoc = doc(firestore, 'organizations', orgId);
        await setDoc(orgDoc, { ...data, createdAt: serverTimestamp() });
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
        const orgDoc = doc(firestore, 'organizations', id);
        await updateDoc(orgDoc, data);
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
        await deleteDoc(doc(firestore, "organizations", id));
    } catch (error) {
        console.error("Error deleting organization: ", error);
        throw new Error("Não foi possível deletar a organização.");
    }
};
