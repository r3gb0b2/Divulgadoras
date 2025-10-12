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

        // Use the canonical list of states as the source of truth for iteration.
        for (const state of states) {
            const stateAbbr = state.abbr;
            
            // Define a complete, safe default for any state.
            const defaultConfig: StateConfig = {
                isActive: true,
                rules: '',
                whatsappLink: '',
            };

            // Get the raw config for this specific state from the database. It could be an object, a boolean (legacy), or undefined.
            const existingConfig: unknown = dbConfig[stateAbbr];

            // Start building the final config for this state with the safe default.
            let stateFinalConfig = { ...defaultConfig };

            // Intelligently merge data from the database.
            if (typeof existingConfig === 'object' && existingConfig !== null && !Array.isArray(existingConfig)) {
                // If it's a valid object, spread it over the default. This preserves any valid fields from DB.
                stateFinalConfig = { ...stateFinalConfig, ...existingConfig };
            } else if (typeof existingConfig === 'boolean') {
                // Handle the legacy format where the value was just a boolean for the active status.
                stateFinalConfig.isActive = existingConfig;
            }
            
            // Final safety check: ensure isActive is explicitly a boolean. If after merging it's
            // something else (e.g., from a malformed DB entry like { isActive: "true" }), default it.
            if (typeof stateFinalConfig.isActive !== 'boolean') {
                stateFinalConfig.isActive = true;
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