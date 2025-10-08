import { Timestamp } from "firebase/firestore";

export interface Promoter {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  dateOfBirth: string;
  photoUrls: string[];
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: Timestamp;
}

export interface PromoterApplicationData {
    name: string;
    whatsapp: string;
    email: string;
    instagram: string;
    tiktok: string;
    dateOfBirth: string;
    photos: File[];
}