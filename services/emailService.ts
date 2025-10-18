

import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

/**
 * Handles errors from Firebase Callable Functions, providing more specific user-facing messages.
 * @param {any} error - The error object caught from the `httpsCallable` promise.
 * @param {string} defaultMessage - The default message to show for generic errors.
 * @returns {Error} A new Error object with a more descriptive message.
 */
const handleCallableError = (error: any, defaultMessage: string): Error => {
    console.error("Error calling Firebase function:", error);
    if (error.code === 'permission-denied') {
        return new Error("Acesso negado. Apenas Super Admins podem realizar esta ação.");
    }
    if (error.code === 'unauthenticated') {
        return new Error("Sessão expirada. Por favor, faça login novamente.");
    }
    const details = error.details?.originalError || error.message || 'Erro desconhecido';
    return new Error(`${defaultMessage}. Detalhes: ${details}`);
};

const callTemplateFunc = async (funcName: string, args: object | null = null): Promise<any> => {
    try {
        const func = httpsCallable(functions, funcName);
        const result = await func(args || undefined);
        return result.data;
    } catch (error) {
         throw handleCallableError(error, `Erro ao chamar a função: ${funcName}`);
    }
};

// Approved
export const getEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getEmailTemplate')).htmlContent;
export const setEmailTemplate = async (htmlContent: string): Promise<void> => callTemplateFunc('setEmailTemplate', { htmlContent });
export const resetEmailTemplate = async (): Promise<void> => callTemplateFunc('resetEmailTemplate');
export const getDefaultEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getDefaultEmailTemplate')).htmlContent;

// Rejected
export const getRejectedEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getRejectedEmailTemplate')).htmlContent;
export const setRejectedEmailTemplate = async (htmlContent: string): Promise<void> => callTemplateFunc('setRejectedEmailTemplate', { htmlContent });
export const resetRejectedEmailTemplate = async (): Promise<void> => callTemplateFunc('resetRejectedEmailTemplate');
export const getDefaultRejectedEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getDefaultRejectedEmailTemplate')).htmlContent;

// New Post
export const getNewPostEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getNewPostEmailTemplate')).htmlContent;
export const setNewPostEmailTemplate = async (htmlContent: string): Promise<void> => callTemplateFunc('setNewPostEmailTemplate', { htmlContent });
export const resetNewPostEmailTemplate = async (): Promise<void> => callTemplateFunc('resetNewPostEmailTemplate');
export const getDefaultNewPostEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getDefaultNewPostEmailTemplate')).htmlContent;

// Proof Reminder
export const getProofReminderEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getProofReminderEmailTemplate')).htmlContent;
export const setProofReminderEmailTemplate = async (htmlContent: string): Promise<void> => callTemplateFunc('setProofReminderEmailTemplate', { htmlContent });
export const resetProofReminderEmailTemplate = async (): Promise<void> => callTemplateFunc('resetProofReminderEmailTemplate');
export const getDefaultProofReminderEmailTemplate = async (): Promise<string> => (await callTemplateFunc('getDefaultProofReminderEmailTemplate')).htmlContent;


/**
 * Sends a test email using the provided HTML content.
 * @param {string} htmlContent - The HTML content to test.
 * @returns {Promise<{ success: boolean; message: string }>} A promise with the result.
 */
export const sendCustomTestEmail = async (htmlContent: string): Promise<{ success: boolean; message: string }> => {
     try {
        const sendTest = httpsCallable(functions, 'sendTestEmail');
        const result = await sendTest({ testType: 'custom_approved', customHtmlContent: htmlContent });
        return result.data as { success: boolean; message: string };
    } catch (error) {
        throw handleCallableError(error, "Falha no envio do teste");
    }
};