
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

export const createPagSeguroOrder = async (orgId: string, planId: string): Promise<{ payLink: string }> => {
    try {
        const func = httpsCallable(functions, 'createPagSeguroOrder');
        const result = await func({ orgId, planId });
        return result.data as { payLink: string };
    } catch (error: any) {
        console.error("Error creating PagSeguro order:", error);
        const detail = error.details?.message || error.message;
        throw new Error(`Não foi possível iniciar o processo de pagamento. Detalhes: ${detail}`);
    }
};

export const getPagSeguroStatus = async (): Promise<any> => {
    try {
        const getStatus = httpsCallable(functions, 'getPagSeguroStatus');
        const result = await getStatus();
        return result.data;
    } catch (error: any) {
        console.error("Error getting PagSeguro status:", error);
        let detailMessage = "Verifique os logs da função no Firebase para mais detalhes.";
        if (error.code === 'unavailable') {
            detailMessage = "O serviço está temporariamente indisponível. A função pode não ter sido implantada corretamente ou está com erro de inicialização.";
        } else if (error.code === 'not-found') {
            detailMessage = "A função 'getPagSeguroStatus' não foi encontrada no servidor. Verifique se o deploy foi concluído com sucesso.";
        } else if (error.message) {
            detailMessage = `Detalhes: ${error.message}`;
        }
        throw new Error(`Não foi possível verificar o status da integração com PagSeguro. ${detailMessage}`);
    }
};

// FIX: Add missing getMercadoPagoStatus function to resolve import error in MercadoPagoSettingsPage.
export const getMercadoPagoStatus = async (): Promise<any> => {
    try {
        const getStatus = httpsCallable(functions, 'getMercadoPagoStatus');
        const result = await getStatus();
        return result.data;
    } catch (error: any) {
        console.error("Error getting Mercado Pago status:", error);
        let detailMessage = "Verifique os logs da função no Firebase para mais detalhes.";
        if (error.code === 'unavailable') {
            detailMessage = "O serviço está temporariamente indisponível. A função pode não ter sido implantada corretamente ou está com erro de inicialização.";
        } else if (error.code === 'not-found') {
            detailMessage = "A função 'getMercadoPagoStatus' não foi encontrada no servidor. Verifique se o deploy foi concluído com sucesso.";
        } else if (error.message) {
            detailMessage = `Detalhes: ${error.message}`;
        }
        throw new Error(`Não foi possível verificar o status da integração com Mercado Pago. ${detailMessage}`);
    }
};
