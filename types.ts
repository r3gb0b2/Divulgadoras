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
  address: {
    zipCode: string;
    street: string;
    number: string;
    city: string;
    state: string;
  };
  facePhotoUrl: string; 
  bodyPhotoUrls: string[]; 
  photoUrls: string[]; // Todas as fotos combinadas
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
}

export interface Organization {
  id: string;
  name: string;
  ownerUid: string;
  ownerEmail: string;
  status: OrganizationStatus;
  planId: PlanId;
  createdAt: Timestamp | FieldValue;
  public?: boolean;
}

export interface Post { 
  id: string; 
  campaignName: string; 
  stateAbbr: string;
  instructions: string; 
  type: 'text' | 'image' | 'video'; 
  mediaUrl?: string; 
  isActive: boolean; 
  organizationId: string;
  createdAt: Timestamp | FieldValue;
}

export interface PostAssignment { 
  id: string; 
  postId: string; 
  promoterId: string; 
  status: string; 
  proofSubmittedAt?: Timestamp | FieldValue; 
  proofImageUrls?: string[]; 
  post: Post; 
  organizationId: string; 
}

export interface RecoveryTemplate {
  id: string;
  organizationId: string;
  title: string;
  text: string;
  createdAt: Timestamp | FieldValue;
}

export interface VipMembership { id: string; vipEventId: string; vipEventName: string; promoterId: string; promoterName: string; promoterEmail: string; status: string; benefitCode?: string; isBenefitActive: boolean; submittedAt: Timestamp | FieldValue; }
export interface VipEvent { id: string; name: string; price: number; isActive: boolean; benefits: string[]; createdAt: Timestamp | FieldValue; }
