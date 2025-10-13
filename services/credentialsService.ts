import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { MercadoPagoCredentials } from '../types';

const CREDENTIALS_DOC_ID = 'mercado_pago_credentials';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the Mercado Pago API credentials from Firestore.
 * This should only be accessible by a superadmin.
 * @returns A promise that resolves to the MercadoPagoCredentials object.
 */
export const getMercadoPagoCredentials = async (): Promise<MercadoPagoCredentials> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, CREDENTIALS_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as MercadoPagoCredentials;
        }
        
        // Return empty object if no credentials are set yet
        return {};

    } catch (error) {
        console.error("Error getting Mercado Pago credentials: ", error);
        throw new Error("Não foi possível carregar as credenciais do Mercado Pago.");
    }
};

/**
 * Sets or updates the Mercado Pago API credentials in Firestore.
 * This should only be accessible by a superadmin.
 * @param credentials - The credentials object containing publicKey and accessToken.
 */
export const setMercadoPagoCredentials = async (credentials: MercadoPagoCredentials): Promise<void> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, CREDENTIALS_DOC_ID);
        await setDoc(docRef, credentials, { merge: true });
    } catch (error) {
        console.error("Error setting Mercado Pago credentials: ", error);
        throw new Error("Não foi possível salvar as credenciais do Mercado Pago.");
    }
};
