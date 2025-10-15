import { Timestamp, FieldValue } from 'firebase/firestore';

export type PromoterStatus = 'pending' | 'approved' | 'rejected';

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
  organizationId: string;
  rejectionReason?: string;
  hasJoinedGroup?: boolean;
  actionTakenByUid?: string;
  actionTakenByEmail?: string;
  statusChangedAt?: Timestamp | FieldValue;
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
}

export type AdminRole = 'superadmin' | 'admin' | 'viewer';

export interface AdminUserData {
  uid: string;
  email: string;
  role: AdminRole;
  assignedStates: string[];
  organizationId?: string;
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