import { firestore } from '../firebase/config';
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, setDoc, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { Organization } from '../types';

/**
 * Creates a new organization document in Firestore.
 * @param ownerUid UID of the user who owns this organization.
 * @param ownerEmail Email of the user.
 * @param orgName The name of the organization.
 * @param planId The subscription plan ID.
 * @returns The ID of the newly created organization document.
 */
export const createOrganization = async (ownerUid: string, ownerEmail: string, orgName: string, planId: 'basic' | 'professional'): Promise<string> => {
    try {
        const docRef = await addDoc(collection(firestore, 'organizations'), {
            ownerUid,
            ownerEmail,
            name: orgName,
            planId,
            createdAt: serverTimestamp(),
            status: 'active',
            isPublic: true,
            assignedStates: [],
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating organization: ", error);
        throw new Error("Failed to create organization.");
    }
};

/**
 * Fetches all organization documents from Firestore for the admin panel.
 * @returns An array of Organization objects.
 */
export const getOrganizations = async (): Promise<Organization[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, 'organizations'));
        const orgs: Organization[] = [];
        querySnapshot.forEach(doc => {
            orgs.push({ id: doc.id, ...doc.data() } as Organization);
        });
        return orgs.sort((a,b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error getting organizations: ", error);
        throw new Error("Failed to fetch organizations.");
    }
};

/**
 * Fetches only active and public organizations for the public home page.
 * @returns An array of Organization objects.
 */
export const getPublicOrganizations = async (): Promise<Organization[]> => {
    try {
        // Fetch ALL organizations to avoid any index-related issues.
        const querySnapshot = await getDocs(collection(firestore, "organizations"));
        const orgs: Organization[] = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            // Filter for both status and isPublic on the client-side.
            // This is less efficient but guarantees the query won't fail due to missing indexes.
            if (data.status === 'active' && data.isPublic === true) {
                orgs.push({ id: doc.id, ...data } as Organization);
            }
        });
        return orgs.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error getting public organizations: ", error);
        throw new Error("Failed to fetch public organizations.");
    }
};


/**
 * Fetches a single organization by its ID.
 * @param organizationId The ID of the organization to fetch.
 * @returns The Organization object or null if not found.
 */
export const getOrganization = async (organizationId: string): Promise<Organization | null> => {
    try {
        const docRef = doc(firestore, 'organizations', organizationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Organization;
        }
        return null;
    } catch (error) {
        console.error("Error getting organization: ", error);
        throw new Error("Failed to fetch organization details.");
    }
};

/**
 * Updates an organization's data.
 * @param id The organization document ID.
 * @param data The partial data to update.
 */
export const updateOrganization = async (id: string, data: Partial<Omit<Organization, 'id'>>): Promise<void> => {
    try {
        await setDoc(doc(firestore, 'organizations', id), data, { merge: true });
    } catch (error) {
        console.error("Error updating organization: ", error);
        throw new Error("Failed to update organization details.");
    }
};

/**
 * Deletes an organization and all associated admin permission documents.
 * NOTE: This does not delete Firebase Auth users, promoters, or campaigns, which become orphaned.
 * @param orgId The ID of the organization to delete.
 */
export const deleteOrganizationAndRelatedAdmins = async (orgId: string): Promise<void> => {
    try {
        const batch = writeBatch(firestore);

        // 1. Find and mark for deletion all admins associated with the organization
        const adminsQuery = query(collection(firestore, 'admins'), where('organizationId', '==', orgId));
        const adminsSnapshot = await getDocs(adminsQuery);
        adminsSnapshot.forEach(adminDoc => {
            batch.delete(adminDoc.ref);
        });

        // 2. Mark the organization document for deletion
        const orgDocRef = doc(firestore, 'organizations', orgId);
        batch.delete(orgDocRef);
        
        // 3. Commit the batch
        await batch.commit();
        
    } catch (error) {
        console.error("Error deleting organization and related admins: ", error);
        throw new Error("Failed to delete organization. Please try again.");
    }
};