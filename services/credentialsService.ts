import { functions } from '../firebase/config';

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
        let detailMessage = "Verifique os logs da função no Firebase para mais detalhes.";
        if (error.code === 'unavailable') {
            detailMessage = "O serviço está temporariamente indisponível. A função pode não ter sido implantada corretamente ou está com erro de inicialização.";
        } else if (error.code === 'not-found') {
            detailMessage = "A função 'getStripeStatus' não foi encontrada no servidor. Verifique se o deploy foi concluído com sucesso.";
        } else if (error.message) {
            detailMessage = `Detalhes: ${error.message}`;
        }
        throw new Error(`Não foi possível verificar o status da integração com Stripe. ${detailMessage}`);
    }
};

export const getEnvironmentConfig = async (): Promise<any> => {
    try {
        const getConfig = functions.httpsCallable('getEnvironmentConfig');
        const result = await getConfig();
        return result.data;
    } catch (error: any) {
        console.error("Error getting environment config:", error);
        throw new Error(`Não foi possível buscar a configuração do servidor. Detalhes: ${error.message}`);
    }
};
