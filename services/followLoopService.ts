
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { FollowLoopParticipant, FollowInteraction, Timestamp } from '../types';
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

      // Update existing record with latest details
      await participantRef.update({
        isActive: true,
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
        state: promoter.state,
        promoterName: promoter.name,
        instagram: promoter.instagram,
        photoUrl: promoter.photoUrls[0] || '',
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
        state: promoter.state,
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

export const getNextProfileToFollow = async (currentPromoterId: string, organizationId: string, stateFilter?: string): Promise<FollowLoopParticipant | null> => {
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

    // 2. Get potential targets
    // NOTE: We REMOVED the '.where("state", "==", stateFilter)' from the database query.
    // This ensures we fetch "legacy" records that might be missing the 'state' field.
    // We will filter and "heal" (update) them in memory.
    let potentialQuery = firestore.collection(COLLECTION_PARTICIPANTS)
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .where('isBanned', '==', false)
      .limit(3000); // Increased limit to fetch a broad pool

    const potentialSnap = await potentialQuery.get();
    
    const candidates: FollowLoopParticipant[] = [];
    const needsRepair: FollowLoopParticipant[] = [];

    // 3. In-memory processing and filtering
    potentialSnap.forEach(doc => {
      if (followedIds.has(doc.id)) return;

      const data = doc.data() as FollowLoopParticipant;
      const p = { id: doc.id, ...data };

      if (p.state) {
        // If state exists, strictly check against filter
        if (!stateFilter || p.state === stateFilter) {
          candidates.push(p);
        }
      } else {
        // If state is MISSING, this is a legacy record. We need to check it.
        // We add it to a repair queue.
        needsRepair.push(p);
      }
    });

    // 4. Self-Healing: Process items with missing state
    // We limit this to a small batch to prevent performance issues, 
    // but enough to eventually heal the dataset as users browse.
    const MAX_REPAIR_BATCH = 5;
    if (needsRepair.length > 0) {
        const batchToRepair = needsRepair.slice(0, MAX_REPAIR_BATCH);
        
        await Promise.all(batchToRepair.map(async (p) => {
            try {
                const promoterData = await getPromoterById(p.promoterId);
                if (promoterData) {
                    // Fix the record in Firestore
                    await firestore.collection(COLLECTION_PARTICIPANTS).doc(p.id).update({
                        state: promoterData.state,
                        promoterName: promoterData.name, // Sync other fields too
                        photoUrl: promoterData.photoUrls[0] || ''
                    });

                    // Check if it matches our filter now
                    if (!stateFilter || promoterData.state === stateFilter) {
                        candidates.push({
                            ...p,
                            state: promoterData.state,
                            promoterName: promoterData.name,
                            photoUrl: promoterData.photoUrls[0] || ''
                        });
                    }
                }
            } catch (e) {
                console.warn(`Failed to repair participant ${p.id}`, e);
            }
        }));
    }

    if (candidates.length === 0) return null;

    // 5. Random Shuffle (Fisher-Yates)
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return candidates[0];

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

    // Update counts (Optimistic - creates generic "following" activity)
    await firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId).update({
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
    
    const snap = await q.get();
    const validations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    
    // Client sort
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

export const getConfirmedFollowers = async (promoterId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followedId', '==', promoterId)
            .where('status', '==', 'validated')
            .limit(50); // Limit to recent 50 for performance

        const snap = await q.get();
        const followers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
        
        // Sort by validatedAt descending
        followers.sort((a, b) => {
             const timeA = (a.validatedAt as Timestamp)?.toMillis() || 0;
             const timeB = (b.validatedAt as Timestamp)?.toMillis() || 0;
             return timeB - timeA;
        });

        return followers;
    } catch (error) {
        console.error('Error fetching confirmed followers:', error);
        return [];
    }
};

export const validateFollow = async (interactionId: string, isValid: boolean, followerId: string): Promise<void> => {
  const batch = firestore.batch();
  const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
  const followerRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId);
  
  try {
    const interactionSnap = await interactionRef.get();
    if (!interactionSnap.exists) throw new Error("Interação não encontrada.");
    
    const interactionData = interactionSnap.data() as FollowInteraction;
    const followedId = interactionData.followedId;
    const followedRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followedId);

    const status = isValid ? 'validated' : 'rejected';
    
    batch.update(interactionRef, {
      status,
      validatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (isValid) {
         // Valid Follow:
         // 1. Increment 'followingCount' for the follower
         batch.update(followerRef, {
             followingCount: firebase.firestore.FieldValue.increment(1)
         });
         // 2. Increment 'followersCount' for the followed person
         batch.update(followedRef, {
             followersCount: firebase.firestore.FieldValue.increment(1)
         });
    } else {
        // Invalid Follow:
        // Increment 'rejectedCount' on the follower (bad behavior)
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

export const reportUnfollow = async (interactionId: string, offenderId: string, reporterId: string): Promise<void> => {
    const batch = firestore.batch();
    const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
    const offenderRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(offenderId);
    const reporterRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(reporterId);

    try {
        // 1. Mark interaction as 'unfollowed'
        batch.update(interactionRef, {
            status: 'unfollowed',
            validatedAt: firebase.firestore.FieldValue.serverTimestamp() // Update timestamp to track when it happened
        });

        // 2. Penalize Offender (unfollower)
        batch.update(offenderRef, {
            followingCount: firebase.firestore.FieldValue.increment(-1),
            rejectedCount: firebase.firestore.FieldValue.increment(1) // Increment penalty count
        });

        // 3. Update Reporter (victim) stats
        batch.update(reporterRef, {
            followersCount: firebase.firestore.FieldValue.increment(-1)
        });

        await batch.commit();
    } catch (error) {
        console.error('Error reporting unfollow:', error);
        throw new Error('Não foi possível reportar.');
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

export const getAllFollowInteractions = async (organizationId: string): Promise<FollowInteraction[]> => {
    try {
        // Note: This requires a composite index on organizationId + createdAt DESC
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('organizationId', '==', organizationId)
            .orderBy('createdAt', 'desc')
            .limit(500); // Limit to latest 500 to prevent overloading
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    } catch (error) {
        console.error("Error fetching interactions history:", error);
         if (error instanceof Error && error.message.includes("requires an index")) {
            throw new Error("Índice do banco de dados ausente. Verifique o console para criar.");
        }
        throw new Error("Falha ao buscar histórico de conexões.");
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

export const adminCreateFollowInteraction = async (followerId: string, followedId: string): Promise<void> => {
    try {
        if (followerId === followedId) throw new Error("Uma divulgadora não pode seguir a si mesma.");

        const follower = await getParticipantStatus(followerId);
        const followed = await getParticipantStatus(followedId);

        if (!follower || !followed) throw new Error("Participantes inválidos.");

        const interactionId = `${followerId}_${followedId}`;
        const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
        
        // Check if already exists to avoid double counting
        const exists = (await interactionRef.get()).exists;
        if (exists) throw new Error("Esta conexão já existe.");

        const batch = firestore.batch();

        const interaction: FollowInteraction = {
            id: interactionId,
            followerId,
            followedId,
            organizationId: follower.organizationId,
            status: 'validated', // Admin creates as validated immediately
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            validatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            followerName: follower.promoterName,
            followerInstagram: follower.instagram,
            followedName: followed.promoterName,
        };

        batch.set(interactionRef, interaction);

        // Update counts
        batch.update(firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId), {
            followingCount: firebase.firestore.FieldValue.increment(1)
        });
        batch.update(firestore.collection(COLLECTION_PARTICIPANTS).doc(followedId), {
            followersCount: firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();

    } catch (error) {
        console.error("Error admin creating follow:", error);
        if (error instanceof Error) throw error;
        throw new Error("Falha ao criar conexão manual.");
    }
}
