import { firestore, auth } from '../firebase/config';
import { collection, doc, getDocs, query, where, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
// FIX: Import `getAuth` from `firebase/auth` to resolve the "Cannot find name 'getAuth'" error.
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { AdminUser } from '../types';

// NOTE: Creating users client-side should be handled with care.
// For production apps, it's safer to use Firebase Cloud Functions to manage user creation.
// This prevents exposing any sensitive logic on the client.
// We are creating a secondary App instance to create users without logging out the current admin.
import { initializeApp } from "firebase/app";

const secondaryAppConfig = {
  apiKey: "AIzaSyDsi6VpfhLQW8UWgAp5c4TRV7vqOkDyauU",
  authDomain: "stingressos-e0a5f.firebaseapp.com",
  projectId: "stingressos-e0a5f",
  storageBucket: "stingressos-e0a5f.firebasestorage.app",
  messagingSenderId: "424186734009",
  appId: "1:424186734009:web:385f6c645a3ace2f784268",
  measurementId: "G-JTEQ46VCRY"
};

const secondaryApp = initializeApp(secondaryAppConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);


export const getUserProfile = async (uid: string): Promise<AdminUser | null> => {
    try {
        const q = query(collection(firestore, 'users'), where('uid', '==', uid));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.warn("No profile found for UID:", uid);
            return null;
        }

        const userDoc = querySnapshot.docs[0];
        return { id: userDoc.id, ...userDoc.data() } as AdminUser;

    } catch (error) {
        console.error("Error getting user profile:", error);
        throw new Error("Não foi possível buscar o perfil do usuário.");
    }
}

export const getAdminUsers = async (): Promise<AdminUser[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, "users"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminUser));
    } catch (error) {
        console.error("Error getting admin users:", error);
        throw new Error("Não foi possível buscar os usuários administradores.");
    }
};

export const addAdminUser = async (userData: Omit<AdminUser, 'id' | 'uid'>, password: string): Promise<void> => {
    try {
        // Step 1: Create user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, userData.email, password);
        const { user } = userCredential;

        // Step 2: Create user profile in Firestore
        await addDoc(collection(firestore, 'users'), {
            ...userData,
            uid: user.uid, // Link Firestore doc to Auth user
        });

    } catch (error: any) {
        console.error("Error adding admin user:", error);
        if(error.code === 'auth/email-already-in-use') {
            throw new Error("Este e-mail já está em uso por outro usuário.");
        }
        throw new Error("Não foi possível adicionar o novo usuário.");
    }
};

export const updateAdminUser = async (id: string, data: Partial<Omit<AdminUser, 'id'>>): Promise<void> => {
    try {
        const userDoc = doc(firestore, 'users', id);
        await updateDoc(userDoc, data);
    } catch (error) {
        console.error("Error updating admin user:", error);
        throw new Error("Não foi possível atualizar o usuário.");
    }
};

export const deleteAdminUser = async (id: string): Promise<void> => {
    try {
        // Deleting the Firestore document revokes their permissions in this app.
        // NOTE: This does NOT delete the user from Firebase Authentication.
        // A Cloud Function is required to safely delete users from Firebase Auth based on their UID.
        await deleteDoc(doc(firestore, "users", id));
    } catch (error) {
        console.error("Error deleting admin user:", error);
        throw new Error("Não foi possível deletar o usuário.");
    }
};