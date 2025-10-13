import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { states } from '../constants/states';
import { StatesConfig, StateConfig, Campaign } from '../types';

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the configuration for all registration states.
 * This is a read-only function that merges the configuration from the database
 * with the canonical list of states, providing safe defaults for any missing
 * or malformed configurations without writing back to the DB.
 * @returns A promise that resolves to the StatesConfig object.
 */
export const getStatesConfig = async (): Promise<StatesConfig> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        const docSnap = await getDoc(docRef);

        const dbConfig = docSnap.exists() ? (docSnap.data() as Partial<StatesConfig>) : {};
        const finalConfig: StatesConfig = {};

        // Use the canonical list of states as the source of truth.
        for (const state of states) {
            const stateAbbr = state.abbr;

            // Start with a complete, safe default object. This applies to new states not yet in the DB.
            const defaultConfig: StateConfig = {
                isActive: true,
                rules: '',
            };

            const dbStateConfig = dbConfig[stateAbbr] as Partial<StateConfig> | boolean | undefined;
            
            let stateFinalConfig: StateConfig;

            if (typeof dbStateConfig === 'object' && dbStateConfig !== null) {
                // If there's an object in the DB, merge it over the default.
                // This correctly preserves all valid properties from the DB, including `isActive: false`.
                stateFinalConfig = { ...defaultConfig, ...dbStateConfig };
            } else if (typeof dbStateConfig === 'boolean') {
                // Handle legacy boolean format, merging it with other defaults.
                stateFinalConfig = { ...defaultConfig, isActive: dbStateConfig };
            } else {
                // If there's nothing in the DB for this state, use the default config.
                stateFinalConfig = defaultConfig;
            }

            finalConfig[stateAbbr] = stateFinalConfig;
        }
        
        return finalConfig;

    } catch (error) {
        console.error("Error getting states config: ", error);
        throw new Error("Não foi possível carregar a configuração das localidades.");
    }
};


/**
 * Fetches the configuration for a single state.
 * @param stateAbbr The abbreviation of the state (e.g., 'CE').
 * @returns A promise that resolves to the StateConfig object or null if not found.
 */
export const getStateConfig = async (stateAbbr: string): Promise<StateConfig | null> => {
    try {
        const fullConfig = await getStatesConfig();
        return fullConfig[stateAbbr] || null;
    } catch (error) {
        console.error(`Error getting config for state ${stateAbbr}: `, error);
        throw new Error(`Não foi possível carregar a configuração para ${stateAbbr}.`);
    }
}

/**
 * Updates the states configuration in Firestore.
 * @param config The new StatesConfig object to save.
 */
export const setStatesConfig = async (config: StatesConfig): Promise<void> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        // Using setDoc without merge overwrites the entire document.
        // This is the most direct and reliable way to ensure the database state
        // exactly matches the state from the UI.
        await setDoc(docRef, config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das localidades.");
    }
};

// --- Campaign Service Functions ---

export const getCampaigns = async (stateAbbr: string): Promise<Campaign[]> => {
    try {
        const q = query(
            collection(firestore, "campaigns"), 
            where("stateAbbr", "==", stateAbbr)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign)).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error getting campaigns: ", error);
        throw new Error("Não foi possível buscar os eventos/gêneros.");
    }
};

export const getAllCampaigns = async (): Promise<Campaign[]> => {
    try {
        const querySnapshot = await getDocs(collection(firestore, "campaigns"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign)).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error getting all campaigns: ", error);
        throw new Error("Não foi possível buscar todos os eventos/gêneros.");
    }
};

export const addCampaign = async (campaignData: Omit<Campaign, 'id'>): Promise<string> => {
    try {
        const docRef = await addDoc(collection(firestore, 'campaigns'), campaignData);
        return docRef.id;
    } catch (error) {
        console.error("Error adding campaign: ", error);
        throw new Error("Não foi possível adicionar o evento/gênero.");
    }
};

export const updateCampaign = async (id: string, data: Partial<Omit<Campaign, 'id'>>): Promise<void> => {
    try {
        await updateDoc(doc(firestore, 'campaigns', id), data);
    } catch (error) {
        console.error("Error updating campaign: ", error);
        throw new Error("Não foi possível atualizar o evento/gênero.");
    }
};

export const deleteCampaign = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(firestore, "campaigns", id));
    } catch (error) {
        console.error("Error deleting campaign: ", error);
        throw new Error("Não foi possível deletar o evento/gênero.");
    }
};
