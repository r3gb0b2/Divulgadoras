
import { PushNotifications, Token } from '@capacitor/push-notifications';
// @ts-ignore
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from '@/services/promoterService';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Função interna para capturar o token FCM e enviar ao banco.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
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

        // 2. Tenta obter o Token FCM real diretamente do Google
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            console.log('Push: Token FCM obtido com sucesso. Enviando para Firestore...');
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
        
        // No Android, muitas vezes o token já existe. 
        // Tentamos sincronizar imediatamente sem esperar o evento de registro.
        console.log('Push: Permissão garantida. Tentando sync imediato...');
        onStatusChange?.('syncing');
        const immediateResult = await syncTokenWithServer(promoterId);
        
        if (immediateResult.success) {
            onStatusChange?.('success');
        } else {
            console.warn('Push: Sync imediato falhou, configurando listeners...', immediateResult.error);
            // Se falhar o imediato (ex: rede lenta), configuramos o listener para quando o sistema registrar
        }

        // Removemos ouvintes antigos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        // Este evento dispara quando o token é criado ou renovado
        PushNotifications.addListener('registration', async (token: Token) => {
            console.log('Push: Evento registration disparado pelo sistema.');
            onStatusChange?.('syncing');
            const result = await syncTokenWithServer(promoterId);
            if (result.success) {
                onStatusChange?.('success');
            } else {
                onStatusChange?.('error', result.error);
            }
        });

        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Push: Erro de registro no sistema:', error);
            onStatusChange?.('error', error.error || error.message);
        });

        // Solicita o registro ao sistema operacional
        await PushNotifications.register();
        
        return 'granted';
    } catch (error: any) {
        console.error('Push: Erro fatal na inicialização:', error);
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
