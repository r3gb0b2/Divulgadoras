
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
      const data = docSnap.data();
      if (data?.isBanned) {
          throw new Error("Você foi removida desta dinâmica. Entre em contato com a administração.");
      }

      await participantRef.update({
        isActive: true,
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
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
    const interactionsQuery = firestore.collection(COLLECTION_INTERACTIONS)
      .where('followerId', '==', currentPromoterId);
    
    const interactionsSnap = await interactionsQuery.get();
    const followedIds = new Set<string>();
    followedIds.add(currentPromoterId);
    interactionsSnap.forEach(doc => {
      followedIds.add(doc.data().followedId);
    });

    let potentialQuery = firestore.collection(COLLECTION_PARTICIPANTS)
      .where('organizationId', '==', organizationId)
      .limit(2000); 

    if (stateFilter) {
        potentialQuery = potentialQuery.where('state', '==', stateFilter);
    }

    const potentialSnap = await potentialQuery.get();
    
    const candidates: FollowLoopParticipant[] = [];
    potentialSnap.forEach(doc => {
      const data = doc.data();
      
      // Strict In-Memory Check to prevent mixed states
      if (stateFilter && data.state && data.state !== stateFilter) {
          return; 
      }
      
      if (
          !followedIds.has(doc.id) && 
          data.isActive === true && 
          data.isBanned === false
      ) {
         candidates.push({ id: doc.id, ...data } as FollowLoopParticipant);
      }
    });

    if (candidates.length === 0 && stateFilter) {
         // Fallback for legacy records without state field
         const broadQuery = firestore.collection(COLLECTION_PARTICIPANTS)
            .where('organizationId', '==', organizationId)
            .limit(500);
         const broadSnap = await broadQuery.get();
         broadSnap.forEach(doc => {
             const data = doc.data();
             if (!followedIds.has(doc.id) && data.isActive === true && data.isBanned === false && !data.state) {
                 candidates.push({ id: doc.id, ...data } as FollowLoopParticipant);
             }
         });
    }
    
    if (candidates.length === 0) return null;

    // Fisher-Yates Shuffle
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
      followedInstagram: followed.instagram,
    };

    await interactionRef.set(interaction);

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
            .limit(50);

        const snap = await q.get();
        const followers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
        
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

export const getRejectedFollowsReceived = async (promoterId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followerId', '==', promoterId)
            .where('status', '==', 'rejected');
        
        const snap = await q.get();
        const interactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));

        // Enrichment for legacy data: if followedInstagram is missing, fetch it from participant profile
        const missingInfo = interactions.filter(i => !i.followedInstagram);
        if (missingInfo.length > 0) {
            const idsToFetch: string[] = Array.from(new Set(missingInfo.map(i => i.followedId)));
            const profiles = await Promise.all(idsToFetch.map(id => getParticipantStatus(id)));
            const profileMap = new Map<string, FollowLoopParticipant>();
            profiles.forEach(p => { if (p) profileMap.set(p.id, p); });

            interactions.forEach(i => {
                if (!i.followedInstagram && profileMap.has(i.followedId)) {
                    const p = profileMap.get(i.followedId)!;
                    i.followedInstagram = p.instagram;
                    i.followedName = p.promoterName;
                }
            });
        }

        return interactions;
    } catch (error: any) {
        console.error("Error getting rejected follows received:", error);
        return [];
    }
};

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
    const followedRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(interactionData.followedId);

    const status = isValid ? 'validated' : 'rejected';
    
    batch.update(interactionRef, {
      status,
      validatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (isValid) {
         batch.update(followerRef, {
             followingCount: firebase.firestore.FieldValue.increment(1)
         });
         batch.update(followedRef, {
             followersCount: firebase.firestore.FieldValue.increment(1)
         });
    } else {
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

        batch.update(interactionRef, {
            status: 'validated',
            validatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.update(followerRef, {
            rejectedCount: firebase.firestore.FieldValue.increment(-1),
            followingCount: firebase.firestore.FieldValue.increment(1)
        });

        batch.update(followedRef, {
            followersCount: firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();

    } catch (error: any) {
        console.error("Error undoing rejection:", error);
        throw new Error("Erro ao reverter rejeição.");
    }
};

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

        batch.update(interactionRef, {
            status: 'unfollowed',
            validatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.update(offenderRef, {
            followingCount: firebase.firestore.FieldValue.increment(-1),
            rejectedCount: firebase.firestore.FieldValue.increment(1)
        });

        batch.update(reporterRef, {
            followersCount: firebase.firestore.FieldValue.increment(-1)
        });

        await batch.commit();

    } catch (error: any) {
        console.error("Error reporting unfollow:", error);
        throw new Error("Erro ao reportar que parou de seguir.");
    }
};

export const updateParticipantInstagram = async (promoterId: string, newInstagram: string): Promise<void> => {
  try {
    await firestore.collection(COLLECTION_PARTICIPANTS).doc(promoterId).update({
      instagram: newInstagram.trim()
    });
  } catch (error: any) {
    console.error("Error updating instagram:", error);
    throw new Error("Falha ao atualizar Instagram.");
  }
};

// --- Admin Functions ---

export const getAllParticipantsForAdmin = async (organizationId: string): Promise<FollowLoopParticipant[]> => {
    try {
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
            .limit(1000);
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    } catch (error: any) {
        console.error("Error fetching interactions history (fallback):", error);
         try {
            const q2 = firestore.collection(COLLECTION_INTERACTIONS)
                .where('organizationId', '==', organizationId)
                .limit(500);
            const snap2 = await q2.get();
            const results = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
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
            isActive: !isBanned 
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
        
        const exists = (await interactionRef.get()).exists;
        if (exists) throw new Error("Esta conexão já existe.");

        const batch = firestore.batch();
        const interaction: FollowInteraction = {
            id: interactionId,
            followerId,
            followedId,
            organizationId: follower.organizationId,
            status: 'validated', 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            validatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            followerName: follower.promoterName,
            followerInstagram: follower.instagram,
            followedName: followed.promoterName,
            followedInstagram: followed.instagram, 
        };

        batch.set(interactionRef, interaction);
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
