export interface Promoter {
  id: string; // Firestore uses string IDs
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  age: number;
  photos: string[]; // This will now store the image URLs from Firebase Storage
  submissionDate: string;
}
