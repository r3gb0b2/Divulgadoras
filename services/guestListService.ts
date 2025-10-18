import { firestore } from '../firebase/config';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  limit,
  writeBatch,
  doc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { GuestListConfirmation } from '../types';

/**
 * Adds or updates a promoter's guest list confirmation for a specific campaign.
 * It checks for an existing confirmation to prevent duplicates.
 * @param confirmationData - The data for the guest list confirmation.
 */
export const addGuestListConfirmation = async (
  confirmationData: Omit<GuestListConfirmation, 'id' | 'confirmedAt'>
): Promise<void> => {
  try {
    const confirmationsRef = collection(firestore, 'guestListConfirmations');
    
    // Check if a confirmation already exists for this promoter and campaign
    const q = query(
      confirmationsRef,
      where('promoterId', '==', confirmationData.promoterId),
      where('campaignId', '==', confirmationData.campaignId),
      where('listName', '==', confirmationData.listName),
      limit(1)
    );
    
    const existingSnapshot = await getDocs(q);
    const batch = writeBatch(firestore);

    const dataWithTimestamp = {
      ...confirmationData,
      confirmedAt: serverTimestamp(),
    };
    
    if (!existingSnapshot.empty) {
      // Update existing confirmation
      const existingDocRef = existingSnapshot.docs[0].ref;
      batch.update(existingDocRef, dataWithTimestamp);
    } else {
      // Create new confirmation
      const newDocRef = doc(collection(firestore, 'guestListConfirmations'));
      batch.set(newDocRef, dataWithTimestamp);
    }

    await batch.commit();

  } catch (error) {
    console.error('Error adding guest list confirmation: ', error);
    throw new Error('Não foi possível confirmar a presença. Tente novamente.');
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
    const q = query(
      collection(firestore, 'guestListConfirmations'),
      where('campaignId', '==', campaignId)
    );
    
    const querySnapshot = await getDocs(q);
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
 * Checks in a person (promoter or guest) for a specific event confirmation.
 * Uses a transaction to ensure data integrity.
 * @param confirmationId The ID of the GuestListConfirmation document.
 * @param personName The name of the person to check in.
 */
export const checkInPerson = async (confirmationId: string, personName: string): Promise<void> => {
  const docRef = doc(firestore, 'guestListConfirmations', confirmationId);
  try {
    await runTransaction(firestore, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) {
        throw new Error("Confirmação não encontrada.");
      }

      const data = docSnap.data() as GuestListConfirmation;
      const now = Timestamp.now();

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