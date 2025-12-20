
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export interface PushResult {
    success: boolean;
    token?: string;
    error?: string;
}

export const initPushNotifications = async (promoterId: string): Promise<PushResult> => {
    if (!Capacitor.isNativePlatform()) {
        return { success: false, error: "Web não suporta Push nativo." };
    }

    if (Capacitor.getPlatform() === 'ios' && !Capacitor.isNativePlatform()) {
        return { success: false, error: "Push não funciona no simulador." };
    }

    return new Promise(async (resolve) => {
        let isResolved = false;

        const timeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                resolve({ success: false, error: "Tempo esgotado (APNs não respondeu)." });
            }
        }, 12000);

        try {
            const permStatus = await PushNotifications.checkPermissions();
            
            if (permStatus.receive !== 'granted') {
                const request = await PushNotifications.requestPermissions();
                if (request.receive !== 'granted') {
                    clearTimeout(timeout);
                    resolve({ success: false, error: "Permissão de notificação negada." });
                    return;
                }
            }

            await PushNotifications.removeAllListeners();

            // Ouvinte de Sucesso
            PushNotifications.addListener('registration', async (token) => {
                if (isResolved) return;
                const platform = Capacitor.getPlatform().toLowerCase() as 'ios' | 'android';
                
                try {
                    await savePushToken(promoterId, token.value, platform);
                    isResolved = true;
                    clearTimeout(timeout);
                    resolve({ success: true, token: token.value });
                } catch (e) {
                    isResolved = true;
                    resolve({ success: false, error: "Falha ao salvar no banco." });
                }
            });

            // Ouvinte de Erro do Sistema (IMPORTANTE PARA O XCODE)
            PushNotifications.addListener('registrationError', (error) => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
                console.error("Erro APNs:", error);
                resolve({ success: false, error: `Erro do iOS: ${error.error}` });
            });

            await PushNotifications.register();

        } catch (error: any) {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            resolve({ success: false, error: error.message || "Falha no setup." });
        }
    });
};

export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {
            console.error("Push: Erro ao limpar listeners:", e);
        }
    }
};
