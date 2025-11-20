
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export type Timestamp = firebase.firestore.Timestamp;
export type FieldValue = firebase.firestore.FieldValue;

export type PromoterStatus = 'pending' | 'approved' | 'rejected' | 'rejected_editable' | 'removed';

export interface Promoter {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  tiktok?: string;
  dateOfBirth: string;
  photoUrls: string[];
  facePhotoUrl?: string;
  status: PromoterStatus;
  createdAt: Timestamp | FieldValue;
  state: string;
  campaignName: string | null;
  associatedCampaigns?: string[];
  allCampaigns?: string[];
  organizationId: string;
  rejectionReason?: string;
  hasJoinedGroup?: boolean;
  actionTakenByUid?: string;
  actionTakenByEmail?: string;
  statusChangedAt?: Timestamp | FieldValue;
  observation?: string;
  lastManualNotificationAt?: Timestamp | FieldValue | null;
}

export interface PromoterStats extends Promoter {
    assigned: number;
    completed: number;
    missed: number;
    justifications: number;
    acceptedJustifications: number;
    pending: number;
    completionRate: number;
}

export interface PromoterApplicationData {
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  dateOfBirth: string;
  photos: File[];
  facePhoto: File | null;
  state: string;
  campaignName?: string;
  organizationId: string;
}

export interface RejectionReason {
  id: string;
  text: string;
  organizationId: string;
}

export type CampaignStatus = 'active' | 'inactive' | 'hidden';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  whatsappLink: string;
  rules: string;
  stateAbbr: string;
  organizationId: string;
  associatedAdmins?: string[];
  // FIX: Add guest list properties to Campaign type to support guest list access control.
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] };
  guestListTypes?: string[];
  pixelId?: string;
  preventDuplicateApprovals?: boolean; // New field
}

export type AdminRole = 'superadmin' | 'admin' | 'viewer' | 'poster';

export interface AdminUserData {
  uid: string;
  email: string;
  role: AdminRole;
  assignedStates: string[];
  assignedCampaigns?: { [stateAbbr: string]: string[] };
  organizationIds?: string[]; 
}

export interface StatesConfig {
  [abbr: string]: StateConfig;
}

export interface StateConfig {
  isActive: boolean;
  rules: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName?: string; // Added field
  ownerPhone?: string;
  ownerTaxId?: string; // CPF/CNPJ
  planId: PlanId;
  status: OrganizationStatus;
  createdAt: Timestamp | FieldValue;
  planExpiresAt: Timestamp | FieldValue; // Timestamp
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  assignedStates?: string[]; // Limits which states this org operates in
  public?: boolean; // If true, shows on public home page
  emailRemindersEnabled?: boolean;
  oneTimePostEnabled?: boolean;
  guestListManagementEnabled?: boolean;
  guestListCheckinEnabled?: boolean;
  followLoopThreshold?: number;
}

export type OrganizationStatus = 'active' | 'trial' | 'deactivated' | 'hidden';
export type PlanId = 'basic' | 'professional' | 'enterprise';

export interface Post {
    id: string;
    organizationId: string;
    campaignName: string;
    eventName?: string;
    stateAbbr: string;
    type: 'text' | 'image' | 'video';
    mediaUrl?: string; // Firebase Storage path
    googleDriveUrl?: string;
    textContent?: string;
    instructions: string;
    postLink?: string; // Link to the post/audio to use
    isActive: boolean;
    createdAt: Timestamp | FieldValue;
    expiresAt?: Timestamp | FieldValue | null;
    createdByEmail?: string;
    autoAssignToNewPromoters?: boolean;
    allowLateSubmissions?: boolean;
    allowImmediateProof?: boolean;
    postFormats?: ('story' | 'reels')[];
    skipProofRequirement?: boolean; // New field: if true, promoter clicks "I posted" and it auto-confirms without upload
}

export interface ScheduledPost {
    id: string;
    organizationId: string;
    status: 'pending' | 'sent' | 'error';
    scheduledAt: Timestamp | FieldValue;
    createdByEmail: string;
    error?: string;
    postData: ScheduledPostData;
    assignedPromoters: { id: string, email: string, name: string }[];
}

export type ScheduledPostData = Omit<Post, 'id' | 'createdAt' | 'organizationId' | 'createdByEmail'>;


