
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push notifications: Apenas em dispositivos nativos (App).");
        return false;
    }

    try {
        // 1. Verificar permissão
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push notifications: Permissão negada pelo usuário.");
            return false;
        }

        // 2. Registrar Listeners
        await PushNotifications.removeAllListeners();

        // No iOS, o token retornado pelo PushNotifications é o token da Apple (APNs).
        // Precisamos converter ele para o token do Firebase (FCM).
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo concluído.');
            
            try {
                let fcmToken = token.value;

                if (Capacitor.getPlatform() === 'ios') {
                    // Obtém o token real do FCM para o iOS
                    const res = await FCM.getToken();
                    fcmToken = res.token;
                    console.log('Push: Token FCM obtido (iOS):', fcmToken);
                } else {
                    console.log('Push: Token FCM obtido (Android):', fcmToken);
                }

                await savePushToken(promoterId, fcmToken);
                console.log('Push: Token salvo com sucesso para:', promoterId);
            } catch (e) {
                console.error("Push: Erro ao obter/salvar token FCM:", e);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo:', JSON.stringify(error));
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida em primeiro plano:', notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            const data = notification.notification.data;
            if (data && data.url) {
                window.location.hash = data.url.replace('/#', '');
            }
        });

        // 3. Solicitar registro
        await PushNotifications.register();
        return true;

    } catch (error) {
        console.error("Push: Erro na inicialização:", error);
        return false;
    }
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {
        console.error("Push: Erro ao limpar listeners", e);
    }
};
