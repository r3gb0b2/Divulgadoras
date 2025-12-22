
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM e salva no Firestore.
 * No iOS, isso converte o token APNs em FCM automaticamente.
 */
const refreshAndSaveToken = async (promoterId: string) => {
    try {
        console.log('Push: Solicitando token FCM...');
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken) {
            console.log('Push: Token FCM obtido:', fcmToken);
            const success = await savePushToken(promoterId, fcmToken);
            if (success) {
                console.log('Push: Token salvo no banco de dados com sucesso.');
            }
            return fcmToken;
        } else {
            console.warn('Push: FCM retornou um token vazio.');
            return null;
        }
    } catch (error: any) {
        console.error('Push Error: Falha ao obter/salvar token FCM:', error.message);
        return null;
    }
};

/**
 * Inicializa as notificações push no dispositivo.
 */
export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log('Push: Plataforma não nativa, ignorando registro.');
        return false;
    }

    try {
        // 1. Verifica e solicita permissão
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('Push: Usuário negou permissão de notificações.');
            return false;
        }

        // 2. Limpa ouvintes para evitar duplicidade
        await PushNotifications.removeAllListeners();

        // 3. Ouvinte de registro bem-sucedido
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro nativo (Device Token) recebido.');
            // Após o registro nativo, buscamos o token FCM (que o Firebase usa)
            await refreshAndSaveToken(promoterId);
        });

        // 4. Ouvinte de erro de registro
        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Push: Erro no registro nativo:', JSON.stringify(error));
        });

        // 5. Ouvinte de recebimento (opcional, para logs)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida em primeiro plano:', notification.title);
        });

        // 6. Registra o dispositivo no serviço de push do sistema
        await PushNotifications.register();
        
        // 7. Tentativa imediata caso já esteja registrado
        await refreshAndSaveToken(promoterId);

        return true;
    } catch (error: any) {
        console.error('Push: Falha crítica ao inicializar:', error.message);
        return false;
    }
};

/**
 * Limpa todos os ouvintes de notificação.
 */
export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {}
    }
};
