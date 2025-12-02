import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

export interface WhatsAppCampaignFilters {
    state?: string;
    campaignName?: string;
    status?: string;
    promoterIds?: string[];
}

export const sendWhatsAppCampaign = async (
    messageTemplate: string,
    filters: WhatsAppCampaignFilters,
    organizationId: string
): Promise<{ success: boolean; count: number; failures: number; message: string }> => {
    try {
        const sendFunc = httpsCallable(functions, 'sendWhatsAppCampaign');
        const result = await sendFunc({ messageTemplate, filters, organizationId });
        return result.data as { success: boolean; count: number; failures: number; message: string };
    } catch (error: any) {
        console.error("Error sending WhatsApp campaign:", error);
        const errorMessage = error.details?.message || error.message || 'Falha ao enviar campanha.';
        throw new Error(errorMessage);
    }
};