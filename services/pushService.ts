
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export const initPushNotifications = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push: Ambiente web detectado.");
        return null;
    }

    return new Promise(async (resolve) => {
        try {
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.warn("Push: Permissão negada.");
                resolve(null);
                return;
            }

            await PushNotifications.removeAllListeners();

            // Listener de sucesso no registro
            PushNotifications.addListener('registration', async (token) => {
                const platform = Capacitor.getPlatform().toLowerCase() as 'ios' | 'android';
                console.log(`Push: Token recebido para ${platform}`);
                
                if (promoterId) {
                    await savePushToken(promoterId, token.value, platform);
                }
                resolve(token.value);
            });

            PushNotifications.addListener('registrationError', (error) => {
                console.error('Push: Erro nativo:', error);
                resolve(null);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push: Recebida:', notification);
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                const data = notification.notification.data;
                if (data && data.url) {
                    let target = data.url;
                    if (target.startsWith('/#')) target = target.substring(2);
                    window.location.hash = target;
                }
            });

            await PushNotifications.register();

        } catch (error) {
            console.error("Push: Falha fatal:", error);
            resolve(null);
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
