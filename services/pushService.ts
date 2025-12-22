
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

        // 1. Verifica disponibilidade do Plugin
        if (!Capacitor.isPluginAvailable('FCM')) {
            return { 
                success: false, 
                error: "BRIDGE_ERROR: O plugin '@capacitor-community/fcm' não foi encontrado na ponte nativa. Verifique se o plugin está instalado e sincronizado." 
            };
        }
        
        if (Capacitor.getPlatform() === 'ios') {
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
            const saved = await savePushToken(promoterId, fcmToken);
            if (saved) return { success: true };
            return { success: false, error: "Token capturado, mas a Cloud Function falhou ao salvar no Firestore." };
        }
        
        return { success: false, error: "FCM retornou um token vazio ou inválido." };

    } catch (error: any) {
        const msg = error.message || "";
        console.error('Push Sync Error:', msg);
        
        if (msg.includes('not implemented')) {
            return { 
                success: false, 
                error: "PLUGIN_NOT_LINKED: A implementação nativa está ausente. Tente rodar 'npx cap sync' e compilar novamente." 
            };
        }
        
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
    // Se não for nativo, não faz nada.
    if (!Capacitor.isNativePlatform()) {
        onStatusChange?.('idle');
        return 'idle';
    }

    try {
        onStatusChange?.('requesting');
        
        // 1. Solicita permissão ao sistema
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied', "Permissão de notificações negada pelo usuário.");
            return 'denied';
        }

        onStatusChange?.('granted');
        
        // Limpa listeners antigos
        await PushNotifications.removeAllListeners();

        // 2. Listener de registro bem-sucedido
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro Nativo concluído:', token.value);
            onStatusChange?.('syncing');
            
            // Pequeno delay para garantir que o Firebase está pronto
            setTimeout(async () => {
                const result = await syncTokenWithServer(promoterId);
                if (result.success) {
                    onStatusChange?.('success');
                } else {
                    onStatusChange?.('error', result.error);
                }
            }, 3000);
        });

        // 3. Listener de erro no registro
        PushNotifications.addListener('registrationError', (error: any) => {
            const msg = error.error || error.message || "Erro no registro nativo";
            console.error('Push Reg Error:', msg);
            onStatusChange?.('error', msg);
        });

        // 4. Inicia o registro
        await PushNotifications.register();
        
        return 'granted';
    } catch (error: any) {
        console.error("Push Init Fatal Error:", error.message);
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
