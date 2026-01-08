
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
    state: string;
  };
  facePhotoUrl: string; // Foto de rosto principal
  bodyPhotoUrls: string[]; // Outras fotos de look/corpo
  photoUrls: string[]; // Compatibilidade com código antigo (todas as fotos)
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

export interface PromoterStats extends Promoter {
  assigned: number;
  completed: number;
  justifications: number;
  missed: number;
  completionRate: number;
}

export interface Campaign {
  id: string;
  organizationId: string;
  stateAbbr: string;
  name: string;
  description: string;
  whatsappLink: string;
  rules: string;
  status: CampaignStatus;
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] };
  guestListTypes?: string[];
  pixelId?: string;
  preventDuplicateInOrg?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerTaxId?: string;
  status: OrganizationStatus;
  planId: PlanId;
  createdAt: Timestamp | FieldValue;
  assignedStates?: string[];
  public?: boolean;
  planExpiresAt?: Timestamp | FieldValue;
  oneTimePostEnabled?: boolean;
  guestListManagementEnabled?: boolean;
  guestListCheckinEnabled?: boolean;
  emailRemindersEnabled?: boolean;
  followLoopThreshold?: number;
}

export interface AdminUserData {
  uid: string;
  email: string;
  role: AdminRole;
  organizationIds?: string[];
  assignedStates?: string[];
  assignedCampaigns?: { [stateAbbr: string]: string[] };
}

// FIX: Added missing AdminApplication type
export interface AdminApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Timestamp | FieldValue;
}

// FIX: Added missing StateConfig type
export interface StateConfig {
  isActive: boolean;
  rules: string;
}

// FIX: Added missing StatesConfig type
export interface StatesConfig {
  [stateAbbr: string]: StateConfig;
}

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
  textContent?: string;
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
  completionRate?: number;
}

// FIX: Added missing PushReminder type
export interface PushReminder {
  id: string;
  promoterId: string;
  fcmToken: string;
  title: string;
  body: string;
  url: string;
  scheduledFor: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  assignmentId: string;
}

// FIX: Added missing OneTimePost type
export interface OneTimePost {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  eventName: string;
  guestListName: string;
  type: 'text' | 'image' | 'video';
  instructions: string;
  isActive: boolean;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
  expiresAt: Timestamp | null;
  submissionLimit?: number;
  successMessage?: string;
  femaleOnly?: boolean;
  askEmail?: boolean;
  textContent?: string;
  mediaUrl?: string;
  googleDriveUrl?: string;
  submissionCount?: number;
}

// FIX: Added missing OneTimePostSubmission type
export interface OneTimePostSubmission {
  id: string;
  oneTimePostId: string;
  organizationId: string;
  campaignId: string;
  guestName: string;
  email?: string;
  instagram: string;
  proofImageUrls: string[];
  submittedAt: Timestamp | FieldValue;
}

// FIX: Added missing ScheduledPost type
export interface ScheduledPost {
  id: string;
  organizationId: string;
  postData: ScheduledPostData;
  assignedPromoters: { id: string, email: string, name: string }[];
  scheduledAt: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  createdByEmail: string;
  error?: string;
}

// FIX: Added missing ScheduledPostData type
export interface ScheduledPostData {
  campaignName: string;
  eventName?: string;
  stateAbbr: string;
  type: 'text' | 'image' | 'video';
  textContent?: string;
  instructions: string;
  postLink?: string;
  copyLink?: string;
  isActive: boolean;
  expiresAt: Timestamp | null;
  autoAssignToNewPromoters?: boolean;
  allowLateSubmissions?: boolean;
  allowImmediateProof?: boolean;
  postFormats?: string[];
  skipProofRequirement?: boolean;
  allowJustification?: boolean;
  ownerOnly?: boolean;
  googleDriveUrl?: string;
  mediaUrl?: string;
}

// FIX: Added missing WhatsAppReminder type
export interface WhatsAppReminder {
  id: string;
  promoterId: string;
  promoterName: string;
  promoterWhatsapp: string;
  postCampaignName: string;
  organizationId: string;
  sendAt: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  error?: string;
}

// FIX: Added missing GuestListConfirmation type
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
  guests?: { name: string; email: string }[];
  guestNames?: string[];
  isLocked: boolean;
  confirmedAt: Timestamp | FieldValue;
  promoterCheckedInAt?: Timestamp | FieldValue | null;
  promoterCheckedOutAt?: Timestamp | FieldValue | null;
  guestsCheckedIn?: { name: string; checkedInAt: Timestamp | FieldValue; checkedOutAt: Timestamp | FieldValue | null }[];
}

// FIX: Added missing GuestList type
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
      closesAt?: Timestamp | FieldValue | null;
    }
  };
}

// FIX: Added missing GuestListChangeRequest type
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

// FIX: Added missing GroupRemovalRequest type
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

// FIX: Added missing FollowLoop type
export interface FollowLoop {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  isActive: boolean;
  createdAt: Timestamp | FieldValue;
}

// FIX: Added missing FollowLoopParticipant type
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

// FIX: Added missing FollowInteraction type
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

// FIX: Added missing AppleTestRegistrant type
export interface AppleTestRegistrant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  createdAt: Timestamp | FieldValue;
}

// FIX: Added missing GlobalList type
export interface GlobalList {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Timestamp | FieldValue;
  items: {
    organizationId: string;
    campaignId: string;
    campaignName: string;
    orgName: string;
  }[];
}

// FIX: Added missing NewsletterLog type
export interface NewsletterLog {
  id: string;
  subject: string;
  body: string;
  sentAt: Timestamp | FieldValue;
  targetCount: number;
  targetDescription: string;
  createdByEmail: string;
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

export interface RejectionReason {
  id: string;
  text: string;
  organizationId: string;
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

export interface RecoveryTemplate {
  id: string;
  organizationId: string;
  title: string;
  text: string;
  createdAt: Timestamp | FieldValue;
}
