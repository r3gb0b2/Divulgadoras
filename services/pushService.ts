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
    } catch (error) {
        console.error("Erro ao salvar token push:", error);
        return false;
    }
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
    } catch (error) {
        console.error("Erro ao deletar token push:", error);
        throw new Error("Falha ao remover vínculo do dispositivo.");
    }
};

/**
 * Função interna para capturar o token FCM e enviar ao banco.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
        
        if (!Capacitor.isPluginAvailable('FCM')) {
            return { 
                success: false, 
                error: "Plugin FCM não disponível." 
            };
        }
        
        if (platform === 'ios') {
            try {
                await FCM.setAutoInit({ enabled: true });
            } catch (e) {}
        }

        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken && fcmToken.length > 32) {
            const metadata = {
                platform: platform,
                updatedAt: new Date().toISOString(),
                tokenLength: fcmToken.length
            };

            const saved = await savePushToken(promoterId, fcmToken, metadata);
            if (saved) return { success: true };
            return { success: false, error: "Erro ao persistir token no banco." };
        }
        
        return { success: false, error: "Token FCM inválido retornado." };

    } catch (error: any) {
        return { success: false, error: error.message || "Erro na sincronização FCM." };
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
            onStatusChange?.('denied', "Permissão negada.");
            return 'denied';
        }

        onStatusChange?.('granted');
        onStatusChange?.('syncing');
        
        const immediateResult = await syncTokenWithServer(promoterId);
        
        if (immediateResult.success) {
            onStatusChange?.('success');
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token: Token) => {
            onStatusChange?.('syncing');
            const result = await syncTokenWithServer(promoterId);
            if (result.success) {
                onStatusChange?.('success');
            } else {
                onStatusChange?.('error', result.error);
            }
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