import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { states } from '../constants/states';
import { StatesConfig, StateConfig } from '../types';

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the configuration for all registration states.
 * This function is now more robust and includes self-healing logic for the config document.
 * It ensures that any old data formats are migrated and any new states from the constants
 * are added to the configuration without overwriting existing settings.
 * @returns A promise that resolves to the StatesConfig object.
 */
export const getStatesConfig = async (): Promise<StatesConfig> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        const docSnap = await getDoc(docRef);

        const currentConfigData = docSnap.exists() ? docSnap.data() : {};
        let needsUpdate = false;
        const newConfig: StatesConfig = {};

        // Iterate over the canonical list of states from the constants file
        states.forEach(state => {
            const existingStateConfig = currentConfigData[state.abbr];

            // Case 1: The state config is in the correct, modern object format.
            if (typeof existingStateConfig === 'object' && existingStateConfig !== null && typeof existingStateConfig.isActive === 'boolean') {
                newConfig[state.abbr] = {
                    isActive: existingStateConfig.isActive,
                    rules: existingStateConfig.rules || '',
                    whatsappLink: existingStateConfig.whatsappLink || '',
                };
            } else {
                // Case 2: The state config needs to be migrated or created.
                needsUpdate = true;
                // Subcase 2a: It's the old boolean format. Respect the value.
                if (typeof existingStateConfig === 'boolean') {
                    newConfig[state.abbr] = {
                        isActive: existingStateConfig,
                        rules: '',
                        whatsappLink: '',
                    };
                } else {
                    // Subcase 2b: It's missing (undefined) or a malformed object. Default to active.
                    newConfig[state.abbr] = {
                        isActive: true,
                        rules: '',
                        whatsappLink: '',
                    };
                }
            }
        });

        // If the migration logic created or changed anything, persist it back to Firestore.
        // This self-heals the configuration document over time.
        if (needsUpdate || !docSnap.exists()) {
            await setDoc(docRef, newConfig);
        }
        
        return newConfig;

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
        // exactly matches the state from the UI, resolving the persistent issue
        // where deactivating a state was not being saved correctly.
        await setDoc(docRef, config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das localidades.");
    }
};