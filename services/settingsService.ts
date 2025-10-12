import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { states } from '../constants/states';
import { StatesConfig, StateConfig } from '../types';

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the configuration for all registration states.
 * This is a read-only function. It merges the configuration from the database
 * with the canonical list of states from the constants, filling in defaults
 * for any missing or malformed configurations. It does NOT write back to the DB.
 * @returns A promise that resolves to the StatesConfig object.
 */
export const getStatesConfig = async (): Promise<StatesConfig> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        const docSnap = await getDoc(docRef);

        const dbConfig = docSnap.exists() ? (docSnap.data() as Partial<StatesConfig>) : {};
        const finalConfig: StatesConfig = {};

        // Iterate through all canonical states defined in the application
        for (const state of states) {
            const stateAbbr = state.abbr;
            const existingConfig: any = dbConfig[stateAbbr];

            // Define a safe default for each state
            const defaultConfig = {
                isActive: true,
                rules: '',
                whatsappLink: '',
            };

            if (existingConfig && typeof existingConfig === 'object' && !Array.isArray(existingConfig)) {
                // If a valid config object exists in the DB, use it, but ensure all keys are present
                finalConfig[stateAbbr] = {
                    isActive: typeof existingConfig.isActive === 'boolean' ? existingConfig.isActive : true,
                    rules: typeof existingConfig.rules === 'string' ? existingConfig.rules : '',
                    whatsappLink: typeof existingConfig.whatsappLink === 'string' ? existingConfig.whatsappLink : '',
                };
            } else if (typeof existingConfig === 'boolean') {
                 // Handle legacy boolean format (where the whole value was just true/false)
                 finalConfig[stateAbbr] = { ...defaultConfig, isActive: existingConfig };
            } else {
                // If state is missing from DB or has a malformed type, use the default in-memory config for it.
                finalConfig[stateAbbr] = defaultConfig;
            }
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