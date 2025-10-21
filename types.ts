import { Timestamp, FieldValue } from 'firebase/firestore';

export type PromoterStatus = 'pending' | 'approved' | 'rejected' | 'rejected_editable';

export interface Promoter {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  tiktok?: string;
  dateOfBirth: string;
  photoUrls: string[];
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
  state: string;
  campaignName?: string;
  organizationId: string;
}

export interface RejectionReason {
  id: string;
  text: string;
  organizationId: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  whatsappLink: string;
  rules: string;
  stateAbbr: string;
  organizationId: string;
  associatedAdmins?: string[];
  // Guest List Feature
  guestListTypes?: string[];
  guestAllowance?: number;
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] }; // Maps promoterId to an array of list names
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

export type OrganizationStatus = 'active' | 'trial' | 'expired' | 'hidden';

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
  stateAbbr: string;
  type: 'image' | 'text' | 'video';
  mediaUrl?: string;
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
}

export interface PostAssignment {
  id: string; // Firestore document ID
  postId: string;
  post: { // Denormalized post data
    type: 'image' | 'text' | 'video';
    mediaUrl?: string;
    textContent?: string;
    instructions: string;
    postLink?: string;
    campaignName: string;
    isActive: boolean;
    expiresAt: Timestamp | FieldValue | null;
    createdAt: Timestamp | FieldValue;
    allowLateSubmissions?: boolean;
    autoAssignToNewPromoters?: boolean;
    allowImmediateProof?: boolean;
    postFormats?: ('story' | 'reels')[];
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
}

export interface GuestListConfirmation {
    id: string;
    organizationId: string;
    campaignId: string;
    campaignName: string;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    listName: string;
    isPromoterAttending: boolean;
    guestNames: string[];
    confirmedAt: Timestamp | FieldValue;
    promoterCheckedInAt?: Timestamp | FieldValue | null;
    guestsCheckedIn?: { name: string; checkedInAt: Timestamp | FieldValue; }[];
}