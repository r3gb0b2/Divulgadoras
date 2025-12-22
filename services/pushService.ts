
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Função interna para capturar o token FCM (Firebase) e enviar ao banco.
 * No iOS, o token retornado pelo sistema é o APNs, o FCM precisa convertê-lo.
 */
const syncTokenWithServer = async (promoterId: string) => {
    try {
        console.log('Push: Iniciando sincronização FCM...');
        
        // Garante que o auto-init do Firebase está ativo
        if (Capacitor.getPlatform() === 'ios') {
            await FCM.setAutoInit({ enabled: true });
        }

        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 64) {
            console.log('Push: Token FCM válido obtido:', fcmToken.substring(0, 10) + '...');
            const success = await savePushToken(promoterId, fcmToken);
            if (success) {
                console.log('Push: Sincronização com Firestore concluída.');
            }
            return true;
        } else {
            console.warn('Push: Token FCM ainda não disponível ou inválido (muito curto).');
            return false;
        }
    } catch (error: any) {
        console.error('Push Error: Falha na conversão/envio do token:', error.message);
        return false;
    }
};

/**
 * Inicializa as notificações push no dispositivo.
 */
export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log('Push: Ambiente Web - Ignorando registro de Push.');
        return false;
    }

    try {
        // 1. Verifica/Solicita Permissões
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('Push: Permissão negada pelo usuário.');
            return false;
        }

        // 2. Remove listeners antigos para evitar chamadas duplas
        await PushNotifications.removeAllListeners();

        // 3. Listener de Registro do Sistema (APNs no iOS / GCM no Android)
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro nativo concluído. Aguardando 1s para handshake Firebase...');
            // Pequeno delay para dar tempo ao SDK do Firebase de gerar o token FCM
            setTimeout(async () => {
                await syncTokenWithServer(promoterId);
            }, 1500);
        });

        // 4. Listener de Erro
        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Push: Erro no registro do sistema:', JSON.stringify(error));
        });

        // 5. Listener de Recebimento (Foreground)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida com o app aberto:', notification.title);
        });

        // 6. Solicita o registro ao Sistema Operacional
        await PushNotifications.register();
        
        // 7. Tentativa imediata caso já esteja registrado anteriormente
        await syncTokenWithServer(promoterId);

        return true;
    } catch (error: any) {
        console.error("Push: Falha crítica na inicialização:", error.message);
        return false;
    }
};

/**
 * Limpa os ouvintes de notificação ao deslogar.
 */
export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
            console.log('Push: Listeners removidos.');
        } catch (e) {}
    }
};
