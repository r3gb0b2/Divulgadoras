
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM e salva no banco.
 */
export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push Debug: Tentando capturar token... (${retryCount + 1}/5)`);
        
        // No iOS o registro nativo precisa disparar o evento 'registration' primeiro
        // mas o plugin FCM.getToken() consegue buscar o token se o registro APNs já ocorreu.
        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push Debug: Token encontrado:', fcmToken);
            await savePushToken(promoterId, fcmToken);
            return fcmToken;
        }

        if (retryCount < 5) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e) {
        console.error("Push Debug: Erro ao obter token:", e);
        return null;
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

        // Listener importante: quando o iOS termina o registro no servidor da Apple
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo APNs concluído. Buscando FCM...');
            await getTokenAndSave(promoterId);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo APNs:', error);
        });

        // Registra o dispositivo no sistema da Apple
        await PushNotifications.register();

        // Tenta buscar o token FCM após um curto delay (caso já estivesse registrado)
        setTimeout(() => {
            getTokenAndSave(promoterId);
        }, 2000);

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
    await PushNotifications.removeAllListeners();
};
