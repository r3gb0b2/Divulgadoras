
import { functions, firestore } from '../firebase/config';

export const getStripePublishableKey = async (): Promise<string> => {
    try {
        const func = functions.httpsCallable('getStripePublishableKey');
        const result = await func();
        const data = result.data as { publishableKey: string };
        return data.publishableKey;
    } catch (error: any) {
        console.error("Error getting Stripe publishable key:", error);
        throw new Error(`Não foi possível carregar a chave do Stripe. Detalhes: ${error.message}`);
    }
};

export const checkBackendSecrets = async (): Promise<{ geminiKeyConfigured: boolean, asaasKeyConfigured: boolean }> => {
    try {
        const func = functions.httpsCallable('checkBackendStatus');
        const result = await func();
        return result.data as any;
    } catch (e) {
        return { geminiKeyConfigured: false, asaasKeyConfigured: false };
    }
};

export const createStripeCheckoutSession = async (orgId: string, planId: string): Promise<{ sessionId: string }> => {
    try {
        const func = functions.httpsCallable('createStripeCheckoutSession');
        const result = await func({ orgId, planId });
        return result.data as { sessionId: string };
    } catch (error: any) {
        console.error("Error creating Stripe checkout session:", error);
        const detail = error.details?.message || error.message;
        throw new Error(`Não foi possível iniciar o processo de pagamento. Detalhes: ${detail}`);
    }
};

export const getStripeStatus = async (): Promise<any> => {
    try {
        const getStatus = functions.httpsCallable('getStripeStatus');
        const result = await getStatus();
        return result.data;
    } catch (error: any) {
        console.error("Error getting Stripe status:", error);
        throw new Error(`Não foi possível verificar o status da integração.`);
    }
};

export const getEnvironmentConfig = async (): Promise<any> => {
    try {
        const getConfig = functions.httpsCallable('getEnvironmentConfig');
        const result = await getConfig();
        return result.data;
    } catch (error: any) {
        console.error("Error getting environment config:", error);
        throw new Error(`Não foi possível buscar a configuração do servidor.`);
    }
};

export const getWhatsAppConfig = async () => {
    try {
        const doc = await firestore.collection('systemConfig').doc('whatsapp').get();
        return doc.exists ? doc.data() : null;
    } catch (e) {
        console.error("Erro ao buscar config WhatsApp:", e);
        return null;
    }
};
