// FIX: Add missing import for 'firebase' namespace to use compat types.
import firebase from '../firebase/config';
import { firestore } from '../firebase/config';
import { states } from '../constants/states';
import { StatesConfig, StateConfig, Campaign } from '../types';

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the global configuration for all registration states.
 * This remains a global setting managed by the superadmin.
 * @returns A promise that resolves to the StatesConfig object.
 */
export const getStatesConfig = async (): Promise<StatesConfig> => {
    try {
        const docRef = firestore.collection(SETTINGS_COLLECTION).doc(STATES_CONFIG_DOC_ID);
        const docSnap = await docRef.get();

        const dbConfig = docSnap.exists ? (docSnap.data() as Partial<StatesConfig>) : {};
        const finalConfig: StatesConfig = {};

        for (const state of states) {
            const stateAbbr = state.abbr;
            const defaultConfig: StateConfig = { isActive: true, rules: '' };
            const dbStateConfig = dbConfig[stateAbbr] as Partial<StateConfig> | boolean | undefined;
            
            let stateFinalConfig: StateConfig;
            if (typeof dbStateConfig === 'object' && dbStateConfig !== null) {
                stateFinalConfig = { ...defaultConfig, ...dbStateConfig };
            } else if (typeof dbStateConfig === 'boolean') {
                stateFinalConfig = { ...defaultConfig, isActive: dbStateConfig };
            } else {
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
        const docRef = firestore.collection(SETTINGS_COLLECTION).doc(STATES_CONFIG_DOC_ID);
        await docRef.set(config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das localidades.");
    }
};

// --- Campaign Service Functions (Now Multi-tenant) ---

export const getCampaigns = async (stateAbbr: string, organizationId?: string): Promise<Campaign[]> => {
    try {
        let q: firebase.firestore.Query;
        const campaignsCollection = firestore.collection("campaigns");

        if (organizationId) {
            // This is a composite query. It might require a manual index in Firestore.
            // If it fails, the error log in the browser console will provide a direct link to create it.
            q = campaignsCollection
                .where("organizationId", "==", organizationId)
                .where("stateAbbr", "==", stateAbbr);
        } else {
            // Superadmin case, fetching all campaigns for a specific state across all orgs
            q = campaignsCollection.where("stateAbbr", "==", stateAbbr);
        }

        const querySnapshot = await q.get();
        const campaigns = querySnapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()) as Campaign);
        
        return campaigns.sort((a, b) => a.name.localeCompare(b.name));

    } catch (error) {
        console.error("Error getting campaigns: ", error);
        if (error instanceof Error && error.message.includes("requires an index")) {
            console.error("Firestore index missing. Please create the required composite index in your Firebase console. The error message in the browser console contains a direct link to create it.");
            throw new Error("Erro de configuração do banco de dados (índice ausente). Contate o suporte técnico.");
        }
        throw new Error("Não foi possível buscar os eventos/gêneros.");
    }
};

export const getAllCampaigns = async (organizationId?: string): Promise<Campaign[]> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("campaigns");
        if (organizationId) {
            q = q.where("organizationId", "==", organizationId);
        }
        const querySnapshot = await q.get();
        // FIX: Replace spread operator with Object.assign to resolve "Spread types may only be created from object types" error.
        return querySnapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()) as Campaign).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("Error getting all campaigns: ", error);
        throw new Error("Não foi possível buscar todos os eventos/gêneros.");
    }
};

export const addCampaign = async (campaignData: Omit<Campaign, 'id'>): Promise<string> => {
    try {
        const docRef = await firestore.collection('campaigns').add(campaignData);
        return docRef.id;
    } catch (error) {
        console.error("Error adding campaign: ", error);
        throw new Error("Não foi possível adicionar o evento/gênero.");
    }
};

export const updateCampaign = async (id: string, data: Partial<Omit<Campaign, 'id'>>): Promise<void> => {
    try {
        await firestore.collection('campaigns').doc(id).update(data);
    } catch (error) {
        console.error("Error updating campaign: ", error);
        throw new Error("Não foi possível atualizar o evento/gênero.");
    }
};

export const deleteCampaign = async (id: string): Promise<void> => {
    try {
        await firestore.collection("campaigns").doc(id).delete();
    } catch (error) {
        console.error("Error deleting campaign: ", error);
        throw new Error("Não foi possível deletar o evento/gênero.");
    }
};
