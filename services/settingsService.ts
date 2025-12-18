
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { states } from '../constants/states';
import { StatesConfig, StateConfig, Campaign, InstructionTemplate, LinkTemplate, Timestamp } from '../types';

const STATES_CONFIG_DOC_ID = 'statesConfig';
const SETTINGS_COLLECTION = 'settings';

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
        throw new Error("Não foi possível carregar a configuração das regiões.");
    }
};

export const getStateConfig = async (stateAbbr: string): Promise<StateConfig | null> => {
    try {
        const fullConfig = await getStatesConfig();
        return fullConfig[stateAbbr] || null;
    } catch (error) {
        console.error(`Error getting config for state ${stateAbbr}: `, error);
        throw new Error(`Não foi possível carregar a configuração para ${stateAbbr}.`);
    }
}

export const setStatesConfig = async (config: StatesConfig): Promise<void> => {
    try {
        const docRef = firestore.collection(SETTINGS_COLLECTION).doc(STATES_CONFIG_DOC_ID);
        await docRef.set(config);
    } catch (error) {
        console.error("Error setting states config: ", error);
        throw new Error("Não foi possível salvar a configuração das regiões.");
    }
};

export const getCampaigns = async (stateAbbr: string, organizationId?: string): Promise<Campaign[]> => {
    try {
        let q: firebase.firestore.Query;
        const campaignsCollection = firestore.collection("campaigns");

        if (organizationId) {
            q = campaignsCollection.where("organizationId", "==", organizationId).where("stateAbbr", "==", stateAbbr);
        } else {
            q = campaignsCollection.where("stateAbbr", "==", stateAbbr);
        }

        const querySnapshot = await q.get();
        const campaigns = querySnapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()) as Campaign);
        return campaigns.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
        console.error("Error getting campaigns: ", error);
        throw new Error("Não foi possível buscar os eventos/gêneros.");
    }
};

export const getAllCampaigns = async (organizationId?: string): Promise<Campaign[]> => {
    try {
        let q: firebase.firestore.Query = firestore.collection("campaigns");
        if (organizationId) q = q.where("organizationId", "==", organizationId);
        const querySnapshot = await q.get();
        return querySnapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data()) as Campaign).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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

export const getInstructionTemplates = async (organizationId: string): Promise<InstructionTemplate[]> => {
    try {
        const q = firestore.collection("instructionTemplates").where("organizationId", "==", organizationId);
        const querySnapshot = await q.get();
        const templates = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstructionTemplate));
        templates.sort((a, b) => {
            const timeA = (a.createdAt as any)?.seconds || 0;
            const timeB = (b.createdAt as any)?.seconds || 0;
            return timeB - timeA;
        });
        return templates;
    } catch (error) {
        console.error("Error getting templates: ", error);
        throw new Error("Não foi possível buscar os modelos de instruções.");
    }
};

export const addInstructionTemplate = async (text: string, organizationId: string): Promise<string> => {
    try {
        const docRef = await firestore.collection('instructionTemplates').add({ 
            text, 
            organizationId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        return docRef.id;
    } catch (error) {
        console.error("Error adding template: ", error);
        throw new Error("Não foi possível adicionar o modelo de instrução.");
    }
};

export const updateInstructionTemplate = async (id: string, text: string): Promise<void> => {
    try {
        await firestore.collection('instructionTemplates').doc(id).update({ text });
    } catch (error) {
        console.error("Error updating template: ", error);
        throw new Error("Não foi possível atualizar o modelo de instrução.");
    }
};

export const deleteInstructionTemplate = async (id: string): Promise<void> => {
    try {
        await firestore.collection("instructionTemplates").doc(id).delete();
    } catch (error) {
        console.error("Error deleting template: ", error);
        throw new Error("Não foi possível deletar o modelo de instrução.");
    }
};

export const getLinkTemplates = async (organizationId: string): Promise<LinkTemplate[]> => {
    try {
        const q = firestore.collection("linkTemplates").where("organizationId", "==", organizationId);
        const querySnapshot = await q.get();
        const templates = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LinkTemplate));
        templates.sort((a, b) => {
            const timeA = (a.createdAt as any)?.seconds || 0;
            const timeB = (b.createdAt as any)?.seconds || 0;
            return timeB - timeA;
        });
        return templates;
    } catch (error) {
        console.error("Error getting link templates: ", error);
        throw new Error("Não foi possível buscar os modelos de links.");
    }
};

export const addLinkTemplate = async (name: string, url: string, organizationId: string): Promise<string> => {
    try {
        const docRef = await firestore.collection('linkTemplates').add({ 
            name,
            url, 
            organizationId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        return docRef.id;
    } catch (error) {
        console.error("Error adding link template: ", error);
        throw new Error("Não foi possível adicionar o modelo de link.");
    }
};

export const updateLinkTemplate = async (id: string, name: string, url: string): Promise<void> => {
    try {
        await firestore.collection('linkTemplates').doc(id).update({ name, url });
    } catch (error) {
        console.error("Error updating link template: ", error);
        throw new Error("Não foi possível atualizar o modelo de link.");
    }
};

export const deleteLinkTemplate = async (id: string): Promise<void> => {
    try {
        await firestore.collection("linkTemplates").doc(id).delete();
    } catch (error) {
        console.error("Error deleting link template: ", error);
        throw new Error("Não foi possível deletar o modelo de link.");
    }
};

export const getPrivacyPolicy = async (): Promise<string> => {
    try {
        const docRef = firestore.collection(SETTINGS_COLLECTION).doc('legal');
        const docSnap = await docRef.get();
        return docSnap.exists ? docSnap.data()?.privacyPolicy || '' : '';
    } catch (error) {
        console.error("Error getting privacy policy: ", error);
        throw new Error("Não foi possível carregar a política de privacidade.");
    }
};

export const updatePrivacyPolicy = async (content: string): Promise<void> => {
    try {
        const docRef = firestore.collection(SETTINGS_COLLECTION).doc('legal');
        await docRef.set({ privacyPolicy: content }, { merge: true });
    } catch (error) {
        console.error("Error setting privacy policy: ", error);
        throw new Error("Não foi possível salvar a política de privacidade.");
    }
};
