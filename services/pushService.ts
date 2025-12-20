
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export const initPushNotifications = async (promoterId: string) => {
    // Só executa em dispositivos reais (iOS/Android)
    if (!Capacitor.isNativePlatform()) {
        console.log("Push: Ambiente web detectado. Notificações ignoradas.");
        return false;
    }

    try {
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão não concedida pelo usuário.");
            return false;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            // No iOS, Capacitor.getPlatform() retorna 'ios'
            // No Android, Capacitor.getPlatform() retorna 'android'
            const platform = Capacitor.getPlatform().toLowerCase() as 'ios' | 'android';
            console.log(`Push: Registrando dispositivo ${platform} com token.`);
            
            if (promoterId) {
                await savePushToken(promoterId, token.value, platform);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Recebida em primeiro plano:', notification);
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
        return true;

    } catch (error) {
        console.error("Push: Falha ao inicializar serviço:", error);
        return false;
    }
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
