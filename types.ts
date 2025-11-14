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
  // FIX: Add guest list properties to Campaign type to support guest list access control.
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
}

export interface PostAssignment {
  id: string; // Firestore document ID
  postId: string;
  post: { // Denormalized post data
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
  };
  organizationId: string;
  promoterId: string;
  promoterEmail: string; // lowercase
  promoterName: string;
  status: 'pending' | 'confirmed';
  confirmedAt: Timestamp | FieldValue | null;
  proofImageUrls?: string[];
  proofSubmittedAt?: Timestamp | FieldValue | null;
  justification?: string;
  justificationStatus?: 'pending' | 'accepted' | 'rejected' | null;
  justificationSubmittedAt?: Timestamp | FieldValue | null;
  justificationImageUrls?: string[];
  justificationResponse?: string;
}

// New model for individual guest lists
export interface GuestList {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string; // denormalized for easy display
  stateAbbr: string;
  name: string;
  description?: string;
  guestAllowance: number;
  requireGuestEmail?: boolean;
  startsAt: Timestamp | FieldValue | null;
  closesAt: Timestamp | FieldValue | null;
  isActive: boolean;
  createdAt: Timestamp | FieldValue;
  createdByEmail: string;
  assignments?: { [promoterId: string]: { guestAllowance: number; info?: string; closesAt?: Timestamp | FieldValue | null; requireGuestEmail?: boolean; } };
}

export interface GuestListConfirmation {
    id: string;
    organizationId: string;
    campaignId: string;
    campaignName: string;
    guestListId?: string; // Link to the new GuestList model
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    listName: string;
    isPromoterAttending: boolean;
    guests: { name: string; email?: string }[];
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

export interface OneTimePost {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  eventName?: string;
  guestListName: string;
  type: 'image' | 'text' | 'video';
  mediaUrl?: string; // Can be Firebase Storage path or GDrive URL for video
  googleDriveUrl?: string;
  textContent?: string;
  instructions: string;
  createdAt: Timestamp | FieldValue;
  createdByEmail: string;
  isActive: boolean;
  expiresAt?: Timestamp | FieldValue | null;
  submissionCount?: number;
}

export interface OneTimePostSubmission {
    id: string;
    oneTimePostId: string;
    organizationId: string;
    campaignId: string;
    guestName: string;
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
  actionTakenBy?: string; // UID of admin
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
  actionTakenBy?: string; // Admin UID
}