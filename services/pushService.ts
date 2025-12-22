
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM e salva no Firestore com retry.
 */
const refreshAndSaveToken = async (promoterId: string, attempt = 1): Promise<string | null> => {
    try {
        console.log(`Push: Obtendo token FCM (Tentativa ${attempt})...`);
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken) {
            console.log('Push: Token FCM capturado:', fcmToken);
            // Salva no banco de dados via Cloud Function
            await savePushToken(promoterId, fcmToken);
            return fcmToken;
        }
        
        if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return refreshAndSaveToken(promoterId, attempt + 1);
        }
        return null;
    } catch (error: any) {
        console.error('Push Error: Falha ao obter token FCM:', error.message);
        if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return refreshAndSaveToken(promoterId, attempt + 1);
        }
        return null;
    }
};

/**
 * Inicializa as notificações push no dispositivo.
 */
export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log('Push: Plataforma não nativa (Browser), pulando registro.');
        return false;
    }

    try {
        // 1. Verifica/Solicita permissão
        const permStatus = await PushNotifications.requestPermissions();
        
        if (permStatus.receive !== 'granted') {
            console.warn('Push: Permissão negada pelo usuário.');
            return false;
        }

        // 2. Remove ouvintes anteriores para evitar loops
        await PushNotifications.removeAllListeners();

        // 3. Ouvinte para quando o registro nativo é concluído
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro nativo OK. Sincronizando com FCM...');
            // O token nativo (token.value) é recebido aqui, mas chamamos refreshAndSaveToken
            // para garantir que pegamos o token formatado para o Firebase (FCM).
            await refreshAndSaveToken(promoterId);
        });

        // 4. Ouvinte de erro
        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Push: Erro crítico no registro nativo:', JSON.stringify(error));
        });

        // 5. Registra o dispositivo no SO
        await PushNotifications.register();
        
        // 6. Tenta captura imediata (caso já esteja registrado de uma sessão anterior)
        await refreshAndSaveToken(promoterId);

        return true;
    } catch (error: any) {
        console.error("Push: Falha na inicialização:", error.message);
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
            console.log('Push: Ouvintes removidos.');
        } catch (e) {}
    }
};
