// FIX: Add missing import for 'firebase' namespace to use compat types.
import firebase from '../firebase/config';
import { firestore, functions } from '../firebase/config';
import { AdminUserData, AdminApplication } from '../types';

/**
 * Calls a cloud function to create a user and an admin application request.
 * @param applicationData - The admin's personal details.
 * @param password - The password for the new admin account.
 */
export const submitAdminApplication = async (
  applicationData: Omit<AdminApplication, 'id' | 'createdAt'>,
  password: string
): Promise<void> => {
  try {
    const createAdminRequest = functions.httpsCallable('createAdminRequest');
    await createAdminRequest({ ...applicationData, password });
  } catch (error) {
    console.error('Error submitting admin application:', error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error('Não foi possível enviar a solicitação de acesso.');
  }
};

/**
 * Fetches specific admin user data from Firestore.
 * @param uid - The UID of the admin user.
 * @returns Admin user data or null if not found.
 */
export const getAdminUserData = async (uid: string): Promise<AdminUserData | null> => {
  try {
    const docRef = firestore.collection('admins').doc(uid);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return Object.assign({ uid }, docSnap.data()) as AdminUserData;
    }
    return null;
  } catch (error) {
    console.error('Error getting admin user data:', error);
    throw new Error('Não foi possível buscar os dados do administrador.');
  }
};

/**
 * Sets or updates admin user data in Firestore.
 * @param uid - The UID of the admin user.
 * @param data - The data to set or merge.
 */
export const setAdminUserData = async (uid: string, data: Partial<Omit<AdminUserData, 'uid'>>): Promise<void> => {
  try {
    const docRef = firestore.collection('admins').doc(uid);
    await docRef.set(data, { merge: true });
  } catch (error) {
    console.error('Error setting admin user data:', error);
    throw new Error('Não foi possível salvar os dados do administrador.');
  }
};

/**
 * Fetches all admin users, optionally filtered by organization.
 * @param organizationId - Optional ID of the organization to filter by.
 * @returns A list of admin users.
 */
export const getAllAdmins = async (organizationId?: string): Promise<AdminUserData[]> => {
  try {
    let q: firebase.firestore.Query = firestore.collection('admins');
    if (organizationId) {
      q = q.where('organizationIds', 'array-contains', organizationId);
    }
    const snapshot = await q.get();
    return snapshot.docs.map(doc => Object.assign({ uid: doc.id }, doc.data()) as AdminUserData);
  } catch (error) {
    console.error('Error getting all admins:', error);
    throw new Error('Não foi possível buscar a lista de administradores.');
  }
};

/**
 * Deletes an admin's record from Firestore. Does not delete the Auth user.
 * @param uid - The UID of the admin to delete.
 */
export const deleteAdminUser = async (uid: string): Promise<void> => {
    // This only removes their admin permissions by deleting the document.
    // Deleting the actual Firebase Auth user requires admin privileges on the backend.
    // A cloud function would be needed for a full deletion.
  try {
    const docRef = firestore.collection('admins').doc(uid);
    await docRef.delete();
  } catch (error) {
    console.error('Error deleting admin user:', error);
    throw new Error('Não foi possível remover as permissões do administrador.');
  }
};

/**
 * Fetches all pending admin applications.
 * @returns A list of admin applications.
 */
export const getAdminApplications = async (): Promise<AdminApplication[]> => {
  try {
    const q = firestore.collection('adminApplications').orderBy('createdAt', 'desc');
    const snapshot = await q.get();
    return snapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()) as AdminApplication);
  } catch (error) {
    console.error('Error getting admin applications:', error);
    throw new Error('Não foi possível buscar as solicitações de acesso.');
  }
};

/**
 * Deletes an admin application from Firestore.
 * @param id - The ID of the application to delete (which is also the user's UID).
 */
export const deleteAdminApplication = async (id: string): Promise<void> => {
  try {
    const docRef = firestore.collection('adminApplications').doc(id);
    await docRef.delete();
  } catch (error) {
    console.error('Error deleting admin application:', error);
    throw new Error('Não foi possível remover a solicitação de acesso.');
  }
};

/**
 * Approves an admin application. This creates an admin record and deletes the application.
 * This should ideally be a single transaction in a cloud function.
 * @param app - The application to approve.
 * @param orgId - The organization ID to assign the new admin to.
 */
export const acceptAdminApplication = async (app: AdminApplication, orgId: string): Promise<void> => {
  try {
    const batch = firestore.batch();

    // Create the new admin document
    const adminDocRef = firestore.collection('admins').doc(app.id);
    const newAdminData: Omit<AdminUserData, 'uid'> = {
      email: app.email,
      role: 'admin', // Default role on approval
      organizationIds: [orgId],
      assignedStates: [],
      assignedCampaigns: {},
    };
    batch.set(adminDocRef, newAdminData);

    // Delete the application document
    const appDocRef = firestore.collection('adminApplications').doc(app.id);
    batch.delete(appDocRef);

    await batch.commit();
  } catch (error) {
    console.error('Error accepting admin application:', error);
    throw new Error('Não foi possível aprovar a solicitação de acesso.');
  }
};