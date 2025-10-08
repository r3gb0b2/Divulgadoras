import { firestore } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const settingsDocRef = doc(firestore, 'settings', 'rejectionPresets');

/**
 * Fetches the preset rejection messages from Firestore.
 * If the document doesn't exist, it returns a default array.
 */
export const getRejectionPresets = async (): Promise<string[]> => {
  try {
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      return docSnap.data().messages || [];
    } else {
      // If no presets are configured, return a default set.
      const defaultPresets = [
        'Fotos de baixa qualidade ou inadequadas.',
        'Perfil do Instagram privado ou inativo.',
        'Informações de cadastro incompletas ou inconsistentes.',
        'Não atende aos critérios de parceria no momento.',
      ];
      // Optionally, save the defaults for future edits.
      await setDoc(settingsDocRef, { messages: defaultPresets });
      return defaultPresets;
    }
  } catch (error) {
    console.error("Error fetching rejection presets: ", error);
    // Return an empty array or default on error to avoid breaking the UI
    return []; 
  }
};

/**
 * Updates the entire list of preset rejection messages in Firestore.
 * @param messages The new array of preset messages.
 */
export const updateRejectionPresets = async (messages: string[]): Promise<void> => {
  try {
    await setDoc(settingsDocRef, { messages });
  } catch (error) {
    console.error("Error updating rejection presets: ", error);
    throw new Error("Não foi possível salvar as mensagens predefinidas.");
  }
};
