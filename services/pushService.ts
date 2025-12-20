import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export interface PushResult {
    success: boolean;
    token?: string;
    error?: string;
}

/**
 * Inicializa as notificações push.
 */
export const initPushNotifications = async (promoterId: string): Promise<PushResult> => {
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    
    if (!Capacitor.isNativePlatform()) {
        return { success: false, error: "Push nativo não disponível em ambiente Web." };
    }

    try {
        console.log(`Push: Verificando permissões para ${promoterId}...`);
        const permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive !== 'granted') {
            const request = await PushNotifications.requestPermissions();
            if (request.receive !== 'granted') {
                return { success: false, error: "Permissão negada pelo usuário." };
            }
        }

        // Limpa ouvintes antigos para evitar vazamento de memória e chamadas duplicadas
        await PushNotifications.removeAllListeners();

        return new Promise(async (resolve) => {
            // Sucesso no Registro
            await PushNotifications.addListener('registration', async (token) => {
                console.log("Push: Token capturado com sucesso.");
                try {
                    // Tenta salvar, mas não trava o resolve se falhar a rede
                    await savePushToken(promoterId, token.value, platform);
                    resolve({ success: true, token: token.value });
                } catch (e: any) {
                    console.error("Push: Falha ao persistir token no Firestore", e);
                    resolve({ success: false, error: "Token gerado, mas falha ao salvar no banco." });
                }
            });

            // Erro no Registro Nativo
            await PushNotifications.addListener('registrationError', (error) => {
                console.error("Push: Erro nativo reportado:", error.error);
                resolve({ success: false, error: error.error });
            });

            console.log("Push: Solicitando registro no serviço de notificações...");
            await PushNotifications.register();
        });

    } catch (error: any) {
        console.error("Push: Exceção no setup:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Limpa todos os ouvintes de notificação.
 */
export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {
            console.error("Push: Erro ao remover ouvintes", e);
        }
    }
};