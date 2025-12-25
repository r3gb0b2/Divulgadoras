
import { PushNotifications, Token } from '@capacitor/push-notifications';
// @ts-ignore
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';
import { firestore, functions } from '../firebase/config';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Salva o token no Firestore via cloud function.
 */
export const savePushToken = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ promoterId, token, metadata });
        return (result.data as any).success;
    } catch (error) { return false; }
};

/**
 * Remove o token do perfil da divulgadora.
 */
export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) { throw new Error("Falha ao remover token."); }
};

/**
 * Função interna para capturar o token FCM e enviar ao banco.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
        console.log('Push: Iniciando sincronização FCM para plataforma:', platform);

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
        
        console.log('Push: Permissão garantida. Tentando sync imediato...');
        onStatusChange?.('syncing');
        const immediateResult = await syncTokenWithServer(promoterId);
        
        if (immediateResult.success) {
            onStatusChange?.('success');
        } else {
            console.warn('Push: Sync imediato falhou, configurando listeners...', immediateResult.error);
        }

        await PushNotifications.removeAllListeners();

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
