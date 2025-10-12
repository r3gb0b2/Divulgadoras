import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { states } from '../constants/states';

export interface StatesConfig {
  [key: string]: boolean; // e.g., { CE: true, SE: false }
}

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

/**
 * Fetches the active/inactive configuration for registration states.
 * If no config exists in Firestore, it creates a default one with all states enabled.
 * @returns A promise that resolves to the StatesConfig object.
 */
export const getStatesConfig = async (): Promise<StatesConfig> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Ensure all states from constants are present in the config
            const config = docSnap.data() as StatesConfig;
            let needsUpdate = false;
            states.forEach(state => {
                if (!(state.abbr in config)) {
                    config[state.abbr] = true; // Default new states to active
                    needsUpdate = true;
                }
            });
            if (needsUpdate) {
                await setDoc(docRef, config);
            }
            return config;
        } else {
            // No config found, create a default one with all states enabled
            const defaultConfig: StatesConfig = states.reduce((acc, state) => {
                acc[state.abbr] = true;
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
 * Updates the states configuration in Firestore.
 * @param config The new StatesConfig object to save.
 */
export const setStatesConfig = async (config: StatesConfig): Promise<void> => {
    try {
        const docRef = doc(firestore, SETTINGS_COLLECTION, STATES_CONFIG_DOC_ID);
        await setDoc(docRef, config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das localidades.");
    }
};