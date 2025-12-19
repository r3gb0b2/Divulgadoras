
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM e salva no banco chamando a Cloud Function correspondente.
 */
export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push Debug: Tentando capturar token... (${retryCount + 1}/5)`);
        
        // Verificação robusta: O objeto FCM pode existir mas ser um Proxy vazio no Capacitor
        const isFCMAvailable = typeof FCM !== 'undefined' && FCM !== null && typeof FCM.getToken === 'function';

        if (!isFCMAvailable) {
            console.error("Push Debug: Plugin FCM (Community) não está vinculado ao binário nativo.");
            throw new Error("PLUGIN_NOT_LINKED");
        }

        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push Debug: Token encontrado:', fcmToken);
            const success = await savePushToken(promoterId, fcmToken);
            if (success) return fcmToken;
            throw new Error("Falha ao salvar no banco de dados.");
        }

        if (retryCount < 3) { // Reduzido retry para não travar a UI
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e: any) {
        console.error("Push Debug: Erro no processo:", e);
        
        if (e.message === "PLUGIN_NOT_LINKED" || (e.message && e.message.includes("not implemented"))) {
            throw new Error("DETECTION_FAILED");
        }
        
        throw e;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão negada pelo usuário.");
            return false;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo APNs/FCM concluído:', token.value);
            try {
                // No iOS, precisamos converter o token APNs para FCM se o plugin estiver lá
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.warn("Push: Não foi possível converter para FCM automaticamente.");
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo:', error);
        });

        await PushNotifications.register();
        return true;
    } catch (error) {
        console.error("Push: Erro na inicialização:", error);
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    return await getTokenAndSave(promoterId);
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {}
};
