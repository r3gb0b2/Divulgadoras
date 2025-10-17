


import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

export const getStripePublishableKey = async (): Promise<string> => {
    try {
        const func = httpsCallable(functions, 'getStripePublishableKey');
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
        const func = httpsCallable(functions, 'createStripeCheckoutSession');
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
        const getStatus = httpsCallable(functions, 'getStripeStatus');
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