import { functions, firestore } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { WhatsAppReminder } from '../types';


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

export const getAllWhatsAppReminders = async (): Promise<WhatsAppReminder[]> => {
    try {
        const q = firestore.collection("whatsAppReminders").orderBy('sendAt', 'desc').limit(500);
        const snapshot = await q.get();
        const reminders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppReminder));
        return reminders;
    } catch (error: any) {
        console.error("Error fetching all WhatsApp reminders:", error);
        throw new Error("Não foi possível buscar os agendamentos de WhatsApp.");
    }
};

export const deleteWhatsAppReminder = async (reminderId: string): Promise<void> => {
    try {
        await firestore.collection("whatsAppReminders").doc(reminderId).delete();
    } catch (error: any) {
        console.error(`Error deleting reminder ${reminderId}:`, error);
        throw new Error("Não foi possível deletar o agendamento.");
    }
};
