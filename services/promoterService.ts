import { Promoter } from '../types';

const NPOINT_BIN_ID = 'c135455959952e4f626b';
const API_URL = `https://api.npoint.io/bins/${NPOINT_BIN_ID}`;

export const getPromoters = async (): Promise<Promoter[]> => {
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) {
      console.warn(`Received status ${response.status} when fetching promoters. This might happen if the store is empty.`);
      return [];
    }
    const data = await response.json();
    const promoters: Promoter[] = Array.isArray(data) ? data : [];
    // Sort by newest first (by submission timestamp)
    return promoters.sort((a, b) => b.id - a.id);
  } catch (error) {
    console.error("Failed to fetch or parse promoters", error);
    return []; // Return empty array on error to prevent app crash
  }
};

export const addPromoter = async (promoterData: Omit<Promoter, 'id' | 'submissionDate'>): Promise<void> => {
  // This fetch-then-update approach has a risk of race conditions in high-concurrency scenarios.
  // For this application's expected usage, the risk is minimal and acceptable.
  // A more robust solution would require a proper backend with atomic operations.
  const currentPromoters = await getPromoters();
  
  const newPromoter: Promoter = {
    ...promoterData,
    id: Date.now(),
    submissionDate: new Date().toISOString(),
  };

  const updatedPromoters = [newPromoter, ...currentPromoters];

  const updateResponse = await fetch(API_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedPromoters),
  });

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text();
    console.error("Failed to add promoter:", errorBody);
    throw new Error(`Failed to save promoter data. Status: ${updateResponse.status}`);
  }
};
