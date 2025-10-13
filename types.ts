import { Timestamp } from 'firebase/firestore';

export type PromoterStatus = 'pending' | 'approved' | 'rejected';

export interface Promoter {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok?: string;
  dateOfBirth: string;
  photoUrls: string[];
  state: string;
  campaignName: string | null;
  organizationId: string;
  status: PromoterStatus;
  rejectionReason?: string;
  hasJoinedGroup?: boolean;
  createdAt: Timestamp | object;
}

export type PromoterApplicationData = Omit<Promoter, 'id' | 'photoUrls' | 'status' | 'createdAt'> & {
  photos: File[];
};

export interface RejectionReason {
  id: string;
  text: string;
  organizationId: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  stateAbbr: string;
  organizationId: string;
  isActive: boolean;
  rules: string;
  whatsappLink: string;
}

export type AdminRole = 'superadmin' | 'admin' | 'viewer';

export interface AdminUserData {
    uid: string;
    email: string;
    role: AdminRole;
    assignedStates: string[];
    assignedCampaigns?: { [stateAbbr: string]: string[] };
    organizationId?: string;
}

export interface StateConfig {
    isActive: boolean;
    rules: string;
}

export type StatesConfig = {
    [stateAbbr: string]: StateConfig;
};

export interface Organization {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  name: string;
  planId: 'basic' | 'professional';
  createdAt: Timestamp | object;
  status: 'active' | 'inactive';
  isPublic: boolean;
  assignedStates: string[];
}

export interface AdminApplication {
  id: string;
  orgName: string;
  email: string;
  planId: 'basic' | 'professional';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp | object;
}

export interface MercadoPagoCredentials {
  publicKey?: string;
  accessToken?: string;
}

export interface PagSeguroCredentials {
  publicKey?: string;
}