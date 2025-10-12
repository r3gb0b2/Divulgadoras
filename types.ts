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
}

export interface RejectionReason {
  id: string;
  text: string;
}

// New types for Admin User Management
export type UserRole = 'superadmin' | 'stateadmin';

export interface AdminUser {
  id: string; // Firestore document ID
  uid: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  role: UserRole;
  states: string[]; // List of state abbreviations the user can manage (e.g., ['CE', 'SE'])
}
