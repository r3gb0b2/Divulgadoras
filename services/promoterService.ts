
import { Promoter } from '../types';

const DB_KEY = 'promotersDB';

export const getPromoters = (): Promoter[] => {
  try {
    const data = localStorage.getItem(DB_KEY);
    if (data) {
      const promoters: Promoter[] = JSON.parse(data);
      // Sort by newest first
      return promoters.sort((a, b) => b.id - a.id);
    }
    return [];
  } catch (error) {
    console.error("Failed to parse promoters from localStorage", error);
    return [];
  }
};

export const addPromoter = (promoterData: Omit<Promoter, 'id' | 'submissionDate'>): void => {
  const promoters = getPromoters();
  const newPromoter: Promoter = {
    ...promoterData,
    id: Date.now(),
    submissionDate: new Date().toISOString(),
  };
  promoters.unshift(newPromoter); // Add to the beginning
  localStorage.setItem(DB_KEY, JSON.stringify(promoters));
};
