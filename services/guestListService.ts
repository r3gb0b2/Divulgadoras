
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
  // FIX: Added missing 'doc' import from firestore.
  doc,
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