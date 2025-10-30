import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { GuestListConfirmation, GuestList, Timestamp } from '../types';

// ===================================================================
// NEW GUEST LIST MODEL FUNCTIONS (Post-refactor)
// ===================================================================

export const getGuestListById = async (listId: string): Promise<GuestList | null> => {
    try {
        const docRef = firestore.collection('guestLists').doc(listId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return { id: docSnap.id, ...docSnap.data() } as GuestList;
        }
        return null;
    } catch (error) {
        console.error("Error getting guest list by ID: ", error);
        throw new Error("Não foi possível buscar a lista de convidados.");
    }
};

export const getActiveGuestListsForCampaign = async (campaignId: string): Promise<GuestList[]> => {
    try {
        const q = firestore.collection("guestLists")
            .where("campaignId", "==", campaignId)
            .where("isActive", "==", true);
        const snapshot = await q.get();
        const lists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestList));
        return lists;
    } catch (error) {
        console.error("Error fetching active guest lists for campaign: ", error);
        throw new Error("Não foi possível buscar as listas ativas para este evento.");
    }
};

export const getGuestListsForOrg = async (organizationId: string): Promise<GuestList[]> => {
    try {
        const q = firestore.collection("guestLists")
            .where("organizationId", "==", organizationId);
        const snapshot = await q.get();
        const lists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestList));
        
        // Sort client-side to avoid needing a composite index
        lists.sort((a, b) => {
            const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
            const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
            return timeB - timeA; // descending
        });

        return lists;
    } catch (error) {
        console.error("Error fetching guest lists for org: ", error);
        throw new Error("Não foi possível buscar as listas.");
    }
};

export const createGuestList = async (data: Omit<GuestList, 'id' | 'createdAt'>): Promise<string> => {
    try {
        const docRef = await firestore.collection('guestLists').add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating guest list: ", error);
        throw new Error("Não foi possível criar a lista.");
    }
};

export const updateGuestList = async (listId: string, data: Partial<Omit<GuestList, 'id'>>): Promise<void> => {
    try {
        const docRef = firestore.collection('guestLists').doc(listId);
        await docRef.update(data);
    } catch (error) {
        console.error("Error updating guest list: ", error);
        throw new Error("Não foi possível atualizar a lista.");
    }
};

export const deleteGuestList = async (listId: string): Promise<void> => {
    try {
        // Potentially, we could also delete all confirmations associated with this list in a transaction
        await firestore.collection("guestLists").doc(listId).delete();
    } catch (error) {
        console.error("Error deleting guest list: ", error);
        throw new Error("Não foi possível deletar a lista.");
    }
};

export const getConfirmationByPromoterAndList = async (promoterId: string, listId: string): Promise<GuestListConfirmation | null> => {
    try {
        const q = firestore.collection('guestListConfirmations')
            .where('promoterId', '==', promoterId)
            .where('guestListId', '==', listId)
            .limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            return null;
        }
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as GuestListConfirmation;
    } catch (error) {
        console.error("Error getting guest list confirmation by promoter and list: ", error);
        throw new Error("Não foi possível buscar os dados de confirmação da lista.");
    }
};


// ===================================================================
// GUEST LIST CONFIRMATION FUNCTIONS
// ===================================================================

/**
 * Adds or updates a promoter's guest list confirmation for a specific campaign.
 * It checks for an existing confirmation to prevent duplicates and locks it after submission.
 * @param confirmationData - The data for the guest list confirmation.
 */
export const addGuestListConfirmation = async (
  confirmationData: Omit<GuestListConfirmation, 'id' | 'confirmedAt'>
): Promise<void> => {
  try {
    const confirmationsRef = firestore.collection('guestListConfirmations');
    
    const q = confirmationsRef
      .where('promoterId', '==', confirmationData.promoterId)
      .where('guestListId', '==', confirmationData.guestListId)
      .limit(1);
    
    const existingSnapshot = await q.get();
    const batch = firestore.batch();

    const dataWithTimestamp = {
      ...confirmationData,
      confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
      isLocked: true, // Lock the list on submission
    };
    
    if (!existingSnapshot.empty) {
      const existingDocRef = existingSnapshot.docs[0].ref;
      batch.update(existingDocRef, dataWithTimestamp);
    } else {
      const newDocRef = firestore.collection('guestListConfirmations').doc();
      batch.set(newDocRef, dataWithTimestamp);
    }

    await batch.commit();

  } catch (error) {
    console.error('Error adding guest list confirmation: ', error);
    throw new Error('Não foi possível confirmar a presença. Tente novamente.');
  }
};

