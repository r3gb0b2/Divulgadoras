import { firestore } from '../firebase/config';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Organization } from '../types';

/**
 * Creates a new organization document in Firestore.
 * @param ownerUid The UID of the user who owns this organization.
 * @param ownerEmail The email of the owner.
 * @param orgName The name for the new organization.
 * @returns The ID of the newly created organization.
 */
export const createOrganization = async (ownerUid: string, ownerEmail: string, orgName: string): Promise<string> => {
    try {
        const docRef = await addDoc(collection(firestore, 'organizations'), {
            name: orgName,
            ownerUid: ownerUid,
            ownerEmail: ownerEmail,
            createdAt: serverTimestamp(),
            // Future fields: plan, subscriptionStatus, etc.
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating organization: ", error);
        throw new Error("Failed to create organization document.");
    }
};

/**
 * Fetches all organization documents from Firestore.
 * Used for the public homepage to list available organizations.
 * @returns An array of Organization objects.
 */
export const getOrganizations = async (): Promise<Organization[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, 'organizations'));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
    } catch (error) {
        console.error("Error fetching organizations:", error);
        throw new Error("Failed to fetch organizations.");
    }
};
