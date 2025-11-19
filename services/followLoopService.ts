
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

      await participantRef.update({
        isActive: true,
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
        // Update profile details in case they changed
        promoterName: promoter.name,
        instagram: promoter.instagram,
        photoUrl: promoter.photoUrls[0] || '',
        state: promoter.state || '',
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
        state: promoter.state || '',
      };
      await participantRef.set(newParticipant);
    }
  } catch (error: any) {
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
  } catch (error: any) {
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

    // 2. Get potential targets (broad query)
    let potentialQuery = firestore.collection(COLLECTION_PARTICIPANTS)
      .where('organizationId', '==', organizationId)
      .limit(2000); 

    if (stateFilter) {
        // Attempt to filter by state if the field exists in the index
        // Note: If older records don't have 'state', this might exclude them,
        // but the 'joinFollowLoop' updates 'state', so active users will have it.
        potentialQuery = potentialQuery.where('state', '==', stateFilter);
    }

    const potentialSnap = await potentialQuery.get();
    
    // 3. Filter in memory
    const candidates: FollowLoopParticipant[] = [];
    potentialSnap.forEach(doc => {
      const data = doc.data();
      
      // Self-healing: If we see a record without 'state', and we know the current context,
      // we could technically assume, but for now we rely on 'isActive'.
      
      if (
          !followedIds.has(doc.id) && 
          data.isActive === true && 
          data.isBanned === false
      ) {
         candidates.push({ id: doc.id, ...data } as FollowLoopParticipant);
      }
    });

    if (candidates.length === 0) {
        // Fallback: If no candidates found with state filter, try without it (for legacy records)
        // only if we applied a filter initially.
        if (stateFilter) {
             const broadQuery = firestore.collection(COLLECTION_PARTICIPANTS)
                .where('organizationId', '==', organizationId)
                .limit(500);
             const broadSnap = await broadQuery.get();
             broadSnap.forEach(doc => {
                 const data = doc.data();
                 // Include if active, not banned, not followed, AND state is missing/undefined (legacy)
                 if (!followedIds.has(doc.id) && data.isActive === true && data.isBanned === false && !data.state) {
                     candidates.push({ id: doc.id, ...data } as FollowLoopParticipant);
                 }
             });
        }
    }
    
    if (candidates.length === 0) return null;

    // 4. Fisher-Yates Shuffle for randomness
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return candidates[0];

  } catch (error: any) {
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
      followedInstagram: followed.instagram, // Ensure this is saved
    };

    await interactionRef.set(interaction);

    // Update counts (Optimistic - creates generic "following" activity)
    await firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId).update({
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (error: any) {
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
  } catch (error: any) {
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
    } catch (error: any) {
        console.error('Error fetching confirmed followers:', error);
        return [];
    }
};

// NEW: Get rejected interactions where current user was the FOLLOWER (to see rejection alerts)
export const getRejectedFollowsReceived = async (promoterId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followerId', '==', promoterId)
            .where('status', '==', 'rejected');
        
        const snap = await q.get();
        const interactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));

        // Enrichment for legacy data: if followedInstagram is missing, fetch it from participant profile
        // This fixes the "Instagram not found" error for older interactions
        const missingInfo = interactions.filter(i => !i.followedInstagram);
        if (missingInfo.length > 0) {
            const idsToFetch = Array.from(new Set(missingInfo.map(i => i.followedId))) as string[];
            const profiles = await Promise.all(idsToFetch.map(id => getParticipantStatus(id)));
            const profileMap = new Map<string, FollowLoopParticipant>();
            profiles.forEach(p => { if (p) profileMap.set(p.id, p); });

            interactions.forEach(i => {
                if (!i.followedInstagram && profileMap.has(i.followedId)) {
                    const p = profileMap.get(i.followedId)!;
                    i.followedInstagram = p.instagram;
                    i.followedName = p.promoterName; // Ensure name is current too
                }
            });
        }

        return interactions;
    } catch (error: any) {
        console.error("Error getting rejected follows received:", error);
        return [];
    }
};

// NEW: Get rejected interactions where current user was the FOLLOWED (to undo rejections)
export const getRejectedFollowsGiven = async (promoterId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followedId', '==', promoterId)
            .where('status', '==', 'rejected');
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    } catch (error: any) {
        console.error("Error getting rejected follows given:", error);
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
        // Increment 'rejectedCount' on the follower
        batch.update(followerRef, {
            rejectedCount: firebase.firestore.FieldValue.increment(1)
        });
    }
    
    await batch.commit();

  } catch (error: any) {
    console.error('Error validating follow:', error);
    throw new Error('Não foi possível validar.');
  }
};

