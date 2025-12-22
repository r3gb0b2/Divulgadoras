
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

        // Verifica se o plugin FCM está disponível antes de chamar
        if (!FCM) {
            return { success: false, error: "Plugin FCM (Native) não encontrado no bundle." };
        }

        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            const saved = await savePushToken(promoterId, fcmToken);
            if (saved) return { success: true };
            return { success: false, error: "Token capturado, mas falhou ao gravar no Firestore (Cloud Function)." };
        }
        return { success: false, error: "Token retornado pelo Firebase é inválido ou nulo." };
    } catch (error: any) {
        console.error('Push Sync Error:', error.message);
        return { success: false, error: error.message || "Erro desconhecido na sincronização FCM." };
    }
};

/**
 * Inicializa as notificações push e reporta status/erros detalhados.
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
            onStatusChange?.('denied', "Permissão negada pelo usuário nas configurações do celular.");
            return 'denied';
        }

        onStatusChange?.('granted');
        await PushNotifications.removeAllListeners();

        // 1. Listener de Sucesso no Registro Nativo (APNs/GCM)
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro nativo OK. Sincronizando com Firebase...');
            onStatusChange?.('syncing');
            
            // Delay para garantir que o SDK do Firebase processou o token nativo
            setTimeout(async () => {
                const result = await syncTokenWithServer(promoterId);
                if (result.success) {
                    onStatusChange?.('success');
                } else {
                    onStatusChange?.('error', result.error);
                }
            }, 2500);
        });

        // 2. Erro no registro nativo
        PushNotifications.addListener('registrationError', (error: any) => {
            const msg = error.error || error.message || JSON.stringify(error);
            console.error('Push Reg Error:', msg);
            onStatusChange?.('error', `Erro Nativo: ${msg}`);
        });

        // 3. Solicita registro ao SO
        await PushNotifications.register();
        
        // Tentativa de sincronização imediata caso já esteja registrado de sessões anteriores
        onStatusChange?.('syncing');
        const syncResult = await syncTokenWithServer(promoterId);
        if (syncResult.success) {
            onStatusChange?.('success');
            return 'success';
        }

        return 'granted';
    } catch (error: any) {
        console.error("Push Crash:", error.message);
        onStatusChange?.('error', `Falha Crítica: ${error.message}`);
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
