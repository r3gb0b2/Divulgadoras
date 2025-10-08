import { Timestamp } from 'firebase/firestore';

export interface PromoterApplicationData {
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  dateOfBirth: string;
  photos: File[];
}

export interface Promoter {
  id: string;
  name: string;
  whatsapp: string;
  email:string;
  instagram: string;
  tiktok: string;
  dateOfBirth: string;
  photoUrls: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  rejectionReason?: string;
}

export interface RejectionReason {
    id: string;
    text: string;
}
