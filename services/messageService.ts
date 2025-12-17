
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

export const sendPushCampaign = async (
    data: { title: string; body: string; url: string; promoterIds: string[]; organizationId: string }
): Promise<{ success: boolean; message: string }> => {
    try {
        const sendFunc = httpsCallable(functions, 'sendPushCampaign');
        const result = await sendFunc(data);
        return result.data as { success: boolean; message: string };
    } catch (error: any) {
        console.error("Error sending Push campaign:", error);
        throw new Error(error.message || 'Falha ao enviar notificações push.');
    }
};
