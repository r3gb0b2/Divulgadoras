import { firestore, auth } from '../firebase/config';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { AdminUserData, AdminApplication } from '../types';
import { createOrganization } from './organizationService';

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
            return {
                uid,
                email: data.email,
                role: data.role,
                assignedStates: data.assignedStates || [],
                assignedCampaigns: data.assignedCampaigns || {},
                organizationId: data.organizationId,
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
 * Can be filtered by organizationId.
 * @returns An array of AdminUserData objects.
 */
export const getAllAdmins = async (organizationId?: string): Promise<AdminUserData[]> => {
    try {
        let q = query(collection(firestore, 'admins'));
        if (organizationId) {
            q = query(q, where("organizationId", "==", organizationId));
        }
        const querySnapshot = await getDocs(q);
        const admins: AdminUserData[] = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            admins.push({
                uid: doc.id,
                email: data.email,
                role: data.role,
                assignedStates: data.assignedStates || [],
                assignedCampaigns: data.assignedCampaigns || {},
                organizationId: data.organizationId,
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
 * @param uid The UID of the user to grant/update permissions.
 * @param data The permission data (email, role, assignedStates, organizationId).
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

// --- New Organization Sign Up Flow ---

export const signUpAndCreateOrganization = async (email: string, password: string, orgName: string): Promise<void> => {
    try {
        const normalizedEmail = email.toLowerCase().trim();
        
        // 1. Create the user in Firebase Auth first
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const { uid } = userCredential.user;

        // 2. Create the organization document
        const newOrgId = await createOrganization(uid, normalizedEmail, orgName);

        // 3. Create the admin user document and link it to the organization
        const adminData: Omit<AdminUserData, 'uid'> = {
            email: normalizedEmail,
            role: 'admin', // Owner of the org is an 'admin'
            assignedStates: [], // Initially no states, they need to configure this
            assignedCampaigns: {},
            organizationId: newOrgId,
        };
        await setAdminUserData(uid, adminData);

    } catch (error: any) {
        console.error("Error during sign up: ", error);
        if (error.code === 'auth/email-already-in-use') {
            throw new Error("Este e-mail já está cadastrado.");
        }
        if (error.code === 'auth/weak-password') {
            throw new Error("A senha deve ter pelo menos 6 caracteres.");
        }
        // Clean up Auth user if org/admin creation fails? (Advanced topic)
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível concluir o cadastro da organização.");
    }
};
