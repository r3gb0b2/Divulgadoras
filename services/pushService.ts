
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Captura o token FCM atual e salva no perfil da divulgadora via Cloud Function.
 */
export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push: Obtendo token FCM... (Tentativa ${retryCount + 1})`);
        
        // O plugin FCM retorna o token necessário para o Firebase disparar as notificações
        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push: Token obtido com sucesso:', fcmToken);
            // Salva no banco de dados usando a função existente no promoterService
            await savePushToken(promoterId, fcmToken);
            return fcmToken;
        }

        // Se o token falhar, tenta novamente após um pequeno delay (comum no primeiro boot do app)
        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e: any) {
        console.error("Push Error: Falha ao capturar ou salvar token:", e.message);
        return null;
    }
};

/**
 * Inicializa o sistema de notificações, pede permissão e registra o dispositivo.
 */
export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        // 1. Pede permissão ao usuário
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão negada pelo usuário.");
            return false;
        }

        // 2. Remove ouvintes antigos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        // 3. Listener para quando o registro nativo acontece
        PushNotifications.addListener('registration', async () => {
            console.log('Push: Registro nativo concluído, disparando captura FCM.');
            await getTokenAndSave(promoterId);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo:', error);
        });

        // 4. Solicita o registro no sistema (APNs/FCM Nativo)
        await PushNotifications.register();

        // 5. Tenta capturar o token FCM imediatamente caso já esteja registrado
        await getTokenAndSave(promoterId);

        return true;
    } catch (error: any) {
        console.error("Push: Falha crítica na inicialização:", error.message);
        return false;
    }
};

/**
 * Limpa os ouvintes ao sair da página para economizar recursos.
 */
export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {}
};
