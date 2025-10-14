import { firestore, auth } from '../firebase/config';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, addDoc, serverTimestamp, Timestamp, runTransaction } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { AdminUserData, AdminApplication, OrganizationStatus, PlanId } from '../types';
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

export const signUpAndCreateOrganization = async (email: string, password: string, orgName: string, planId: 'basic' | 'professional'): Promise<void> => {
    try {
        const normalizedEmail = email.toLowerCase().trim();
        
        // 1. Create the user in Firebase Auth first
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const { uid } = userCredential.user;

        // 2. Create the organization document
        const newOrgId = await createOrganization(uid, normalizedEmail, orgName, planId);

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

// --- Admin Application for SuperAdmin Approval ---

/**
 * Creates an Auth user and submits an application for a new admin/organization.
 * @param applicationData The data from the application form.
 * @param password The user's chosen password.
 */
export const submitAdminApplication = async (applicationData: Omit<AdminApplication, 'id' | 'status' | 'createdAt' | 'uid'>, password: string): Promise<void> => {
    try {
        const normalizedEmail = applicationData.email.toLowerCase().trim();
        // Check for existing application with the same email
        const q = query(collection(firestore, "adminApplications"), where("email", "==", normalizedEmail));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            throw new Error("Já existe uma solicitação de acesso para este e-mail. Aguarde o contato da nossa equipe.");
        }

        // IMPORTANT: We create the user in Auth immediately. This can fail if email is already in use by another admin.
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const { uid } = userCredential.user;

        // Sign out immediately so they don't get logged in and redirected.
        await signOut(auth);

        const dataToSave = {
            ...applicationData,
            uid,
            email: normalizedEmail,
            status: 'pending' as const,
            createdAt: serverTimestamp(),
        };
        await addDoc(collection(firestore, 'adminApplications'), dataToSave);
    } catch (error: any) {
        console.error("Error submitting admin application: ", error);
        if (error.code === 'auth/email-already-in-use') {
            throw new Error("Este e-mail já está em uso por outro administrador. Por favor, use um e-mail diferente ou faça login.");
        }
        if (error.code === 'auth/weak-password') {
            throw new Error("A senha deve ter pelo menos 6 caracteres.");
        }
        if (error instanceof Error) throw error;
        throw new Error("Não foi possível enviar sua solicitação. Tente novamente.");
    }
};

/**
 * Approves an admin application by creating an organization and admin permissions.
 * @param application The application object to approve.
 */
export const acceptAdminApplication = async (application: AdminApplication): Promise<void> => {
    try {
        // Use a Firestore transaction to ensure all or no writes are committed.
        await runTransaction(firestore, async (transaction) => {
            // 1. Define the new organization document reference and data
            const newOrgRef = doc(collection(firestore, 'organizations'));
            const trialEndDate = new Date();
            trialEndDate.setDate(trialEndDate.getDate() + 3); // 3-day trial

            const newOrgData = {
                name: application.orgName,
                ownerUid: application.uid,
                ownerEmail: application.email,
                status: 'trial' as OrganizationStatus,
                planId: 'basic' as PlanId,
                createdAt: Timestamp.now(), // Use client-side timestamp in transactions
                planExpiresAt: Timestamp.fromDate(trialEndDate),
                assignedStates: [],
                public: true,
            };
            
            // 2. Define the admin user document reference and data
            const adminDocRef = doc(firestore, 'admins', application.uid);
            const adminData: Omit<AdminUserData, 'uid'> = {
                email: application.email,
                role: 'admin',
                assignedStates: [],
                assignedCampaigns: {},
                organizationId: newOrgRef.id,
            };

            // 3. Define the application document reference to be deleted
            const appDocRef = doc(firestore, 'adminApplications', application.id);

            // 4. Perform all writes within the transaction
            transaction.set(newOrgRef, newOrgData);
            transaction.set(adminDocRef, adminData);
            transaction.delete(appDocRef);
        });
    } catch (error) {
        console.error("Error accepting admin application:", error);
        // The new error message reflects that the operation is atomic.
        throw new Error("Falha ao aprovar a solicitação. A operação falhou e foi revertida. Verifique os logs e tente novamente.");
    }
};

/**
 * Fetches all pending admin applications. For superadmins only.
 * @returns An array of AdminApplication objects.
 */
export const getAdminApplications = async (): Promise<AdminApplication[]> => {
    try {
        const q = query(
            collection(firestore, "adminApplications"), 
            where("status", "==", "pending")
        );
        const querySnapshot = await getDocs(q);
        const applications = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminApplication));

        // Sort client-side to avoid needing a composite index
        applications.sort((a, b) => {
            const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
            const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
            return timeB - timeA; // Descending
        });

        return applications;
    } catch (error) {
        console.error("Error getting admin applications:", error);
        throw new Error("Failed to fetch admin applications.");
    }
};

/**
 * Deletes an admin application document from Firestore.
 * @param id The ID of the application to delete.
 */
export const deleteAdminApplication = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, "adminApplications", id));
    } catch (error) {
        console.error("Error deleting admin application:", error);
        throw new Error("Failed to delete admin application.");
    }
};