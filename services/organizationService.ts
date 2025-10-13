import { firestore } from '../firebase/config';
import { collection, addDoc, serverTimestamp, getDocs, Timestamp } from 'firebase/firestore';
import { Organization } from '../types';

/**
 * Creates a new organization document in Firestore.
 * @param ownerUid The UID of the user who owns this organization.
 * @param ownerEmail The email of the owner.
 * @param orgName The name for the new organization.
 * @param planId The ID of the subscribed plan.
 * @returns The ID of the newly created organization.
 */
export const createOrganization = async (ownerUid: string, ownerEmail: string, orgName: string, planId: 'basic' | 'professional'): Promise<string> => {
    try {
        const expires = new Date();
        expires.setDate(expires.getDate() + 30); // Subscription active for 30 days

        const docRef = await addDoc(collection(firestore, 'organizations'), {
            name: orgName,
            ownerUid: ownerUid,
            ownerEmail: ownerEmail,
            createdAt: serverTimestamp(),
            planId: planId,
            subscriptionStatus: 'active',
            subscriptionExpiresAt: Timestamp.fromDate(expires),
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating organization: ", error);
        throw new Error("Failed to create organization document.");
    }
};

/**
 * Fetches all organization documents from Firestore.
 * Used for the public homepage and Super Admin dashboard.
 * @returns An array of Organization objects.
 */
export const getOrganizations = async (): Promise<Organization[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, 'organizations'));
        const orgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
        // Sort by creation date, newest first
        orgs.sort((a, b) => {
            const timeA = (a.createdAt as Timestamp)?.toDate?.().getTime() || 0;
            const timeB = (b.createdAt as Timestamp)?.toDate?.().getTime() || 0;
            return timeB - timeA;
        });
        return orgs;
    } catch (error) {
        console.error("Error fetching organizations:", error);
        throw new Error("Failed to fetch organizations.");
    }
};