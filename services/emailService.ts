

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
        throw handleCallableError(error, "Não foi possível carregar o template de e-mail");
    }
};

/**
 * Fetches the system's hardcoded default email template, ignoring any custom template.
 * @returns {Promise<string>} A promise that resolves to the default HTML content.
 */
export const getDefaultEmailTemplate = async (): Promise<string> => {
    try {
        const getDefault = httpsCallable(functions, 'getDefaultEmailTemplate');
        const result = await getDefault();
        const data = result.data as { htmlContent: string };
        return data.htmlContent;
    } catch (error) {
        throw handleCallableError(error, "Não foi possível carregar o template padrão do sistema");
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
        throw handleCallableError(error, "Não foi possível salvar o template de e-mail");
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
        throw handleCallableError(error, "Não foi possível redefinir o template de e-mail");
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
    } catch (error) {
        throw handleCallableError(error, "Falha no envio do teste");
    }
};
