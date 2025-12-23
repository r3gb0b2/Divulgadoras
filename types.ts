
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export type Timestamp = firebase.firestore.Timestamp;
export type FieldValue = firebase.firestore.FieldValue;

export type PromoterStatus = 'pending' | 'approved' | 'rejected' | 'rejected_editable' | 'removed';
export type CampaignStatus = 'active' | 'inactive' | 'hidden';
export type AdminRole = 'superadmin' | 'admin' | 'approver' | 'viewer' | 'poster';
export type OrganizationStatus = 'active' | 'trial' | 'deactivated' | 'hidden';
export type PlanId = 'basic' | 'professional';

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
  campaignName: string;
}

export interface Post {
  id: string;
  organizationId: string;
  campaignName: string;
  eventName?: string;
  stateAbbr: string;
  type: 'text' | 'image' | 'video';
  textContent?: string;
  instructions: string;
  postLink?: string;
  mediaUrl?: string;
  googleDriveUrl?: string;
  isActive: boolean;
  createdAt: Timestamp | FieldValue;
  expiresAt: Timestamp | null;
  createdByEmail: string;
  autoAssignToNewPromoters?: boolean;
  allowLateSubmissions?: boolean;
  allowImmediateProof?: boolean;
  postFormats?: ('story' | 'reels')[];
  skipProofRequirement?: boolean;
  allowJustification?: boolean;
  ownerOnly?: boolean;
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
  confirmedAt: Timestamp | FieldValue | null;
  proofSubmittedAt: Timestamp | FieldValue | null;
  proofImageUrls?: string[];
  justification?: string;
  justificationStatus?: 'pending' | 'accepted' | 'rejected' | null;
  justificationResponse?: string;
  justificationSubmittedAt?: Timestamp | FieldValue | null;
  justificationImageUrls?: string[];
  completionRate: number;
  createdAt?: Timestamp | FieldValue;
  reminderScheduled?: boolean;
  reminderSentAt?: Timestamp | null;
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
  status: OrganizationStatus;
  planId: PlanId;
  createdAt: Timestamp | FieldValue;
  ownerUid: string;
  ownerEmail: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerTaxId?: string;
  assignedStates: string[];
  public?: boolean;
  emailRemindersEnabled?: boolean;
  oneTimePostEnabled?: boolean;
  guestListManagementEnabled?: boolean;
  guestListCheckinEnabled?: boolean;
  planExpiresAt?: Timestamp;
  followLoopThreshold?: number;
}

export interface StateConfig {
  isActive: boolean;
  rules: string;
}

export interface StatesConfig {
  [stateAbbr: string]: StateConfig;
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

export interface AdminApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  message?: string;
  createdAt: Timestamp | FieldValue;
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

export interface GuestList {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  stateAbbr: string;
  name: string;
  description?: string;
  guestAllowance: number;
  startsAt?: Timestamp | null;
  closesAt?: Timestamp | null;
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
  listName: string;
  isPromoterAttending: boolean;
  guests?: { name: string; email: string }[];
  guestNames?: string[];
  isLocked: boolean;
  confirmedAt: Timestamp | FieldValue;
  promoterCheckedInAt?: Timestamp | null;
  promoterCheckedOutAt?: Timestamp | null;
  guestsCheckedIn?: { 
    name: string; 
    checkedInAt: Timestamp; 
    checkedOutAt?: Timestamp | null 
  }[];
}

export interface GuestListChangeRequest {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  guestListId: string;
  confirmationId: string;
  promoterId: string;
  promoterName: string;
  promoterEmail: string;
  listName: string;
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

export interface ScheduledPostData extends Omit<Post, 'id' | 'organizationId' | 'createdAt' | 'createdByEmail'> {}

export interface ScheduledPost {
  id: string;
  organizationId: string;
  postData: ScheduledPostData;
  assignedPromoters: { id: string; email: string; name: string }[];
  scheduledAt: Timestamp | FieldValue;
  status: 'pending' | 'sent' | 'error';
  createdByEmail: string;
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
  textContent?: string;
  mediaUrl?: string;
  googleDriveUrl?: string;
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

export interface FollowLoop {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Timestamp | FieldValue;
}

export interface AppleTestRegistrant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  createdAt: Timestamp | FieldValue;
}

export interface WhatsAppReminder {
  id: string;
  promoterId: string;
  promoterName: string;
  promoterWhatsapp: string;
  organizationId: string;
  postId: string;
  postCampaignName: string;
  sendAt: Timestamp;
  status: 'pending' | 'sent' | 'error';
  error?: string;
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
