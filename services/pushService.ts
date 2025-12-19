
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
        
        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push Debug: Token encontrado:', fcmToken);
            const success = await savePushToken(promoterId, fcmToken);
            if (success) return fcmToken;
            throw new Error("Falha ao salvar o token via Cloud Function.");
        }

        if (retryCount < 5) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e: any) {
        console.error("Push Debug: Erro fatal no processo de registro:", e);
        // Não retornar null se houver erro real de salvamento, propagar para PostCheck capturar.
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
            console.log('Push: Registro nativo APNs concluído. Buscando FCM...');
            try {
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.error("Erro no callback registration:", err);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo APNs:', error);
        });

        await PushNotifications.register();

        // Tenta buscar o token FCM após um curto delay (caso já estivesse registrado)
        setTimeout(async () => {
            try {
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.error("Erro no timeout inicial do push:", err);
            }
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
