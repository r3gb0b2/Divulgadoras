
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export type Timestamp = firebase.firestore.Timestamp;
export type FieldValue = firebase.firestore.FieldValue;

export type PromoterStatus = 'pending' | 'approved' | 'rejected' | 'rejected_editable' | 'removed';
export type CampaignStatus = 'active' | 'inactive' | 'hidden';
export type AdminRole = 'superadmin' | 'admin' | 'approver' | 'viewer' | 'poster' | 'recovery';
export type OrganizationStatus = 'active' | 'trial' | 'deactivated' | 'hidden';
export type PlanId = 'basic' | 'professional';

export type RecoveryStatus = 'none' | 'contacted' | 'purchased' | 'no_response';

// Fix: Added missing properties to Promoter interface
export interface Promoter {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  tiktok?: string;
  dateOfBirth: string;
  taxId: string; // CPF
  address?: {
    zipCode: string;
    street: string;
    number: string;
    city: string;
  };
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
  fcmToken?: string; 
  // Add missing properties for VIP and Recovery
  emocoesStatus?: 'pending' | 'confirmed';
  emocoesBenefitActive?: boolean;
  emocoesBenefitCode?: string;
  recoveryStatus?: RecoveryStatus;
  recoveryAdminEmail?: string;
  recoveryUpdatedAt?: Timestamp | FieldValue;
  pushDiagnostics?: {
    platform: string;
    [key: string]: any;
  };
  lastTokenUpdate?: Timestamp | FieldValue;
}

// Fix: Added PromoterStats interface for dashboard sorting and calculations
export interface PromoterStats extends Promoter {
  assigned: number;
  completed: number;
  justifications: number;
  missed: number;
  completionRate: number;
}

// Fix: Added missing properties to Campaign interface
export interface Campaign {
  id: string;
  organizationId: string;
  stateAbbr: string;
  name: string;
  description: string;
  whatsappLink: string;
  rules: string;
  status: CampaignStatus;
  // Guest list related fields
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] };
  guestListTypes?: string[];
  preventDuplicateInOrg?: boolean;
  pixelId?: string;
}

// Fix: Added missing properties to Organization interface
export interface Organization {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  status: OrganizationStatus;
  planId: PlanId;
  createdAt: Timestamp | FieldValue;
  // Configuration toggles
  assignedStates?: string[];
  ownerName?: string;
  ownerPhone?: string;
  ownerTaxId?: string;
  followLoopThreshold?: number;
  emailRemindersEnabled?: boolean;
  oneTimePostEnabled?: boolean;
  guestListManagementEnabled?: boolean;
  guestListCheckinEnabled?: boolean;
  public?: boolean;
  planExpiresAt?: Timestamp | FieldValue;
}

// Fix: Added assignedCampaigns to AdminUserData
export interface AdminUserData {
  uid: string;
  email: string;
  role: AdminRole;
  organizationIds?: string[];
  assignedStates?: string[];
  assignedCampaigns?: { [stateAbbr: string]: string[] };
}

// Fix: Added missing interfaces for various features
export interface RejectionReason {
  id: string;
  text: string;
  organizationId: string;
}

export interface AdminApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Timestamp | FieldValue;
}

export interface StatesConfig {
  [stateAbbr: string]: StateConfig;
}

export interface StateConfig {
  isActive: boolean;
  rules: string;
}

export interface InstructionTemplate {
  id: string;
  text: string;
  organizationId: string;
  createdAt: Timestamp | FieldValue;
}

export interface LinkTemplate {
  id: string;
  name: string;
  url: string;
  organizationId: string;
  createdAt: Timestamp | FieldValue;
}

export interface PushReminder {
  id: string;
  promoterId: string;
  fcmToken: string;
  title: string;
  body: string;
  url: string;
  scheduledFor: Timestamp;
  status: 'pending' | 'sent' | 'error';
  assignmentId: string;
}

export interface WhatsAppReminder {
  id: string;
  promoterId: string;
  promoterName: string;
  promoterWhatsapp: string;
  postCampaignName: string;
  organizationId: string;
  sendAt: Timestamp;
  status: 'pending' | 'sent' | 'error';
  error?: string;
}

