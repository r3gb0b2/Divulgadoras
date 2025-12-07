
                const postPayload: ScheduledPostData = {
                    campaignName: campaign.name,
                    eventName: eventName.trim() || undefined,
                    stateAbbr: campaign.stateAbbr,
                    type: postType,
                    textContent: postType === 'text' ? undefined : (textContent || undefined), // Don't send textContent for interaction posts if we want to rely on link
                    instructions,
                    postLink: postLink.trim() || undefined,
                    isActive,
                    expiresAt: expiryTimestamp ? firebase.firestore.Timestamp.fromDate(expiryTimestamp) : null,
                    autoAssignToNewPromoters: autoAssign,
                    allowLateSubmissions,
                    allowImmediateProof,
                    postFormats,
                    skipProofRequirement,
                    allowJustification,
                    googleDriveUrl: googleDriveUrl.trim() || undefined,
                    mediaUrl: originalMediaPath || null, // Will be updated inside createPost service if file provided
                };
    
                if (isScheduling) {