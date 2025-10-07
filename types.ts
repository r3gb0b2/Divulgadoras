export interface Promoter {
  id: string; // Firestore uses string IDs
  name: string;
  whatsapp: string;
  email: string;
  instagram: string;
  tiktok: string;
  age: number;
  photo: string; // This will now store the image URL from Firebase Storage
  submissionDate: string;
}