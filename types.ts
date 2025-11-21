
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
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] };
  guestListTypes?: string[];
  pixelId?: string;
}

export type AdminRole = 'superadmin' | 'admin' | 'viewer' | 'poster';

export interface AdminUserData {
  uid: string;
  email: string;
  role: AdminRole;
  assignedStates: string[];
  organizationIds?: string[];
  assignedCampaigns?: { [stateAbbr: string]: string[] };
}

export type OrganizationStatus = 'active' | 'trial' | 'hidden' | 'deactivated';

export type PlanId = 'basic' | 'professional';

export interface Organization {
  id: string;
  name: string;
  ownerName?: string;
  ownerEmail: string;
  ownerUid: string;
  status: OrganizationStatus;
  planId: PlanId;
  planExpiresAt?: Timestamp;
  createdAt?: Timestamp | FieldValue;
  public: boolean;
  assignedStates: string[];
  ownerPhone?: string;
  ownerTaxId?: string;
  emailRemindersEnabled?: boolean;
  oneTimePostEnabled?: boolean;
  guestListManagementEnabled?: boolean;
  guestListCheckinEnabled?: boolean;
  followLoopThreshold?: number;
  usageStats?: {
      emailsSent: number;
  };
}

export interface StateConfig {
  isActive: boolean;
  rules: string;
}

export interface StatesConfig {
  [stateAbbr: string]: StateConfig;
}

export interface AdminApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  message?: string;
  createdAt?: Timestamp;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  priceFormatted: string;
  description: string;
  features: string[];
  isPopular: boolean;
}

export interface Post {
  id: string;
  organizationId: string;
  campaignName: string;
  eventName?: string;
  stateAbbr: string;
  type: 'image' | 'text' | 'video';
  mediaUrl?: string;
  googleDriveUrl?: string;
  textContent?: string;
  instructions: string;
  postLink?: string;
  createdAt: Timestamp | FieldValue;
  createdByEmail: string;
  isActive: boolean;
  expiresAt: Timestamp | FieldValue | null;
  autoAssignToNewPromoters?: boolean;
  allowLateSubmissions?: boolean;
  allowImmediateProof?: boolean;
  postFormats?: ('story' | 'reels')[];
  skipProofRequirement?: boolean;
  allowJustification?: boolean;
}

export interface PostAssignment {
  id: string;
  postId: string;
  post: {
    type: 'image' | 'text' | 'video';
    mediaUrl?: string;
    googleDriveUrl?: string;
    textContent?: string;
    instructions: string;
    postLink?: string;
    campaignName: string;
    eventName?: string;
    isActive: boolean;
    expiresAt: Timestamp | FieldValue | null;
    createdAt: Timestamp | FieldValue;
    allowLateSubmissions?: boolean;
    autoAssignToNewPromoters?: boolean;
    allowImmediateProof?: boolean;
    postFormats?: ('story' | 'reels')[];
    skipProofRequirement?: boolean;
    allowJustification?: boolean;
  };
  organizationId: string;
  promoterId: string;
  promoterEmail: string;
  promoterName: string;
  status: 'pending' | 'confirmed';
  confirmedAt: Timestamp | FieldValue | null;
  proofImageUrls?: string[];
  proofSubmittedAt: Timestamp | FieldValue | null;
  justification?: string;
  justificationStatus?: 'pending' | 'accepted' | 'rejected' | null;
  justificationSubmittedAt?: Timestamp | FieldValue | null;
  justificationImageUrls?: string[];
  justificationResponse?: string;
}

export interface GuestList {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  stateAbbr: string;
  name: string;
  description?: string;
  guestAllowance: number;
  startsAt: Timestamp | FieldValue | null;
  closesAt: Timestamp | FieldValue | null;
  isActive: boolean;
  askEmail?: boolean;
  createdAt: Timestamp | FieldValue;
  createdByEmail: string;
  assignments?: { [promoterId: string]: { guestAllowance: number; info?: string; closesAt?: Timestamp | FieldValue | null; } };
}

export interface GuestListConfirmation {
    id: string;
    organizationId: string;
    campaignId: string;
    campaignName: string;
    guestListId?: string;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    listName: string;
    isPromoterAttending: boolean;
    guestNames: string[]; // Legacy support
    guests?: { name: string; email: string }[]; // New structure
    confirmedAt: Timestamp | FieldValue;
    promoterCheckedInAt?: Timestamp | FieldValue | null;
    promoterCheckedOutAt?: Timestamp | FieldValue | null;
    guestsCheckedIn?: { name: string; checkedInAt: Timestamp | FieldValue; checkedOutAt?: Timestamp | FieldValue | null; }[];
    isLocked?: boolean;
}

export interface PromoterStats extends Promoter {
  assigned: number;
  completed: number;
  justifications: number;
  missed: number;
  completionRate: number;
}

export interface ScheduledPostData {
  campaignName: string;
  eventName?: string;
  stateAbbr: string;
  type: 'image' | 'text' | 'video';
  mediaUrl?: string | null;
  googleDriveUrl?: string;
  textContent?: string;
  instructions: string;
  postLink?: string;
  isActive: boolean;
  expiresAt: Timestamp | FieldValue | null;
  autoAssignToNewPromoters?: boolean;
  allowLateSubmissions?: boolean;
  allowImmediateProof?: boolean;
  postFormats?: ('story' | 'reels')[];
  skipProofRequirement?: boolean;
  allowJustification?: boolean;
}

export interface ScheduledPost {
  id: string;
  organizationId: string;
  postData: ScheduledPostData;
  assignedPromoters: { id: string, email: string, name:string }[];
  scheduledAt: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  createdByEmail: string;
  error?: string;
}

export interface InstructionTemplate {
  id: string;
  text: string;
  organizationId: string;
  createdAt?: Timestamp | FieldValue;
}

export interface LinkTemplate {
  id: string;
  name: string;
  url: string;
  organizationId: string;
  createdAt?: Timestamp | FieldValue;
}

export interface OneTimePost {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  eventName?: string;
  guestListName: string;
  type: 'image' | 'text' | 'video';
  mediaUrl?: string;
  googleDriveUrl?: string;
  textContent?: string;
  instructions: string;
  createdAt: Timestamp | FieldValue;
  createdByEmail: string;
  isActive: boolean;
  expiresAt?: Timestamp | FieldValue | null;
  submissionCount?: number;
  submissionLimit?: number;
  successMessage?: string;
  femaleOnly?: boolean;
  askEmail?: boolean;
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
  actionTakenAt?: Timestamp | FieldValue;
  actionTakenBy?: string;
}

// --- Follow Loop Types ---

export interface FollowLoopParticipant {
  id: string;
  promoterId: string;
  promoterName: string;
  instagram: string;
  photoUrl: string;
  organizationId: string;
  isActive: boolean;
  isBanned?: boolean;
  joinedAt: Timestamp | FieldValue;
  lastActiveAt: Timestamp | FieldValue;
  followersCount: number;
  followingCount: number;
  rejectedCount?: number;
  state?: string;
}

export interface FollowInteraction {
  id: string;
  followerId: string;
  followedId: string;
  organizationId: string;
  status: 'pending_validation' | 'validated' | 'rejected' | 'unfollowed';
  createdAt: Timestamp | FieldValue;
  validatedAt?: Timestamp | FieldValue | null;
  followerName: string;
  followerInstagram: string;
  followedName: string;
  followedInstagram?: string;
}
