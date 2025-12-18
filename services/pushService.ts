
import { PushNotifications } from '@capacitor/push-notifications';
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

        // 2. Registrar Listeners antes de chamar o register()
        
        // Remove listeners antigos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        // Listener de Sucesso
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Token capturado com sucesso:', token.value);
            try {
                await savePushToken(promoterId, token.value);
                console.log('Push: Token salvo no Firestore para o ID:', promoterId);
            } catch (e) {
                console.error("Push: Erro ao salvar token no Firestore:", e);
            }
        });

        // Listener de Erro
        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro do FCM:', JSON.stringify(error));
        });

        // Listener de Recebimento (App Aberto)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida (foreground):', notification);
        });

        // Listener de Clique na Notificação
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            const data = notification.notification.data;
            if (data && data.url) {
                // Redireciona usando o hash do React Router se necessário
                window.location.hash = data.url.replace('/#', '');
            }
        });

        // 3. Solicitar registro ao Firebase/Google
        await PushNotifications.register();
        return true;

    } catch (error) {
        console.error("Push: Erro geral na inicialização:", error);
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
