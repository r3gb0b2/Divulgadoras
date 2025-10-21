import { Timestamp, FieldValue } from 'firebase/firestore';

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
  state: string;
  campaignName: string | null;
  organizationId: string;
  status: PromoterStatus;
  rejectionReason?: string;
  createdAt: Timestamp | FieldValue;
  hasJoinedGroup?: boolean;
  observation?: string;
  associatedCampaigns?: string[];
  actionTakenByUid?: string;
  actionTakenByEmail?: string;
  statusChangedAt?: Timestamp | FieldValue;
  lastManualNotificationAt?: Timestamp | FieldValue;
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
  stateAbbr: string;
  organizationId: string;
  whatsappLink: string;
  rules: string;
  isActive: boolean;
  guestListTypes?: string[];
  guestAllowance?: number;
  guestListAccess?: 'all' | 'specific';
  guestListAssignments?: { [promoterId: string]: string[] };
}

export type AdminRole = 'superadmin' | 'admin' | 'viewer' | 'poster';

export interface AdminUserData {
    uid: string;
    email: string;
    role: AdminRole;
    organizationIds?: string[];
    assignedStates: string[];
    assignedCampaigns?: { [stateAbbr: string]: string[] };
}

export interface AdminApplication {
    id: string; // This will be the user's UID
    name: string;
    email: string;
    phone: string;
    message?: string;
    createdAt: Timestamp;
}

export type OrganizationStatus = 'active' | 'trial' | 'expired' | 'hidden';
export type PlanId = 'basic' | 'professional';

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
    planExpiresAt?: Timestamp;
    createdAt: Timestamp | FieldValue;
    public: boolean;
    assignedStates: string[];
}

export interface StateConfig {
  isActive: boolean;
  rules: string;
}

export interface StatesConfig {
  [stateAbbr: string]: StateConfig;
}

export interface Post {
    id: string;
    organizationId: string;
    campaignName: string;
    stateAbbr: string;
    type: 'text' | 'image' | 'video';
    textContent?: string | null;
    mediaUrl?: string | null;
    instructions: string;
    postLink?: string | null;
    createdAt: Timestamp | FieldValue;
    createdByEmail: string;
    isActive: boolean;
    expiresAt?: Timestamp | FieldValue | null;
    autoAssignToNewPromoters?: boolean;
    allowLateSubmissions?: boolean;
    allowImmediateProof?: boolean;
    postFormats?: ('story' | 'reels')[];
}

export interface PostAssignment {
    id: string;
    postId: string;
    post: Omit<Post, 'id' | 'organizationId' | 'stateAbbr' | 'createdByEmail'>; // Denormalized post data
    organizationId: string;
    promoterId: string;
    promoterEmail: string;
    promoterName: string;
    status: 'pending' | 'confirmed' | 'completed';
    confirmedAt: Timestamp | FieldValue | null;
    proofImageUrls?: string[];
    proofSubmittedAt?: Timestamp | FieldValue | null;
    justification?: string;
    justificationStatus?: 'pending' | 'accepted' | 'rejected';
    lastManualReminderAt?: Timestamp | FieldValue;
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
  promoterCheckedInAt?: Timestamp;
  guestsCheckedIn?: { name: string; checkedInAt: Timestamp }[];
}

export interface PromoterStats extends Promoter {
    assigned: number;
    completed: number;
    justifications: number;
    missed: number;
    completionRate: number;
}
