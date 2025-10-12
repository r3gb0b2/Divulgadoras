import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { states } from '../constants/states';
import { StatesConfig, StateConfig } from '../types';

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
            const dbStateConfig = dbConfig[stateAbbr] as Partial<StateConfig> | boolean | undefined;

            // Start with a safe, complete default.
            const currentState: StateConfig = {
                isActive: true,
                rules: '',
                whatsappLink: '',
            };

            // Intelligently apply the configuration from the database.
            if (typeof dbStateConfig === 'object' && dbStateConfig !== null) {
                // If the config is an object, check its properties and apply them if valid.
                // This correctly preserves `isActive: false` if it exists.
                if (typeof dbStateConfig.isActive === 'boolean') {
                    currentState.isActive = dbStateConfig.isActive;
                }
                if (typeof dbStateConfig.rules === 'string') {
                    currentState.rules = dbStateConfig.rules;
                }
                if (typeof dbStateConfig.whatsappLink === 'string') {
                    currentState.whatsappLink = dbStateConfig.whatsappLink;
                }
            } else if (typeof dbStateConfig === 'boolean') {
                // Handle the legacy format where the value was just a boolean.
                currentState.isActive = dbStateConfig;
            }
            
            finalConfig[stateAbbr] = currentState;
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