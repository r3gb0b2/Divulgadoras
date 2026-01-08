
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

export interface VipEvent {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  isSoldOut?: boolean;
  description: string;
  benefits: string[];
  pixKey: string;
  externalSlug: string; 
  pixelId?: string;
  eventTime?: string;
  eventLocation?: string;
  createdAt: Timestamp | FieldValue;
}

export interface VipMembership {
  id: string;
  vipEventId: string;
  vipEventName: string;
  promoterId: string;
  promoterName: string;
  promoterEmail: string;
  promoterWhatsapp?: string;
  promoterInstagram?: string;
  promoterTaxId?: string;
  organizationId: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'refunded';
  isBenefitActive: boolean; 
  proofUrl?: string;
  benefitCode?: string;
  paymentId?: string;
  submittedAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  refundedAt?: Timestamp | FieldValue;
  /* Tracking fields */
  viewedAt?: Timestamp | FieldValue;
  downloadedAt?: Timestamp | FieldValue;
  /* Dados do evento denormalizados para o ingresso */
  eventTime?: string;
  eventLocation?: string;
}

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
  fcmToken?: string; 
  lastTokenUpdate?: Timestamp | FieldValue;
  pushDiagnostics?: {
    updatedAt: Timestamp | FieldValue;
    tokenLength: number;
    pluginStatus: string;
    platform: string;
  };
  emocoesStatus?: 'none' | 'pending' | 'confirmed' | 'rejected';
  emocoesBenefitCode?: string;
  emocoesBenefitActive?: boolean;
  recoveryStatus?: RecoveryStatus;
  recoveryAdminEmail?: string;
  recoveryUpdatedAt?: Timestamp | FieldValue;
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
  pixelId?: string;
  preventDuplicateInOrg?: boolean;
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] };
  guestListTypes?: string[];
}

export interface PromoterApplicationData {
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  tiktok?: string;
  dateOfBirth: string;
  photos: File[];
  state: string;
  organizationId: string;
  campaignName?: string;
}

export interface RejectionReason {
  id: string;
  text: string;
  organizationId: string;
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

export interface AdminUserData {
  uid: string;
  email: string;
  role: AdminRole;
  organizationIds?: string[];
  assignedStates?: string[];
  assignedCampaigns?: { [stateAbbr: string]: string[] };
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
  planExpiresAt?: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  public?: boolean;
  assignedStates?: string[];
  emailRemindersEnabled?: boolean;
  oneTimePostEnabled?: boolean;
  guestListManagementEnabled?: boolean;
  guestListCheckinEnabled?: boolean;
  followLoopThreshold?: number;
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

export interface Post {
  id: string;
  organizationId: string;
  campaignName: string;
  eventName?: string;
  stateAbbr: string;
  type: 'text' | 'image' | 'video';
  textContent?: string;
  mediaUrl?: string;
  googleDriveUrl?: string;
  postLink?: string;
  copyLink?: string;
  instructions: string;
  isActive: boolean;
  autoAssignToNewPromoters?: boolean;
  allowLateSubmissions?: boolean;
  allowImmediateProof?: boolean;
  postFormats?: ('story' | 'reels')[];
  skipProofRequirement?: boolean;
  allowJustification?: boolean;
  ownerOnly?: boolean;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
  expiresAt: Timestamp | FieldValue | null;
}

export interface PostAssignment {
  id: string;
  postId: string;
  post: Post;
  promoterId: string;
  promoterEmail: string;
  promoterName: string;
  organizationId: string;
  status: 'pending' | 'confirmed';
  createdAt: Timestamp | FieldValue;
  confirmedAt?: Timestamp | FieldValue | null;
  proofSubmittedAt?: Timestamp | FieldValue | null;
  proofImageUrls?: string[];
  justification?: string;
  justificationStatus?: 'pending' | 'accepted' | 'rejected' | null;
  justificationResponse?: string;
  justificationSubmittedAt?: Timestamp | FieldValue | null;
  justificationImageUrls?: string[];
  reminderScheduled?: boolean;
  completionRate?: number;
}

export interface PushReminder {
  id: string;
  promoterId: string;
  fcmToken: string;
  title: string;
  body: string;
  url: string;
  scheduledFor: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  assignmentId?: string;
}

export interface OneTimePost {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  eventName: string;
  guestListName: string;
  type: 'text' | 'image' | 'video';
  textContent?: string;
  mediaUrl?: string;
  googleDriveUrl?: string;
  instructions: string;
  isActive: boolean;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
  expiresAt: Timestamp | FieldValue | null;
  submissionLimit?: number;
  submissionCount?: number;
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
  email?: string;
  instagram: string;
  proofImageUrls: string[];
  submittedAt: Timestamp | FieldValue;
}

export interface ScheduledPostData extends Omit<Post, 'id' | 'organizationId' | 'createdByEmail' | 'createdAt'> {}

export interface ScheduledPost {
  id: string;
  organizationId: string;
  postData: ScheduledPostData;
  assignedPromoters: { id: string, email: string, name: string }[];
  scheduledAt: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  error?: string;
  createdByEmail: string;
  createdAt: Timestamp | FieldValue;
}

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
  assignmentId: string;
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
  startsAt?: Timestamp | FieldValue | null;
  closesAt?: Timestamp | FieldValue | null;
  isActive: boolean;
  askEmail?: boolean;
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
  listName: string;
  isPromoterAttending: boolean;
  guests?: { name: string; email: string }[];
  guestNames?: string[]; // Legacy
  isLocked: boolean;
  confirmedAt: Timestamp | FieldValue;
  promoterCheckedInAt?: Timestamp | FieldValue | null;
  promoterCheckedOutAt?: Timestamp | FieldValue | null;
  guestsCheckedIn?: { name: string; checkedInAt: Timestamp | FieldValue; checkedOutAt?: Timestamp | FieldValue | null }[];
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

export interface PromoterStats extends Promoter {
  assigned: number;
  completed: number;
  justifications: number;
  missed: number;
  completionRate: number;
}

export interface FollowLoop {
  id: string;
  name: string;
  description?: string;
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

export interface AppleTestRegistrant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  createdAt: Timestamp | FieldValue;
}

export interface GlobalList {
  id: string;
  name: string;
  isActive: boolean;
  items: {
    organizationId: string;
    campaignId: string;
    campaignName: string;
    orgName: string;
  }[];
  createdAt: Timestamp | FieldValue;
}

export interface RecoveryTemplate {
  id: string;
  title: string;
  text: string;
  organizationId: string;
  createdAt: Timestamp | FieldValue;
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
