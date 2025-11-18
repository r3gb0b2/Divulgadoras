
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
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
        followersCount: 0,
        followingCount: 0,
      };
      await participantRef.set(newParticipant);
    }
  } catch (error) {
    console.error('Error joining follow loop:', error);
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

    // 2. Get potential targets (active participants in same org)
    // Optimization: Order by lastActiveAt desc to show active users first
    const potentialQuery = firestore.collection(COLLECTION_PARTICIPANTS)
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .orderBy('lastActiveAt', 'desc')
      .limit(50); // Fetch a batch

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
    throw new Error('Não foi possível carregar o próximo perfil.');
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
      .where('status', '==', 'pending_validation')
      .orderBy('createdAt', 'desc');
    
    const snap = await q.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
  } catch (error) {
    console.error('Error getting pending validations:', error);
    // Fallback if index missing
    if ((error as any).code === 'failed-precondition') {
         const simpleQ = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followedId', '==', promoterId)
            .where('status', '==', 'pending_validation');
         const snap = await simpleQ.get();
         return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    }
    throw new Error('Erro ao buscar validações.');
  }
};

export const validateFollow = async (interactionId: string, isValid: boolean, followerId: string): Promise<void> => {
  try {
    const status = isValid ? 'validated' : 'rejected';
    await firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId).update({
      status,
      validatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (isValid) {
       // Increment follower count for the person being followed
       // Note: We need the ID of the person being followed (current user), which isn't passed here directly
       // Ideally this is done via Cloud Function trigger for security/consistency.
       // For now, we focus on the interaction status update.
    }

    // If valid and reciprocal, check if we should create a reverse interaction automatically?
    // No, let's keep it manual for now to encourage engagement.

  } catch (error) {
    console.error('Error validating follow:', error);
    throw new Error('Não foi possível validar.');
  }
};
