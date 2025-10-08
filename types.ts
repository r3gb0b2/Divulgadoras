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
}

export interface PromoterApplicationData {
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok?: string;
  dateOfBirth: string;
  photos: File[];
}

export interface RejectionReason {
  id: string;
  text: string;
}
