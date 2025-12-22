
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
        const platform = Capacitor.getPlatform(); // 'ios', 'android' or 'web'
        console.log('Push: Iniciando sincronização FCM para plataforma:', platform);

        // 1. Verifica disponibilidade do Plugin
        if (!Capacitor.isPluginAvailable('FCM')) {
            return { 
                success: false, 
                error: "BRIDGE_ERROR: O plugin '@capacitor-community/fcm' não foi encontrado." 
            };
        }
        
        if (platform === 'ios') {
            try {
                await FCM.setAutoInit({ enabled: true });
            } catch (e) {
                console.warn("FCM: Falha ao setar AutoInit (não crítico)");
            }
        }

        // 2. Tenta obter o Token FCM real
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            // Enviamos metadados para que o Admin saiba em qual aba mostrar o usuário
            const metadata = {
                platform: platform,
                updatedAt: new Date().toISOString(),
                tokenLength: fcmToken.length
            };

            const saved = await savePushToken(promoterId, fcmToken, metadata);
            if (saved) return { success: true };
            return { success: false, error: "Token capturado, mas erro ao salvar no banco." };
        }
        
        return { success: false, error: "FCM retornou um token vazio ou inválido." };

    } catch (error: any) {
        const msg = error.message || "";
        console.error('Push Sync Error:', msg);
        return { success: false, error: msg || "Erro na sincronização FCM." };
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
            onStatusChange?.('denied', "Permissão negada pelo usuário.");
            return 'denied';
        }

        onStatusChange?.('granted');
        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token: Token) => {
            onStatusChange?.('syncing');
            
            setTimeout(async () => {
                const result = await syncTokenWithServer(promoterId);
                if (result.success) {
                    onStatusChange?.('success');
                } else {
                    onStatusChange?.('error', result.error);
                }
            }, 2000);
        });

        PushNotifications.addListener('registrationError', (error: any) => {
            onStatusChange?.('error', error.error || error.message);
        });

        await PushNotifications.register();
        return 'granted';
    } catch (error: any) {
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
