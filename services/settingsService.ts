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

        const dbConfig = docSnap.exists() ? docSnap.data() as Partial<StatesConfig> : {};
        const finalConfig: StatesConfig = {};
        let needsUpdate = false;

        // Iterate through all canonical states defined in the application
        for (const state of states) {
            const stateAbbr = state.abbr;
            const existingConfig: any = dbConfig[stateAbbr];

            // Default configuration for a new or malformed state
            const defaultConfig = {
                isActive: true,
                rules: '',
                whatsappLink: '',
            };

            if (existingConfig) {
                // Case 1: The config is the old boolean format. Migrate it.
                if (typeof existingConfig === 'boolean') {
                    finalConfig[stateAbbr] = { ...defaultConfig, isActive: existingConfig };
                    needsUpdate = true;
                }
                // Case 2: The config is an object. Check if it's valid and preserve data.
                else if (typeof existingConfig === 'object') {
                    // This is the CRITICAL check. We preserve `isActive` if it's explicitly false,
                    // otherwise we can default it. This prevents the bug where `false` was overwritten.
                    const newIsActive = typeof existingConfig.isActive === 'boolean' ? existingConfig.isActive : true;
                    
                    finalConfig[stateAbbr] = {
                        isActive: newIsActive,
                        rules: existingConfig.rules || '',
                        whatsappLink: existingConfig.whatsappLink || '',
                    };
                    
                    // If the DB version was missing a valid `isActive`, it needs an update.
                    if (typeof existingConfig.isActive !== 'boolean') {
                        needsUpdate = true;
                    }
                }
                // Case 3: The config is some other malformed type (e.g., string, number). Overwrite it.
                else {
                    finalConfig[stateAbbr] = defaultConfig;
                    needsUpdate = true;
                }
            }
            // Case 4: The state is completely missing from the DB config. Add it.
            else {
                finalConfig[stateAbbr] = defaultConfig;
                needsUpdate = true;
            }
        }
        
        // If any state was migrated, created, or fixed, write the complete, clean config back to the DB.
        if (needsUpdate || !docSnap.exists()) {
            await setDoc(docRef, finalConfig);
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
        // exactly matches the state from the UI, resolving the persistent issue
        // where deactivating a state was not being saved correctly.
        await setDoc(docRef, config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das localidades.");
    }
};