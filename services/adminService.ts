
import { firestore, auth, functions } from '../firebase/config';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';
import { AdminUserData, AdminApplication, Organization } from '../types';
import { httpsCallable } from 'firebase/functions';

/**
 * Fetches admin user data from Firestore by UID.
 */
export const getAdminUserData = async (uid: string): Promise<AdminUserData | null> => {
    const docRef = doc(firestore, 'admins', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { uid, ...docSnap.data() } as AdminUserData;
    }
    return null;
};

/**
 * Sets/updates admin user data in Firestore.
 */
export const setAdminUserData = async (uid: string, data: Omit<AdminUserData, 'uid'>): Promise<void> => {
    const docRef = doc(firestore, 'admins', uid);
    await setDoc(docRef, data, { merge: true });
};

/**
 * Fetches all admin users.
 * If organizationId is provided, filters admins for that organization.
 */
export const getAllAdmins = async (organizationId?: string): Promise<AdminUserData[]> => {
    try {
        let q = query(collection(firestore, "admins"));
        if (organizationId) {
            q = query(q, where("organizationId", "==", organizationId));
        }
        const querySnapshot = await getDocs(q);
        const admins: AdminUserData[] = [];
        querySnapshot.forEach(doc => {
            admins.push({ uid: doc.id, ...doc.data() } as AdminUserData);
        });
        return admins;
    } catch (error) {
        console.error("Error getting all admins: ", error);
        throw new Error("Não foi possível buscar os administradores.");
    }
};

/**
 * Deletes an admin user's permissions document. This does not delete their auth record.
 */
export const deleteAdminUser = async (uid: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, "admins", uid));
    } catch (error) {
        console.error("Error deleting admin user: ", error);
        throw new Error("Não foi possível remover as permissões do administrador.");
    }
};


// --- Admin Application Service Functions ---

/**
 * Submits an application to become an admin.
 * This is handled by a Firebase Function to securely create the auth user.
 */
export const submitAdminApplication = async (applicationData: Omit<AdminApplication, 'id' | 'createdAt'>, password: string): Promise<void> => {
    try {
        const createAdminRequest = httpsCallable(functions, 'createAdminRequest');
        await createAdminRequest({ ...applicationData, password });
    } catch (error: any) {
        console.error("Error submitting admin application: ", error);
        const detail = error.details?.message || error.message;
        throw new Error(`Falha ao enviar solicitação: ${detail}`);
    }
};

/**
 * Fetches all pending admin applications.
 */
export const getAdminApplications = async (): Promise<AdminApplication[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, "adminApplications"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminApplication));
    } catch (error) {
        console.error("Error getting admin applications: ", error);
        throw new Error("Não foi possível buscar as solicitações de acesso.");
    }
};

/**
 * Accepts an admin application.
 * This function will create the admin document and delete the application document.
 */
export const acceptAdminApplication = async (application: AdminApplication, organizationId: string): Promise<void> => {
    if (!application.id) throw new Error("ID da solicitação não encontrado.");

    const batch = writeBatch(firestore);

    // 1. Reference to the application to be deleted
    const appDocRef = doc(firestore, "adminApplications", application.id);

    // 2. Reference to the future admin doc (ID is the UID stored in the application doc)
    const adminDocRef = doc(firestore, "admins", application.id);

    // 3. Data for the new admin
    const newAdminData: Omit<AdminUserData, 'uid'> = {
        email: application.email,
        role: 'admin',
        organizationId: organizationId,
        assignedStates: [],
        assignedCampaigns: {}
    };

    batch.set(adminDocRef, newAdminData);
    batch.delete(appDocRef);

    try {
        await batch.commit();
    } catch (error) {
        console.error("Error accepting admin application:", error);
        throw new Error("Falha ao aprovar a solicitação.");
    }
};

/**
 * Deletes an admin application document.
 */
export const deleteAdminApplication = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, "adminApplications", id));
    } catch (error) {
        console.error("Error deleting admin application: ", error);
        throw new Error("Não foi possível deletar a solicitação de acesso.");
    }
};
