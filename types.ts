
import { Timestamp } from "firebase/firestore";

export interface Promoter {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  age: number;
  photoUrls: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
}

export interface PromoterApplicationData {
    name: string;
    whatsapp: string;
    email: string;
    instagram: string;
    tiktok: string;
    age: number;
    photos: File[];
}
