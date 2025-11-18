
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { FollowLoopParticipant, FollowInteraction, Promoter, Timestamp } from '../types';
import { getPromoterById } from './promoterService';

const COLLECTION_PARTICIPANTS = 'followLoopParticipants';
const COLLECTION_INTERACTIONS = 'followInteractions';

// --- Participant Management ---

export const joinFollowLoop = async (promoterId: string): Promise<void> => {
  try {
    const promoter = await getPromoterById(promoterId);
    if (!promoter) throw new Error('Divulgadora não encontrada.');

    const participantRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(promoterId);
    const docSnap = await participantRef.get();

    if (docSnap.exists) {
      // Prevent re-joining if banned
      const data = docSnap.data();
      if (data?.isBanned) {
          throw new Error("Você foi removida desta dinâmica. Entre em contato com a administração.");
      }

      await participantRef.update({
        isActive: true,
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const newParticipant: FollowLoopParticipant = {
        id: promoterId,
        promoterId: promoter.id,
        promoterName: promoter.name,
        instagram: promoter.instagram,
        photoUrl: promoter.photoUrls[0] || '',
        organizationId: promoter.organizationId,
        isActive: true,
        isBanned: false,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
        followersCount: 0,
        followingCount: 0,
        rejectedCount: 0,
      };
      await participantRef.set(newParticipant);
    }
  } catch (error) {
    console.error('Error joining follow loop:', error);
    if (error instanceof Error) throw error;
    throw new Error('Não foi possível entrar na dinâmica.');
  }
};

export const getParticipantStatus = async (promoterId: string): Promise<FollowLoopParticipant | null> => {
  try {
    const doc = await firestore.collection(COLLECTION_PARTICIPANTS).doc(promoterId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as FollowLoopParticipant;
    }
    return null;
  } catch (error) {
    console.error('Error fetching participant status:', error);
    return null;
  }
};

// --- Core Logic: Get Next Profile ---

export const getNextProfileToFollow = async (currentPromoterId: string, organizationId: string): Promise<FollowLoopParticipant | null> => {
  try {
    // 1. Get IDs already followed by current user
    const interactionsQuery = firestore.collection(COLLECTION_INTERACTIONS)
      .where('followerId', '==', currentPromoterId);
    
    const interactionsSnap = await interactionsQuery.get();
    const followedIds = new Set<string>();
    followedIds.add(currentPromoterId); // Don't follow self
    interactionsSnap.forEach(doc => {
      followedIds.add(doc.data().followedId);
    });

    // 2. Get potential targets (active, not banned, same org)
    // REMOVED orderBy to fix index issue. Fetching a larger batch to randomize client-side.
    const potentialQuery = firestore.collection(COLLECTION_PARTICIPANTS)
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .where('isBanned', '==', false)
      .limit(100); 

    const potentialSnap = await potentialQuery.get();
    
    // 3. Filter in memory (Firestore doesn't support "not in array" for large sets efficiently)
    const candidates: FollowLoopParticipant[] = [];
    potentialSnap.forEach(doc => {
      if (!followedIds.has(doc.id)) {
        candidates.push({ id: doc.id, ...doc.data() } as FollowLoopParticipant);
      }
    });

    if (candidates.length === 0) return null;

    // 4. Return a random candidate from the pool to reduce collisions
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];

  } catch (error) {
    console.error('Error getting next profile:', error);
    // Re-throw with a more user-friendly message if possible, or let the caller handle it.
    throw error; 
  }
};

// --- Interaction Tracking ---

export const registerFollow = async (followerId: string, followedId: string): Promise<void> => {
  try {
    const follower = await getParticipantStatus(followerId);
    const followed = await getParticipantStatus(followedId);

    if (!follower || !followed) throw new Error('Dados inválidos.');

    // Use a deterministic ID to prevent duplicate follows
    const interactionId = `${followerId}_${followedId}`;
    const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);

    const interaction: FollowInteraction = {
      id: interactionId,
      followerId,
      followedId,
      organizationId: follower.organizationId,
      status: 'pending_validation',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      followerName: follower.promoterName,
      followerInstagram: follower.instagram,
      followedName: followed.promoterName,
    };

    await interactionRef.set(interaction);

    // Update counts (Optimistic)
    await firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId).update({
      followingCount: firebase.firestore.FieldValue.increment(1),
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('Error registering follow:', error);
    throw new Error('Não foi possível registrar a ação.');
  }
};

// --- Validation Flow ---

export const getPendingValidations = async (promoterId: string): Promise<FollowInteraction[]> => {
  try {
    const q = firestore.collection(COLLECTION_INTERACTIONS)
      .where('followedId', '==', promoterId)
      .where('status', '==', 'pending_validation');
    
    // Client side sort to avoid needing many composite indexes during development
    const snap = await q.get();
    const validations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    
    validations.sort((a, b) => {
        const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
        const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
        return timeB - timeA;
    });
    
    return validations;
  } catch (error) {
    console.error('Error getting pending validations:', error);
    throw new Error('Erro ao buscar validações.');
  }
};

export const validateFollow = async (interactionId: string, isValid: boolean, followerId: string): Promise<void> => {
  const batch = firestore.batch();
  const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
  const followerRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId);

  try {
    const status = isValid ? 'validated' : 'rejected';
    
    batch.update(interactionRef, {
      status,
      validatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (isValid) {
        // Optional: Increment follower count for current user (followedId) if needed
    } else {
        // If INVALID (Rejected), increment the 'rejectedCount' on the follower.
        batch.update(followerRef, {
            rejectedCount: firebase.firestore.FieldValue.increment(1)
        });
    }
    
    await batch.commit();

  } catch (error) {
    console.error('Error validating follow:', error);
    throw new Error('Não foi possível validar.');
  }
};

// --- Admin Functions ---

export const getAllParticipantsForAdmin = async (organizationId: string): Promise<FollowLoopParticipant[]> => {
    try {
        const q = firestore.collection(COLLECTION_PARTICIPANTS)
            .where('organizationId', '==', organizationId);
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowLoopParticipant));
    } catch (error) {
        console.error("Error fetching participants for admin:", error);
        throw new Error("Falha ao buscar participantes.");
    }
}

export const toggleParticipantBan = async (participantId: string, isBanned: boolean): Promise<void> => {
    try {
        await firestore.collection(COLLECTION_PARTICIPANTS).doc(participantId).update({
            isBanned: isBanned,
            isActive: !isBanned // If banned, set inactive.
        });
    } catch (error) {
        console.error("Error toggling ban:", error);
        throw new Error("Falha ao atualizar status.");
    }
}
