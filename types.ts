import { FieldValue } from 'firebase/firestore';

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
  status: PromoterStatus;
  createdAt: FieldValue;
  rejectionReason?: string;
  hasJoinedGroup?: boolean;
  state: string;
  campaignName?: string;
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
}

export interface RejectionReason {
  id: string;
  text: string;
}

// Types for Admin User Management
export type AdminRole = 'superadmin' | 'admin' | 'viewer';

export interface AdminUserData {
  // FIX: Add uid to uniquely identify admin users.
  uid: string;
  email: string;
  role: AdminRole;
  assignedStates: string[];
}

// Types for State/Locality Management
export interface StateConfig {
  isActive: boolean;
  rules: string;
}

export interface StatesConfig {
  [key: string]: StateConfig;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  stateAbbr: string;
  isActive: boolean;
  whatsappLink: string;
}