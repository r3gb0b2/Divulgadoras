
import firebase from 'firebase/compat/app';
import { firestore } from '../firebase/config';
import { FollowLoopParticipant, FollowInteraction, Timestamp, FollowLoop } from '../types';
import { getPromoterById } from './promoterService';

const COLLECTION_LOOPS = 'followLoops';
const COLLECTION_PARTICIPANTS = 'followLoopParticipants';
const COLLECTION_INTERACTIONS = 'followInteractions';

// --- Loop Management (Admin) ---

export const createFollowLoop = async (data: Omit<FollowLoop, 'id' | 'createdAt'>): Promise<string> => {
    try {
        const docRef = await firestore.collection(COLLECTION_LOOPS).add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return docRef.id;
    } catch (error: any) {
        console.error("Error creating follow loop:", error);
        throw new Error("Falha ao criar conexão.");
    }
};

export const getFollowLoops = async (organizationId: string): Promise<FollowLoop[]> => {
    try {
        const q = firestore.collection(COLLECTION_LOOPS)
            .where('organizationId', '==', organizationId);
        const snapshot = await q.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowLoop));
    } catch (error: any) {
        console.error("Error getting follow loops:", error);
        throw new Error("Falha ao buscar conexões.");
    }
};

export const getFollowLoopById = async (loopId: string): Promise<FollowLoop | null> => {
    try {
        const doc = await firestore.collection(COLLECTION_LOOPS).doc(loopId).get();
        if (doc.exists) {
            return { id: doc.id, ...doc.data() } as FollowLoop;
        }
        return null;
    } catch (error) {
        console.error("Error getting loop:", error);
        return null;
    }
};

export const deleteFollowLoop = async (loopId: string): Promise<void> => {
    try {
        // Ideally this should delete sub-collections/related data via cloud function
        await firestore.collection(COLLECTION_LOOPS).doc(loopId).delete();
    } catch (error) {
         console.error("Error deleting loop:", error);
         throw new Error("Falha ao deletar conexão.");
    }
};

export const updateFollowLoop = async (loopId: string, data: Partial<FollowLoop>): Promise<void> => {
    try {
        await firestore.collection(COLLECTION_LOOPS).doc(loopId).update(data);
    } catch (error) {
        console.error("Error updating loop:", error);
        throw new Error("Falha ao atualizar conexão.");
    }
};

// --- Participant Management ---