export interface PostAssignment {
    id: string;
    postId: string;
    post: Post; // Denormalized post data snapshot
    organizationId: string;
    promoterId: string;
    promoterEmail: string;
    promoterName: string;
    status: 'pending' | 'confirmed'; // 'confirmed' means they said they will post
    confirmedAt?: Timestamp | FieldValue | null;
    proofSubmittedAt?: Timestamp | FieldValue | null;
    proofImageUrls?: string[];
    justification?: string;
    justificationStatus?: 'pending' | 'accepted' | 'rejected';
    justificationSubmittedAt?: Timestamp | FieldValue | null;
    justificationResponse?: string;
    justificationImageUrls?: string[];
}

export interface OneTimePost {
    id: string;
    organizationId: string;
    campaignId: string;
    campaignName: string;
    eventName: string; // Required for OneTimePost
    guestListName: string;
    type: 'text' | 'image' | 'video';
    mediaUrl?: string;
    googleDriveUrl?: string;
    textContent?: string;
    instructions: string;
    isActive: boolean;
    createdAt: Timestamp | FieldValue;
    createdByEmail: string;
    expiresAt?: Timestamp | FieldValue | null;
    submissionCount?: number;
    submissionLimit?: number | null;
    successMessage?: string;
    femaleOnly?: boolean;
}

export interface OneTimePostSubmission {
    id: string;
    oneTimePostId: string;
    organizationId: string;
    campaignId: string;
    guestName: string;
    email: string;
    instagram: string;
    proofImageUrls: string[];
    submittedAt: Timestamp | FieldValue;
}

export interface AdminApplication {
    id: string; // Same as the user's UID
    name: string;
    email: string;
    phone: string;
    message: string;
    createdAt: Timestamp | FieldValue;
}

export interface InstructionTemplate {
    id: string;
    text: string;
    organizationId: string;
    createdAt?: Timestamp | FieldValue;
}

export interface GuestList {
    id: string;
    organizationId: string;
    campaignId: string;
    campaignName: string;
    stateAbbr: string;
    name: string;
    description?: string;
    guestAllowance?: number; // Default allowance
    startsAt?: Timestamp | FieldValue | null;
    closesAt?: Timestamp | FieldValue | null;
    isActive: boolean;
    createdAt: Timestamp | FieldValue;
    createdByEmail?: string;
    assignments?: { [promoterId: string]: { guestAllowance: number, info?: string, closesAt?: Timestamp | FieldValue | null } };
}

export interface GuestListConfirmation {
    id: string;
    organizationId: string;
    campaignId: string;
    campaignName: string;
    guestListId: string; // ID of the GuestList definition
    listName: string;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    isPromoterAttending: boolean;
    guestNames: string[];
    confirmedAt: Timestamp | FieldValue;
    isLocked?: boolean; // If true, promoter cannot edit
    promoterCheckedInAt?: Timestamp | FieldValue | null;
    promoterCheckedOutAt?: Timestamp | FieldValue | null;
    guestsCheckedIn?: { name: string; checkedInAt: Timestamp | FieldValue; checkedOutAt?: Timestamp | FieldValue | null }[];
}

export interface GroupRemovalRequest {
    id: string;
    organizationId: string;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    campaignName: string;
    status: 'pending' | 'completed' | 'ignored';
    requestedAt: Timestamp | FieldValue;
    actionTakenBy?: string;
    actionTakenAt?: Timestamp | FieldValue;
}

export interface GuestListChangeRequest {
    id: string;
    organizationId: string;
    campaignId: string;
    guestListId: string;
    confirmationId: string;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    listName: string;
    campaignName: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: Timestamp | FieldValue;
    actionTakenBy?: string;
    actionTakenAt?: Timestamp | FieldValue;
}

export interface FollowLoopParticipant {
    id: string; // Usually the promoter ID
    promoterId: string;
    promoterName: string;
    instagram: string;
    photoUrl: string;
    organizationId: string;
    isActive: boolean;
    isBanned: boolean;
    joinedAt: Timestamp | FieldValue;
    lastActiveAt: Timestamp | FieldValue;
    followingCount: number; // How many they have followed (validated)
    followersCount: number; // How many followers they have gained
    rejectedCount: number; // How many times they were rejected (didn't follow back)
    state?: string; // Added for filtering
}

export interface FollowInteraction {
    id: string; // followerId_followedId
    followerId: string;
    followedId: string;
    organizationId: string;
    status: 'pending_validation' | 'validated' | 'rejected' | 'unfollowed';
    createdAt: Timestamp | FieldValue;
    validatedAt?: Timestamp | FieldValue;
    // Snapshots for UI
    followerName: string;
    followerInstagram: string;
    followedName: string;
    followedInstagram: string;
}