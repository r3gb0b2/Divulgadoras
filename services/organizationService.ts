import { firestore } from '../firebase/config';
import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { Organization, OrganizationStatus, PlanId } from '../types';

const ORGS_COLLECTION = 'organizations';

/**
 * Creates a new organization document in Firestore.
 * @param ownerUid - The Firebase Auth UID of the organization's owner.
 * @param ownerEmail - The email of the organization's owner.
 * @param orgName - The name of the new organization.
 * @param planId - The ID of the subscription plan ('basic' or 'professional').
 * @returns The ID of the newly created organization document.
 */
export const createOrganization = async (ownerUid: string, ownerEmail: string, orgName: string, planId: PlanId): Promise<string> => {
    try {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 3); // 3-day trial

        const newOrgData = {
            name: orgName,
            ownerUid,
            ownerEmail,
            status: 'trial' as OrganizationStatus,
            planId,
            createdAt: serverTimestamp(),
            planExpiresAt: Timestamp.fromDate(trialEndDate),
            assignedStates: [], // Admin must configure this later
            public: true, // Public by default,
        };
        const docRef = await addDoc(collection(firestore, ORGS_COLLECTION), newOrgData);
        return docRef.id;
    } catch (error) {
        console.error("Error creating organization: ", error);
        throw new Error("Não foi possível criar a organização.");
    }
};

/**
 * Fetches a single organization's data from Firestore.
 * @param id - The document ID of the organization.
 * @returns The Organization object or null if not found.
 */
export const getOrganization = async (id: string): Promise<Organization | null> => {
    try {
        const docRef = doc(firestore, ORGS_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Organization;
        }
        return null;
    } catch (error) {
        console.error("Error getting organization: ", error);
        throw new Error("Não foi possível buscar os dados da organização.");
    }
};

/**
 * Fetches all organizations from Firestore.
 * @returns An array of all Organization objects.
 */
export const getOrganizations = async (): Promise<Organization[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, ORGS_COLLECTION));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
    } catch (error) {
        console.error("Error getting all organizations: ", error);
        throw new Error("Não foi possível buscar a lista de organizações.");
    }
};


/**
 * Fetches all organizations that are marked as public and not expired.
 * @returns An array of Organization objects for public display.
 */
export const getPublicOrganizations = async (): Promise<Organization[]> => {
    try {
        const q = query(
            collection(firestore, ORGS_COLLECTION),
            where("public", "==", true)
        );
        const querySnapshot = await getDocs(q);
        const allPublicOrgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));

        // Client-side filter for backward compatibility with older organizations without a status field.
        const visibleOrgs = allPublicOrgs.filter(org => {
            // An org is visible if:
            // 1. It has no status (old data, assume it's active)
            // 2. Its status is explicitly 'active' or 'trial'
            return !org.status || org.status === 'active' || org.status === 'trial';
        });
        
        // Sort alphabetically
        visibleOrgs.sort((a, b) => a.name.localeCompare(b.name));

        return visibleOrgs;
    } catch (error) {
        console.error("Error getting public organizations: ", error);
        throw new Error("Não foi possível buscar as organizações públicas.");
    }
};


/**
 * Updates an existing organization document in Firestore.
 * @param id - The ID of the organization to update.
 * @param data - An object containing the fields to update.
 */
export const updateOrganization = async (id: string, data: Partial<Omit<Organization, 'id'>>): Promise<void> => {
    try {
        const orgDoc = doc(firestore, ORGS_COLLECTION, id);
        await updateDoc(orgDoc, data);
    } catch (error) {
        console.error("Error updating organization: ", error);
        throw new Error("Não foi possível atualizar a organização.");
    }
};

/**
 * Deletes an organization document from Firestore.
 * @param id - The ID of the organization to delete.
 */
export const deleteOrganization = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, ORGS_COLLECTION, id));
    } catch (error) {
        console.error("Error deleting organization: ", error);
        throw new Error("Não foi possível deletar a organização.");
    }
};