/**
 * Unlocks a specific guest list confirmation, allowing the promoter to edit it again.
 * @param confirmationId - The ID of the GuestListConfirmation document to unlock.
 */
export const unlockGuestListConfirmation = async (confirmationId: string): Promise<void> => {
  try {
    const docRef = firestore.collection('guestListConfirmations').doc(confirmationId);
    await docRef.update({ isLocked: false });
  } catch (error) {
    console.error("Error unlocking guest list confirmation: ", error);
    throw new Error("Não foi possível liberar a lista para edição.");
  }
};


/**
 * Fetches all guest list confirmations for a specific campaign.
 * @param campaignId - The ID of the campaign to fetch the guest list for.
 * @returns A promise that resolves to an array of GuestListConfirmation objects.
 */
export const getGuestListForCampaign = async (
  campaignId: string
): Promise<GuestListConfirmation[]> => {
  try {
    const q = firestore.collection('guestListConfirmations')
      .where('campaignId', '==', campaignId);
    
    const querySnapshot = await q.get();
    const confirmations: GuestListConfirmation[] = [];
    querySnapshot.forEach((doc) => {
      confirmations.push({ id: doc.id, ...doc.data() } as GuestListConfirmation);
    });
    
    // Sort by promoter name
    return confirmations.sort((a, b) => a.promoterName.localeCompare(b.promoterName));
  } catch (error) {
    console.error('Error fetching guest list for campaign: ', error);
    throw new Error('Não foi possível buscar a lista de convidados.');
  }
};

/**
 * Fetches all guest list confirmations for a specific promoter by email.
 * @param email - The email of the promoter.
 * @returns A promise that resolves to an array of GuestListConfirmation objects.
 */
export const getGuestListConfirmationsByEmail = async (
  email: string
): Promise<GuestListConfirmation[]> => {
  try {
    const q = firestore.collection('guestListConfirmations')
      .where('promoterEmail', '==', email.toLowerCase().trim());
    
    const querySnapshot = await q.get();
    const confirmations: GuestListConfirmation[] = [];
    querySnapshot.forEach((doc) => {
      confirmations.push({ id: doc.id, ...doc.data() } as GuestListConfirmation);
    });
    
    // Sort by most recent first
    return confirmations.sort((a, b) => {
        const timeA = (a.confirmedAt as Timestamp)?.toMillis() || 0;
        const timeB = (b.confirmedAt as Timestamp)?.toMillis() || 0;
        return timeB - timeA;
    });
  } catch (error) {
    console.error('Error fetching guest list confirmations by email: ', error);
    throw new Error('Não foi possível buscar as confirmações de lista de convidados.');
  }
};

/**
 * Checks in a person (promoter or guest) for a specific event confirmation.
 * Uses a transaction to ensure data integrity.
 * @param confirmationId The ID of the GuestListConfirmation document.
 * @param personName The name of the person to check in.
 */
export const checkInPerson = async (confirmationId: string, personName: string): Promise<void> => {
  const docRef = firestore.collection('guestListConfirmations').doc(confirmationId);
  try {
    await firestore.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) {
        throw new Error("Confirmação não encontrada.");
      }

      const data = docSnap.data() as GuestListConfirmation;
      const now = firebase.firestore.Timestamp.now();

      if (personName === data.promoterName) {
        if (data.promoterCheckedInAt) {
          console.warn("Divulgadora já tem check-in.");
          return; // Already checked in
        }
        transaction.update(docRef, { promoterCheckedInAt: now });
      } else {
        const guestsCheckedIn = data.guestsCheckedIn || [];
        if (guestsCheckedIn.some(g => g.name === personName)) {
          console.warn(`Convidado ${personName} já tem check-in.`);
          return; // Guest already checked in
        }
        
        // Add the new guest to the array of checked-in guests
        const newGuestsCheckedIn = [...guestsCheckedIn, { name: personName, checkedInAt: now }];
        transaction.update(docRef, { guestsCheckedIn: newGuestsCheckedIn });
      }
    });
  } catch (error) {
    console.error("Erro durante a transação de check-in: ", error);
    throw new Error("Não foi possível realizar o check-in.");
  }
};
