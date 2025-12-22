
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

        // Verifica se o plugin está disponível na ponte nativa
        if (!Capacitor.isPluginAvailable('FCM')) {
            return { 
                success: false, 
                error: "Plugin FCM não implementado. Execute 'npx cap sync ios' e recompile o app no Xcode." 
            };
        }
        
        if (Capacitor.getPlatform() === 'ios') {
            try {
                await FCM.setAutoInit({ enabled: true });
            } catch (e) {
                console.warn("FCM: Falha ao setar AutoInit (não crítico)");
            }
        }

        // Tenta obter o token
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            const saved = await savePushToken(promoterId, fcmToken);
            if (saved) return { success: true };
            return { success: false, error: "Token capturado, mas falhou ao gravar no Firestore." };
        }
        
        return { success: false, error: "Token retornado pelo Firebase está vazio." };
    } catch (error: any) {
        console.error('Push Sync Error:', error.message);
        
        // Trata erro específico de implementação ausente
        if (error.message?.includes('not implemented')) {
            return { success: false, error: "Plugin FCM (Nativo) não encontrado no binário do iOS." };
        }
        
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
            onStatusChange?.('denied', "Permissão de notificação negada no iOS.");
            return 'denied';
        }

        onStatusChange?.('granted');
        await PushNotifications.removeAllListeners();

        // 1. Listener de Sucesso no Registro Nativo (APNs)
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro APNs OK. Sincronizando FCM...');
            onStatusChange?.('syncing');
            
            // Pequeno delay para garantir que o Firebase gerou o token baseado no APNs
            setTimeout(async () => {
                const result = await syncTokenWithServer(promoterId);
                if (result.success) {
                    onStatusChange?.('success');
                } else {
                    onStatusChange?.('error', result.error);
                }
            }, 3000);
        });

        // 2. Erro no registro nativo
        PushNotifications.addListener('registrationError', (error: any) => {
            const msg = error.error || error.message || JSON.stringify(error);
            console.error('Push Reg Error:', msg);
            onStatusChange?.('error', `Erro APNs: ${msg}`);
        });

        // 3. Solicita registro ao SO
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
        onStatusChange?.('error', `Falha: ${error.message}`);
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
