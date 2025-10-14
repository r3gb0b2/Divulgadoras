import { Timestamp } from 'firebase/firestore';

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
  createdAt: Timestamp | Date;
  state: string;
  campaignName: string | null;
  organizationId: string;
  hasJoinedGroup?: boolean;
  rejectionReason?: string;
}

export interface PromoterApplicationData {
    name: string;
    whatsapp: string;
    email: string;
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
    description?: string;
    isActive: boolean;
    whatsappLink?: string;
    rules: string;
    stateAbbr: string;
    organizationId: string;
}

export interface StateConfig {
    isActive: boolean;
    rules: string;
}

export interface StatesConfig {
    [key: string]: StateConfig;
}

export type AdminRole = 'superadmin' | 'admin' | 'viewer';

export interface AdminUserData {
    uid: string;
    email: string;
    role: AdminRole;
    assignedStates: string[];
    assignedCampaigns?: { [stateAbbr: string]: string[] }; // Key is state abbr, value is array of campaign names
    organizationId?: string;
}

export interface AdminApplication {
    id: string;
    name: string;
    email: string;
    phone: string;
    orgName: string;
    message: string;
    status: 'pending';
    createdAt: Timestamp;
}

export type OrganizationStatus = 'active' | 'trial' | 'expired' | 'hidden';
export type PlanId = 'basic' | 'professional';

export interface Organization {
    id: string;
    name: string;
    ownerUid: string;
    ownerEmail: string;
    status: OrganizationStatus;
    planId: PlanId;
    createdAt: Timestamp;
    planExpiresAt?: Timestamp;
    assignedStates: string[];
    public: boolean;
    paymentLink?: string;
}