import { firestore } from '../firebase/config';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { AdminUserData } from '../types';

/**
 * Fetches the permission data for a specific admin user from Firestore.
 * @param uid The Firebase Auth UID of the user.
 * @returns AdminUserData object or null if not found.
 */
export const getAdminUserData = async (uid: string): Promise<AdminUserData | null> => {
    try {
        const adminDocRef = doc(firestore, 'admins', uid);
        const docSnap = await getDoc(adminDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const assignedStates = Array.isArray(data.assignedStates) ? data.assignedStates : [];
            const assignedCampaigns = typeof data.assignedCampaigns === 'object' && data.assignedCampaigns !== null ? data.assignedCampaigns : {};
            return {
                uid,
                email: data.email,
                role: data.role,
                assignedStates: assignedStates,
                assignedCampaigns: assignedCampaigns,
            } as AdminUserData;
        }
        return null;
    } catch (error) {
        console.error("Error fetching admin user data:", error);
        throw new Error("Failed to fetch admin user data.");
    }
};

/**
 * Fetches all admin users' permission data from Firestore.
 * For use in the user management panel.
 * @returns An array of AdminUserData objects.
 */
export const getAllAdmins = async (): Promise<AdminUserData[]> => {
    try {
        const adminsCollectionRef = collection(firestore, 'admins');
        const querySnapshot = await getDocs(adminsCollectionRef);
        const admins: AdminUserData[] = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const assignedStates = Array.isArray(data.assignedStates) ? data.assignedStates : [];
            const assignedCampaigns = typeof data.assignedCampaigns === 'object' && data.assignedCampaigns !== null ? data.assignedCampaigns : {};
            admins.push({
                uid: doc.id,
                email: data.email,
                role: data.role,
                assignedStates: assignedStates,
                assignedCampaigns: assignedCampaigns,
            } as AdminUserData);
        });
        return admins;
    } catch (error) {
        console.error("Error getting all admins:", error);
        throw new Error("Failed to fetch admin list.");
    }
}

/**
 * Creates or updates an admin user's permission document in Firestore.
 * The corresponding user MUST already exist in Firebase Authentication.
 * This function only manages the permissions, not the Auth user itself.
 * @param uid The UID of the user to grant/update permissions.
 * @param data The permission data (email, role, assignedStates).
 */
export const setAdminUserData = async (uid: string, data: Omit<AdminUserData, 'uid'>): Promise<void> => {
    try {
        const adminDocRef = doc(firestore, 'admins', uid);
        await setDoc(adminDocRef, data);
    } catch (error) {
        console.error("Error setting admin user data:", error);
        throw new Error("Failed to save admin user data.");
    }
};


/**
 * Deletes an admin user's permission document from Firestore.
 * This effectively revokes their admin access to the panel.
 * @param uid The UID of the admin user to delete.
 */
export const deleteAdminUser = async (uid: string): Promise<void> => {
    try {
        const adminDocRef = doc(firestore, 'admins', uid);
        await deleteDoc(adminDocRef);
    } catch (error) {
        console.error("Error deleting admin user:", error);
        throw new Error("Failed to delete admin user.");
    }
};
