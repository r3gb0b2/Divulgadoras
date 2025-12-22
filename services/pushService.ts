
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Função interna para capturar o token FCM e enviar ao banco.
 */
const syncTokenWithServer = async (promoterId: string): Promise<boolean> => {
    try {
        console.log('Push: Iniciando sincronização FCM...');
        
        if (Capacitor.getPlatform() === 'ios') {
            await FCM.setAutoInit({ enabled: true });
        }

        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            console.log('Push: Token FCM válido obtido.');
            const success = await savePushToken(promoterId, fcmToken);
            return success;
        }
        return false;
    } catch (error: any) {
        console.error('Push Error:', error.message);
        return false;
    }
};

/**
 * Inicializa as notificações push e retorna o status final do processo.
 */
export const initPushNotifications = async (
    promoterId: string, 
    onStatusChange?: (status: PushStatus) => void
): Promise<PushStatus> => {
    if (!Capacitor.isNativePlatform()) {
        return 'idle';
    }

    try {
        onStatusChange?.('requesting');
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied');
            return 'denied';
        }

        onStatusChange?.('granted');
        await PushNotifications.removeAllListeners();

        // Este listener captura o token assim que o SO registra o app
        PushNotifications.addListener('registration', async (token: Token) => {
            onStatusChange?.('syncing');
            setTimeout(async () => {
                const saved = await syncTokenWithServer(promoterId);
                onStatusChange?.(saved ? 'success' : 'error');
            }, 1500);
        });

        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Push Reg Error:', error);
            onStatusChange?.('error');
        });

        await PushNotifications.register();
        
        // Tentativa de sincronização imediata (caso já registrado)
        onStatusChange?.('syncing');
        const saved = await syncTokenWithServer(promoterId);
        if (saved) {
            onStatusChange?.('success');
            return 'success';
        }

        return 'granted'; // Ficou no estado de permissão mas o token ainda não sincronizou
    } catch (error: any) {
        console.error("Push Crash:", error.message);
        onStatusChange?.('error');
        return 'error';
    }
};

export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {}
    }
};
