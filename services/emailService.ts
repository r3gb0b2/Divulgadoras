
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

/**
 * Handles errors from Firebase Callable Functions, providing more specific user-facing messages.
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
 * Fetches the system's hardcoded default email template.
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
 * Realiza um teste básico de envio de e-mail via sistema (Brevo/SMTP).
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
