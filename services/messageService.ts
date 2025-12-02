
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { firestore } from '../firebase/config';
import { WhatsAppReminder, Timestamp } from '../types';

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

export const getWhatsAppReminders = async (): Promise<WhatsAppReminder[]> => {
    try {
        const snapshot = await firestore.collection('whatsAppReminders').orderBy('sendAt', 'desc').limit(100).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppReminder));
    } catch (error) {
        console.error("Error fetching WhatsApp reminders:", error);
        throw new Error("Não foi possível buscar os lembretes.");
    }
};

export const deleteWhatsAppReminder = async (id: string): Promise<void> => {
    try {
        await firestore.collection('whatsAppReminders').doc(id).delete();
    } catch (error) {
        console.error("Error deleting reminder:", error);
        throw new Error("Falha ao excluir lembrete.");
    }
};

export const sendWhatsAppReminderImmediately = async (reminderId: string): Promise<{ success: boolean, message: string }> => {
    try {
        const sendFunc = httpsCallable(functions, 'sendWhatsAppReminderImmediately');
        const result = await sendFunc({ reminderId });
        return result.data as { success: boolean, message: string };
    } catch (error: any) {
        console.error("Error sending immediate reminder:", error);
        const errorMessage = error.details?.message || error.message || 'Falha no envio imediato.';
        throw new Error(errorMessage);
    }
};