// NEW: Undo a rejection (turn it into a validation)
export const undoRejection = async (interactionId: string): Promise<void> => {
    const batch = firestore.batch();
    const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
    
    try {
        const interactionSnap = await interactionRef.get();
        if (!interactionSnap.exists) throw new Error("Interação não encontrada.");
        const data = interactionSnap.data() as FollowInteraction;
        
        if (data.status !== 'rejected') {
            throw new Error("Esta interação não está rejeitada.");
        }

        const followerRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(data.followerId);
        const followedRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(data.followedId);

        // 1. Update interaction status
        batch.update(interactionRef, {
            status: 'validated',
            validatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Remove the rejection penalty from follower
        // AND Add the 'following' count (since it's now valid)
        batch.update(followerRef, {
            rejectedCount: firebase.firestore.FieldValue.increment(-1),
            followingCount: firebase.firestore.FieldValue.increment(1)
        });

        // 3. Add 'follower' count to followed
        batch.update(followedRef, {
            followersCount: firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();

    } catch (error: any) {
        console.error("Error undoing rejection:", error);
        throw new Error("Erro ao reverter rejeição.");
    }
};

// NEW: Report Unfollow (Reverse a validation and apply penalty)
export const reportUnfollow = async (interactionId: string, offenderId: string, reporterId: string): Promise<void> => {
    const batch = firestore.batch();
    const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
    const offenderRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(offenderId);
    const reporterRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(reporterId);

    try {
        const interactionSnap = await interactionRef.get();
        if (!interactionSnap.exists) throw new Error("Interação não encontrada.");
        const data = interactionSnap.data() as FollowInteraction;

        if (data.status !== 'validated') {
            throw new Error("Esta interação não está validada, não é possível reportar unfollow.");
        }

        // 1. Update interaction status to 'unfollowed' (distinct from 'rejected' which implies never followed)
        batch.update(interactionRef, {
            status: 'unfollowed',
            validatedAt: firebase.firestore.FieldValue.serverTimestamp() // Update timestamp of status change
        });

        // 2. Penalize offender (the one who unfollowed)
        // Decrement 'followingCount' (since they aren't following anymore)
        // Increment 'rejectedCount' (as a penalty/strike)
        batch.update(offenderRef, {
            followingCount: firebase.firestore.FieldValue.increment(-1),
            rejectedCount: firebase.firestore.FieldValue.increment(1)
        });

        // 3. Remove follower count from reporter (me)
        batch.update(reporterRef, {
            followersCount: firebase.firestore.FieldValue.increment(-1)
        });

        await batch.commit();

    } catch (error: any) {
        console.error("Error reporting unfollow:", error);
        throw new Error("Erro ao reportar que parou de seguir.");
    }
};

// --- Admin Functions ---

export const getAllParticipantsForAdmin = async (organizationId: string): Promise<FollowLoopParticipant[]> => {
    try {
        // New function to fetch detailed history
        const q = firestore.collection(COLLECTION_PARTICIPANTS)
            .where('organizationId', '==', organizationId);
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowLoopParticipant));
    } catch (error: any) {
        console.error("Error fetching participants for admin:", error);
        throw new Error("Falha ao buscar participantes.");
    }
}

export const getAllFollowInteractions = async (organizationId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('organizationId', '==', organizationId)
            .orderBy('createdAt', 'desc')
            .limit(1000); // Increased limit for better history view
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    } catch (error: any) {
        console.error("Error fetching interactions history:", error);
        // Fallback without sort if index is missing
         try {
            const q2 = firestore.collection(COLLECTION_INTERACTIONS)
                .where('organizationId', '==', organizationId)
                .limit(500);
            const snap2 = await q2.get();
            const results = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
            // manual sort
            results.sort((a, b) => {
                const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
                const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
                return timeB - timeA;
            });
            return results;
        } catch (e) {
            throw new Error("Falha ao buscar histórico de interações.");
        }
    }
}

export const toggleParticipantBan = async (participantId: string, isBanned: boolean): Promise<void> => {
    try {
        await firestore.collection(COLLECTION_PARTICIPANTS).doc(participantId).update({
            isBanned: isBanned,
            isActive: !isBanned // If banned, set inactive.
        });
    } catch (error: any) {
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
            followedInstagram: followed.instagram, // Ensure this is saved
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

    } catch (error: any) {
        console.error("Error admin creating follow:", error);
        if (error instanceof Error) throw error;
        throw new Error("Falha ao criar conexão manual.");
    }
}