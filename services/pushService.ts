
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Função interna para capturar o token FCM e enviar ao banco.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        console.log('Push: Iniciando sincronização FCM...');
        
        if (Capacitor.getPlatform() === 'ios') {
            await FCM.setAutoInit({ enabled: true });
        }

        // Tenta pegar o token FCM
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            const saved = await savePushToken(promoterId, fcmToken);
            if (saved) return { success: true };
            return { success: false, error: "Falha ao gravar no Firestore (Function error)" };
        }
        return { success: false, error: "Token FCM retornado é inválido ou vazio" };
    } catch (error: any) {
        console.error('Push Sync Error:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Inicializa as notificações push e retorna o status final do processo.
 * Agora aceita um callback que recebe a mensagem de erro detalhada.
 */
export const initPushNotifications = async (
    promoterId: string, 
    onStatusChange?: (status: PushStatus, errorMessage?: string) => void
): Promise<PushStatus> => {
    if (!Capacitor.isNativePlatform()) {
        onStatusChange?.('idle');
        return 'idle';
    }

    try {
        onStatusChange?.('requesting');
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied', "Permissão de notificação negada no sistema.");
            return 'denied';
        }

        onStatusChange?.('granted');
        await PushNotifications.removeAllListeners();

        // Listener de Registro do Sistema
        PushNotifications.addListener('registration', async (token: Token) => {
            onStatusChange?.('syncing');
            // Aguarda o handshake do Firebase
            setTimeout(async () => {
                const result = await syncTokenWithServer(promoterId);
                if (result.success) {
                    onStatusChange?.('success');
                } else {
                    onStatusChange?.('error', result.error);
                }
            }, 2000);
        });

        // Erro no registro nativo (APNs/GCM)
        PushNotifications.addListener('registrationError', (error: any) => {
            const msg = error.error || error.message || JSON.stringify(error);
            console.error('Push Reg Error:', msg);
            onStatusChange?.('error', `Erro Nativo: ${msg}`);
        });

        await PushNotifications.register();
        
        // Tentativa de sincronização imediata
        onStatusChange?.('syncing');
        const syncResult = await syncTokenWithServer(promoterId);
        if (syncResult.success) {
            onStatusChange?.('success');
            return 'success';
        }

        return 'granted';
    } catch (error: any) {
        console.error("Push Crash:", error.message);
        onStatusChange?.('error', error.message);
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
