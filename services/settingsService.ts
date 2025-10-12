import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { states } from '../constants/states';
import { StatesConfig, StateConfig } from '../types';

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the configuration for all registration states.
 * If no config exists, it creates a default one.
 * It also handles migrating old boolean-based configs to the new object structure.
 * @returns A promise that resolves to the StatesConfig object.
 */
export const getStatesConfig = async (): Promise<StatesConfig> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const config = docSnap.data();
            let needsUpdate = false;
            const newConfig: StatesConfig = {};

            // Migrate old format and ensure all states are present
            states.forEach(state => {
                const existingStateConfig = config[state.abbr];
                if (typeof existingStateConfig === 'object' && existingStateConfig !== null && 'isActive' in existingStateConfig) {
                    // It's already the new format
                    newConfig[state.abbr] = {
                        isActive: existingStateConfig.isActive,
                        rules: existingStateConfig.rules || '',
                        whatsappLink: existingStateConfig.whatsappLink || '',
                    };
                } else {
                    // It's the old boolean format or missing, so migrate/create
                    needsUpdate = true;
                    newConfig[state.abbr] = {
                        isActive: !!existingStateConfig, // Convert boolean or undefined to boolean
                        rules: '',
                        whatsappLink: '',
                    };
                }
            });

            if (needsUpdate) {
                await setDoc(docRef, newConfig);
            }
            return newConfig;
        } else {
            // No config found, create a default one with all states active but empty rules/links
            const defaultConfig: StatesConfig = states.reduce((acc, state) => {
                acc[state.abbr] = {
                    isActive: true,
                    rules: '',
                    whatsappLink: '',
                };
                return acc;
            }, {} as StatesConfig);
            
            await setDoc(docRef, defaultConfig);
            return defaultConfig;
        }
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
        // Use updateDoc for more reliable modification of an existing document,
        // which should definitively fix the issue with saving deactivation status.
        await updateDoc(docRef, config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das localidades.");
    }
};