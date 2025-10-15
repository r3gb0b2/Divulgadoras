import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

/**
 * Fetches the currently active email template for approved promoters.
 * This will return the custom template if it exists, otherwise the default.
 * @returns {Promise<string>} A promise that resolves to the HTML content of the template.
 */
export const getEmailTemplate = async (): Promise<string> => {
    try {
        const getTemplate = httpsCallable(functions, 'getEmailTemplate');
        const result = await getTemplate();
        const data = result.data as { htmlContent: string };
        return data.htmlContent;
    } catch (error) {
        console.error("Error fetching email template:", error);
        throw new Error("Não foi possível carregar o template de e-mail.");
    }
};

/**
 * Saves the custom HTML template for approved promoters.
 * @param {string} htmlContent - The new HTML content to save.
 */
export const setEmailTemplate = async (htmlContent: string): Promise<void> => {
    try {
        const setTemplate = httpsCallable(functions, 'setEmailTemplate');
        await setTemplate({ htmlContent });
    } catch (error) {
        console.error("Error setting email template:", error);
        throw new Error("Não foi possível salvar o template de e-mail.");
    }
};

/**
 * Resets the approved promoter email template to the system default.
 */
export const resetEmailTemplate = async (): Promise<void> => {
    try {
        const resetTemplate = httpsCallable(functions, 'resetEmailTemplate');
        await resetTemplate();
    } catch (error) {
        console.error("Error resetting email template:", error);
        throw new Error("Não foi possível redefinir o template de e-mail.");
    }
};

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
    } catch (error: any) {
        console.error("Error sending custom test email:", error);
        const detailedError = error?.details?.originalError || error.message || 'Ocorreu um erro desconhecido.';
        throw new Error(`Falha no envio do teste: ${detailedError}`);
    }
};