import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { GuestListConfirmation, GuestList, Timestamp, GuestListChangeRequest } from '../types';

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
        if (error instanceof Error && error.message.includes("requires an index")) {
            throw new Error("Erro de configuração do banco de dados (índice ausente para 'guestLists'). Verifique o console de logs para o link de criação.");
        }
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
        // With the new deterministic ID, we can do a direct doc get.
        const confirmationId = `${promoterId}_${listId}`;
        const docRef = firestore.collection('guestListConfirmations').doc(confirmationId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return { id: docSnap.id, ...docSnap.data() } as GuestListConfirmation;
        }
        return null;
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
 * It uses a transaction with a deterministic ID to atomically replace the document.
 * @param confirmationData - The data for the guest list confirmation.
 */
export const addGuestListConfirmation = async (
  confirmationData: Omit<GuestListConfirmation, 'id' | 'confirmedAt'>
): Promise<void> => {
  try {
    if (!confirmationData.promoterId || !confirmationData.guestListId) {
      throw new Error("ID da divulgadora e da lista são obrigatórios.");
    }

    const confirmationId = `${confirmationData.promoterId}_${confirmationData.guestListId}`;
    const confirmationDocRef = firestore.collection('guestListConfirmations').doc(confirmationId);

    // This is the most robust "upsert" pattern. We find any existing doc and replace it.
    // A transaction is the safest way to do this to ensure atomicity.
    await firestore.runTransaction(async (transaction) => {
      // First, delete any existing document. This won't fail if it doesn't exist.
      transaction.delete(confirmationDocRef);

      // Then, create the new document with the fresh data.
      // Using Timestamp.now() (client-side) instead of serverTimestamp() to avoid
      // the "Expected type 'cf'" error which seems to be related to the compat SDK's
      // handling of FieldValue sentinels inside transactions.
      const dataToCreate = {
        ...confirmationData,
        confirmedAt: firebase.firestore.Timestamp.now(),
        isLocked: true,
      };

      transaction.set(confirmationDocRef, dataToCreate);
    });

  } catch (error) {
    console.error('Error in transaction for guest list confirmation: ', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Não foi possível confirmar a presença. Detalhes do erro: ${errorMessage}`);
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
        transaction.update(docRef, { promoterCheckedInAt: now, promoterCheckedOutAt: null });
      } else {
        const guestsCheckedIn = data.guestsCheckedIn || [];
        if (guestsCheckedIn.some(g => g.name === personName && !g.checkedOutAt)) {
          console.warn(`Convidado ${personName} já tem check-in ativo.`);
          return; // Guest already checked in and not checked out
        }
        
        // Add the new guest to the array of checked-in guests
        const newGuestsCheckedIn = [...guestsCheckedIn, { name: personName, checkedInAt: now, checkedOutAt: null }];
        transaction.update(docRef, { guestsCheckedIn: newGuestsCheckedIn });
      }
    });
  } catch (error) {
    console.error("Erro durante a transação de check-in: ", error);
    throw new Error("Não foi possível realizar o check-in.");
  }
};

/**
 * Checks out a person (promoter or guest) for a specific event confirmation.
 * Uses a transaction to ensure data integrity.
 * @param confirmationId The ID of the GuestListConfirmation document.
 * @param personName The name of the person to check out.
 */
export const checkOutPerson = async (confirmationId: string, personName: string): Promise<void> => {
  const docRef = firestore.collection('guestListConfirmations').doc(confirmationId);
  try {
    await firestore.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("Confirmação não encontrada.");

      const data = docSnap.data() as GuestListConfirmation;
      const now = firebase.firestore.FieldValue.serverTimestamp();

      if (personName === data.promoterName) {
        if (!data.promoterCheckedInAt) throw new Error("Não pode fazer check-out sem ter feito check-in.");
        transaction.update(docRef, { promoterCheckedOutAt: now });
      } else {
        const guestsCheckedIn = data.guestsCheckedIn || [];
        const guestIndex = guestsCheckedIn.findIndex(g => g.name === personName && !g.checkedOutAt); // Find the active check-in
        if (guestIndex === -1) throw new Error("Convidado não encontrado na lista de check-in ativo.");
        
        const newGuestsCheckedIn = [...guestsCheckedIn];
        newGuestsCheckedIn[guestIndex] = { ...newGuestsCheckedIn[guestIndex], checkedOutAt: now as any };
        transaction.update(docRef, { guestsCheckedIn: newGuestsCheckedIn });
      }
    });
  } catch (error) {
    console.error("Erro na transação de check-out: ", error);
    throw new Error("Não foi possível realizar o check-out.");
  }
};

// ===================================================================
// GUEST LIST CHANGE REQUEST FUNCTIONS
// ===================================================================

export const createGuestListChangeRequest = async (
  confirmation: GuestListConfirmation
): Promise<void> => {
  try {
    if (!confirmation || !confirmation.id) {
      throw new Error("Dados da confirmação são inválidos.");
    }
    // Check for existing pending request
    const q = firestore.collection('guestListChangeRequests')
      .where('confirmationId', '==', confirmation.id)
      .where('status', '==', 'pending');
    const existing = await q.get();
    if (!existing.empty) {
      throw new Error("Você já tem uma solicitação de alteração pendente para esta lista.");
    }

    const requestData: Omit<GuestListChangeRequest, 'id'> = {
      organizationId: confirmation.organizationId,
      campaignId: confirmation.campaignId,
      guestListId: confirmation.guestListId!,
      confirmationId: confirmation.id,
      promoterId: confirmation.promoterId,
      promoterName: confirmation.promoterName,
      promoterEmail: confirmation.promoterEmail,
      listName: confirmation.listName,
      campaignName: confirmation.campaignName,
      status: 'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await firestore.collection('guestListChangeRequests').add(requestData);
  } catch (error) {
    console.error("Error creating guest list change request: ", error);
    if (error instanceof Error) throw error;
    throw new Error("Não foi possível enviar a solicitação de alteração.");
  }
};

export const getPendingChangeRequestForConfirmation = async (
  confirmationId: string
): Promise<GuestListChangeRequest | null> => {
    if (!confirmationId) return null;
    try {
        const q = firestore.collection('guestListChangeRequests')
            .where('confirmationId', '==', confirmationId)
            .where('status', '==', 'pending')
            .limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            return null;
        }
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as GuestListChangeRequest;
    } catch (error) {
        console.error("Error fetching pending change request: ", error);
        if (error instanceof Error && error.message.includes("requires an index")) {
            throw new Error("Erro de configuração do banco de dados (índice ausente para 'guestListChangeRequests'). Verifique o console de logs para o link de criação.");
        }
        throw new Error("Não foi possível verificar solicitações pendentes.");
    }
};

export const getGuestListChangeRequests = async (
  organizationId: string
): Promise<GuestListChangeRequest[]> => {
    try {
        const q = firestore.collection("guestListChangeRequests")
            .where("organizationId", "==", organizationId)
            .where("status", "==", "pending")
            .orderBy("requestedAt", "desc");
        const snapshot = await q.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GuestListChangeRequest));
    } catch (error) {
        console.error("Error getting guest list change requests: ", error);
        if (error instanceof Error && error.message.includes("requires an index")) {
            console.error("Firestore index missing for guestListChangeRequests. Please create it in your Firebase console. The error message usually contains a direct link.");
            throw new Error("Erro de configuração do banco de dados (índice ausente). Um índice para 'guestListChangeRequests' por 'organizationId', 'status' e 'requestedAt' é necessário. Verifique o console de logs para o link de criação.");
        }
        throw new Error("Não foi possível buscar as solicitações de alteração.");
    }
};

export const updateGuestListChangeRequest = async (
  requestId: string,
  data: Partial<Omit<GuestListChangeRequest, 'id'>>
): Promise<void> => {
    try {
        await firestore.collection("guestListChangeRequests").doc(requestId).update(data);
    } catch (error) {
        console.error("Error updating guest list change request: ", error);
        throw new Error("Não foi possível atualizar a solicitação.");
    }
};