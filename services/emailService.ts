
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

/**
 * Handles errors from Firebase Callable Functions.
 */
const handleCallableError = (error: any, defaultMessage: string): Error => {
    console.error("Error calling Firebase function:", error);
    const details = error.details?.originalError || error.message || 'Erro desconhecido';
    return new Error(`${defaultMessage}. Detalhes: ${details}`);
};

/**
 * Fetches the currently active email template.
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
 * Fetches the default system template.
 */
export const getDefaultEmailTemplate = async (): Promise<string> => {
    try {
        const getDefault = httpsCallable(functions, 'getDefaultEmailTemplate');
        const result = await getDefault();
        const data = result.data as { htmlContent: string };
        return data.htmlContent;
    } catch (error) {
        throw handleCallableError(error, "Não foi possível carregar o template padrão");
    }
};

/**
 * Saves the custom template.
 */
export const setEmailTemplate = async (htmlContent: string): Promise<void> => {
    try {
        const setTemplate = httpsCallable(functions, 'setEmailTemplate');
        await setTemplate({ htmlContent });
    } catch (error) {
        throw handleCallableError(error, "Não foi possível salvar o template");
    }
};

/**
 * Resets the template to default.
 */
export const resetEmailTemplate = async (): Promise<void> => {
    try {
        const resetTemplate = httpsCallable(functions, 'resetEmailTemplate');
        await resetTemplate();
    } catch (error) {
        throw handleCallableError(error, "Não foi possível redefinir o template");
    }
};

/**
 * Sends a custom test email.
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

/**
 * Realiza um teste básico de sistema de e-mail.
 */
export const testEmailSystem = async (): Promise<{ success: boolean; message: string }> => {
    try {
        const sendTest = httpsCallable(functions, 'sendTestEmail');
        const result = await sendTest({ testType: 'system_check' });
        return result.data as { success: boolean; message: string };
    } catch (error) {
        throw handleCallableError(error, "Falha ao testar sistema de e-mail");
    }
};