export interface OneTimePost {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  eventName: string;
  guestListName: string;
  type: 'image' | 'text' | 'video';
  instructions: string;
  isActive: boolean;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
  expiresAt: Timestamp | null;
  submissionLimit?: number;
  submissionCount?: number;
  successMessage?: string;
  femaleOnly?: boolean;
  askEmail?: boolean;
  textContent?: string;
  mediaUrl?: string;
  googleDriveUrl?: string;
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

export interface ScheduledPost {
  id: string;
  organizationId: string;
  postData: ScheduledPostData;
  assignedPromoters: { id: string; email: string; name: string }[];
  scheduledAt: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  error?: string;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
}

export interface ScheduledPostData extends Omit<Post, 'id' | 'createdAt' | 'organizationId' | 'createdByEmail'> {
  textContent?: string;
  googleDriveUrl?: string;
}

export interface GuestList {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  stateAbbr: string;
  name: string;
  description: string;
  guestAllowance: number;
  startsAt: Timestamp | null;
  closesAt: Timestamp | null;
  isActive: boolean;
  askEmail: boolean;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
  assignments?: { 
    [promoterId: string]: { 
      guestAllowance: number; 
      info?: string; 
      closesAt?: Timestamp | FieldValue | null 
    } 
  };
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
  promoterWhatsapp?: string;
  listName: string;
  isPromoterAttending: boolean;
  guestNames: string[];
  guests?: { name: string; email: string }[];
  confirmedAt: Timestamp | FieldValue;
  isLocked: boolean;
  promoterCheckedInAt?: Timestamp | FieldValue | null;
  promoterCheckedOutAt?: Timestamp | FieldValue | null;
  guestsCheckedIn?: { name: string; checkedInAt: Timestamp | FieldValue; checkedOutAt: Timestamp | FieldValue | null }[];
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

export interface FollowLoop {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  isActive: boolean;
  createdAt: Timestamp | FieldValue;
}

export interface FollowLoopParticipant {
  id: string;
  loopId: string;
  promoterId: string;
  promoterName: string;
  instagram: string;
  photoUrl: string;
  organizationId: string;
  isActive: boolean;
  isBanned: boolean;
  joinedAt: Timestamp | FieldValue;
  lastActiveAt: Timestamp | FieldValue;
  followersCount: number;
  followingCount: number;
  rejectedCount: number;
  state: string;
}

export interface FollowInteraction {
  id: string;
  loopId: string;
  followerId: string;
  followedId: string;
  organizationId: string;
  status: 'pending_validation' | 'validated' | 'rejected' | 'unfollowed';
  createdAt: Timestamp | FieldValue;
  validatedAt?: Timestamp | FieldValue;
  followerName: string;
  followerInstagram: string;
  followedName: string;
  followedInstagram: string;
}

export interface GroupRemovalRequest {
  id: string;
  promoterId: string;
  promoterName: string;
  promoterEmail: string;
  campaignName: string;
  organizationId: string;
  status: 'pending' | 'completed' | 'ignored';
  requestedAt: Timestamp | FieldValue;
  actionTakenBy?: string;
  actionTakenAt?: Timestamp | FieldValue;
}

export interface NewsletterLog {
  id: string;
  subject: string;
  body: string;
  sentAt: Timestamp | FieldValue;
  targetCount: number;
  targetDescription: string;
  createdByEmail: string;
}

export interface PromoterApplicationData {
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  taxId: string;
  dateOfBirth: string;
  address?: {
    zipCode: string;
    street: string;
    number: string;
    city: string;
  };
  photos: File[];
  state: string;
  organizationId: string;
  campaignName?: string;
  id?: string;
}

// Re-defining Post interface to match usage and prevent property errors
export interface Post { 
  id: string; 
  campaignName: string; 
  eventName?: string;
  stateAbbr: string;
  instructions: string; 
  type: 'text' | 'image' | 'video'; 
  mediaUrl?: string; 
  googleDriveUrl?: string;
  isActive: boolean; 
  createdByEmail: string; 
  createdAt: Timestamp | FieldValue; 
  expiresAt: Timestamp | null; 
  autoAssignToNewPromoters?: boolean; 
  allowJustification?: boolean; 
  ownerOnly?: boolean; 
  allowLateSubmissions?: boolean; 
  allowImmediateProof?: boolean; 
  skipProofRequirement?: boolean; 
  postFormats?: string[]; 
  organizationId: string;
  copyLink?: string;
  postLink?: string;
}

export interface PostAssignment { 
  id: string; 
  postId: string; 
  promoterId: string; 
  promoterName: string; 
  promoterEmail: string; 
  status: string; 
  proofSubmittedAt?: Timestamp | FieldValue; 
  proofImageUrls?: string[]; 
  justification?: string; 
  justificationStatus?: string | null; 
  justificationSubmittedAt?: Timestamp | FieldValue | null;
  justificationResponse?: string;
  justificationImageUrls?: string[];
  confirmedAt?: Timestamp | FieldValue; 
  post: Post; 
  organizationId: string; 
  reminderScheduled?: boolean;
}

export interface VipMembership { 
  id: string; 
  vipEventId: string; 
  vipEventName: string; 
  promoterId: string; 
  promoterName: string; 
  promoterEmail: string; 
  status: string; 
  benefitCode?: string; 
  isBenefitActive: boolean; 
  submittedAt: Timestamp | FieldValue; 
  updatedAt: Timestamp | FieldValue; 
  promoterWhatsapp?: string; 
  eventTime?: string; 
  eventLocation?: string; 
  viewedAt?: Timestamp | FieldValue;
  downloadedAt?: Timestamp | FieldValue;
  recoveryStatus?: RecoveryStatus;
  recoveryAdminEmail?: string;
  recoveryUpdatedAt?: Timestamp | FieldValue;
}

export interface VipEvent { 
  id: string; 
  name: string; 
  price: number; 
  isActive: boolean; 
  benefits: string[]; 
  externalSlug?: string; 
  eventTime?: string; 
  eventLocation?: string; 
  isSoldOut?: boolean; 
  createdAt: Timestamp | FieldValue;
}
