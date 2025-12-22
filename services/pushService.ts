
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

        // 1. Verifica se estamos no Simulador (Push não funciona)
        if (Capacitor.getPlatform() === 'ios') {
            // Em builds modernos, o erro 'not implemented' é comum em simuladores
            // ou quando o Podfile não foi instalado.
        }

        // 2. Verifica disponibilidade do Plugin
        if (!Capacitor.isPluginAvailable('FCM')) {
            return { 
                success: false, 
                error: "BRIDGE_ERROR: O plugin '@capacitor-community/fcm' não foi encontrado na ponte nativa. Requer 'npx cap sync ios'." 
            };
        }
        
        if (Capacitor.getPlatform() === 'ios') {
            try {
                await FCM.setAutoInit({ enabled: true });
            } catch (e) {
                console.warn("FCM: Falha ao setar AutoInit (não crítico)");
            }
        }

        // 3. Tenta obter o Token FCM real
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            const saved = await savePushToken(promoterId, fcmToken);
            if (saved) return { success: true };
            return { success: false, error: "Token capturado, mas a Cloud Function falhou ao salvar no Firestore." };
        }
        
        return { success: false, error: "Firebase retornou um token vazio ou inválido." };

    } catch (error: any) {
        const msg = error.message || "";
        console.error('Push Sync Error:', msg);
        
        // Erro clássico de falta de compilação nativa
        if (msg.includes('not implemented')) {
            return { 
                success: false, 
                error: "PLUGIN_NOT_LINKED: A implementação nativa do FCM está ausente. Você sincronizou os Pods no Xcode?" 
            };
        }
        
        return { success: false, error: msg || "Erro desconhecido na sincronização FCM." };
    }
};

/**
 * Inicializa as notificações push e reporta status/erros detalhados.
 */
export const initPushNotifications = async (
    promoterId: string, 
    onStatusChange?: (status: PushStatus, errorMessage?: string) => void
): Promise<PushStatus> => {
    // Se não for nativo (ex: Navegador Chrome), não faz nada.
    if (!Capacitor.isNativePlatform()) {
        onStatusChange?.('idle');
        return 'idle';
    }

    try {
        onStatusChange?.('requesting');
        
        // 1. Solicita permissão ao sistema (iOS/Android)
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied', "Permissão de notificações negada nas configurações do aparelho.");
            return 'denied';
        }

        onStatusChange?.('granted');
        
        // Limpa listeners antigos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        // 2. Registra o listener para quando o registro nativo (APNs) for concluído
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Registro Nativo concluído. Aguardando token Firebase...');
            onStatusChange?.('syncing');
            
            // O Firebase precisa de um pequeno tempo para converter o token APNs em FCM
            setTimeout(async () => {
                const result = await syncTokenWithServer(promoterId);
                if (result.success) {
                    onStatusChange?.('success');
                } else {
                    onStatusChange?.('error', result.error);
                }
            }, 3500);
        });

        // 3. Listener de erro no registro básico
        PushNotifications.addListener('registrationError', (error: any) => {
            const msg = error.error || error.message || JSON.stringify(error);
            console.error('Push Reg Error:', msg);
            onStatusChange?.('error', `Erro no Registro Nativo: ${msg}`);
        });

        // 4. Inicia o processo de registro oficial
        await PushNotifications.register();
        
        // Tenta uma sincronização imediata (caso já estivesse registrado)
        const immediateSync = await syncTokenWithServer(promoterId);
        if (immediateSync.success) {
            onStatusChange?.('success');
            return 'success';
        }

        return 'granted';
    } catch (error: any) {
        console.error("Push Crash Fatal:", error.message);
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