export const joinFollowLoop = async (promoterId: string, loopId: string): Promise<void> => {
  try {
    const promoter = await getPromoterById(promoterId);
    if (!promoter) throw new Error('Divulgadora não encontrada.');

    // Composite ID to allow promoter to join multiple loops
    const participantDocId = `${loopId}_${promoterId}`;
    const participantRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(participantDocId);
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
        id: participantDocId,
        loopId: loopId,
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

export const getParticipantStatus = async (promoterId: string, loopId: string): Promise<FollowLoopParticipant | null> => {
  try {
    const participantDocId = `${loopId}_${promoterId}`;
    const doc = await firestore.collection(COLLECTION_PARTICIPANTS).doc(participantDocId).get();
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

export const getNextProfileToFollow = async (currentPromoterId: string, loopId: string, organizationId: string, stateFilter?: string): Promise<FollowLoopParticipant | null> => {
  try {
    const currentParticipantId = `${loopId}_${currentPromoterId}`;

    const interactionsQuery = firestore.collection(COLLECTION_INTERACTIONS)
      .where('loopId', '==', loopId)
      .where('followerId', '==', currentParticipantId);
    
    const interactionsSnap = await interactionsQuery.get();
    const followedParticipantIds = new Set<string>();
    followedParticipantIds.add(currentParticipantId); // Don't follow self
    interactionsSnap.forEach(doc => {
      followedParticipantIds.add(doc.data().followedId);
    });

    let potentialQuery = firestore.collection(COLLECTION_PARTICIPANTS)
      .where('loopId', '==', loopId)
      .limit(2000); 

    const potentialSnap = await potentialQuery.get();
    
    const candidates: FollowLoopParticipant[] = [];
    potentialSnap.forEach(doc => {
      const data = doc.data();
      
      // Strict In-Memory Check to prevent mixed states if loop spans multiple (optional)
      if (stateFilter && data.state && data.state !== stateFilter) {
          return; 
      }
      
      if (
          !followedParticipantIds.has(doc.id) && 
          data.isActive === true && 
          data.isBanned === false
      ) {
         candidates.push({ id: doc.id, ...data } as FollowLoopParticipant);
      }
    });
    
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

export const registerFollow = async (followerId: string, followedId: string, loopId: string): Promise<void> => {
  try {
    // These IDs are the composite IDs from participant records
    const interactionId = `${followerId}_${followedId}`;
    const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);

    // Fetch participant details to denormalize names/handles
    const followerRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followerId);
    const followedRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followedId);
    
    const [followerSnap, followedSnap] = await Promise.all([followerRef.get(), followedRef.get()]);

    if (!followerSnap.exists || !followedSnap.exists) throw new Error("Participantes inválidos.");
    
    const followerData = followerSnap.data() as FollowLoopParticipant;
    const followedData = followedSnap.data() as FollowLoopParticipant;

    const interaction: FollowInteraction = {
      id: interactionId,
      loopId,
      followerId,
      followedId,
      organizationId: followerData.organizationId,
      status: 'pending_validation',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      followerName: followerData.promoterName,
      followerInstagram: followerData.instagram,
      followedName: followedData.promoterName,
      followedInstagram: followedData.instagram,
    };

    await interactionRef.set(interaction);

    await followerRef.update({
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (error: any) {
    console.error('Error registering follow:', error);
    throw new Error('Não foi possível registrar a ação.');
  }
};

// --- Validation Flow ---

export const getPendingValidations = async (participantId: string): Promise<FollowInteraction[]> => {
  try {
    const q = firestore.collection(COLLECTION_INTERACTIONS)
      .where('followedId', '==', participantId)
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

export const getConfirmedFollowers = async (participantId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followedId', '==', participantId)
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

export const getRejectedFollowsReceived = async (participantId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followerId', '==', participantId)
            .where('status', '==', 'rejected');
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    } catch (error: any) {
        console.error("Error getting rejected follows received:", error);
        return [];
    }
};

export const getRejectedFollowsGiven = async (participantId: string): Promise<FollowInteraction[]> => {
    try {
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('followedId', '==', participantId)
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

export const updateParticipantInstagram = async (participantDocId: string, newInstagram: string): Promise<void> => {
  try {
    await firestore.collection(COLLECTION_PARTICIPANTS).doc(participantDocId).update({
      instagram: newInstagram.trim()
    });
  } catch (error: any) {
    console.error("Error updating instagram:", error);
    throw new Error("Falha ao atualizar Instagram.");
  }
};

// --- Admin Functions ---

export const getAllParticipantsForAdmin = async (organizationId: string, loopId: string): Promise<FollowLoopParticipant[]> => {
    try {
        const q = firestore.collection(COLLECTION_PARTICIPANTS)
            .where('organizationId', '==', organizationId)
            .where('loopId', '==', loopId);
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowLoopParticipant));
    } catch (error: any) {
        console.error("Error fetching participants for admin:", error);
        throw new Error("Falha ao buscar participantes.");
    }
}

export const getAllFollowInteractions = async (organizationId: string, loopId: string): Promise<FollowInteraction[]> => {
    try {
        // First try the optimal query that requires an index
        const q = firestore.collection(COLLECTION_INTERACTIONS)
            .where('loopId', '==', loopId)
            .orderBy('createdAt', 'desc')
            .limit(500);
        
        const snap = await q.get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
    } catch (error: any) {
        console.warn("Optimal interaction query failed (likely index missing). Falling back to client-side sort.", error.message);
        
        // Fallback: Query by loopId only, then sort in memory.
        try {
            const fallbackQ = firestore.collection(COLLECTION_INTERACTIONS)
                .where('loopId', '==', loopId)
                .limit(500); // Still limit to avoid fetching everything
            
            const snap = await fallbackQ.get();
            const interactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowInteraction));
            
            // Client-side sort
            interactions.sort((a, b) => {
                 const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
                 const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
                 return timeB - timeA;
            });
            
            return interactions;
        } catch (fallbackError: any) {
            console.error("Fallback interaction query failed:", fallbackError);
            return [];
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

// Admin manual creation needs participant IDs (composite), not promoter IDs
export const adminCreateFollowInteraction = async (followerParticipantId: string, followedParticipantId: string, loopId: string): Promise<void> => {
    try {
        if (followerParticipantId === followedParticipantId) throw new Error("Uma divulgadora não pode seguir a si mesma.");
        
        // We assume IDs passed are valid participant IDs from the table selection
        const followerRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followerParticipantId);
        const followedRef = firestore.collection(COLLECTION_PARTICIPANTS).doc(followedParticipantId);

        const [followerSnap, followedSnap] = await Promise.all([followerRef.get(), followedRef.get()]);

        if (!followerSnap.exists || !followedSnap.exists) throw new Error("Participantes inválidos.");

        const follower = followerSnap.data() as FollowLoopParticipant;
        const followed = followedSnap.data() as FollowLoopParticipant;

        const interactionId = `${followerParticipantId}_${followedParticipantId}`;
        const interactionRef = firestore.collection(COLLECTION_INTERACTIONS).doc(interactionId);
        
        const exists = (await interactionRef.get()).exists;
        if (exists) throw new Error("Esta conexão já existe.");

        const batch = firestore.batch();
        const interaction: FollowInteraction = {
            id: interactionId,
            loopId,
            followerId: followerParticipantId,
            followedId: followedParticipantId,
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
        batch.update(followerRef, {
            followingCount: firebase.firestore.FieldValue.increment(1)
        });
        batch.update(followedRef, {
            followersCount: firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();
    } catch (error: any) {
        console.error("Error admin creating follow:", error);
        if (error instanceof Error) throw error;
        throw new Error("Falha ao criar conexão manual.");
    }
}
