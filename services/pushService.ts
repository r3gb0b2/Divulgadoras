// @ts-nocheck
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';
import { firestore, functions } from '../firebase/config';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Persiste o token no servidor via Cloud Function de forma isolada.
 */
const persistToken = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ promoterId, token, metadata });
        return (result.data as any).success;
    } catch (error) {
        console.error("PushService Error:", error);
        return false;
    }
};

/**
 * Remove o vínculo do token no Firestore.
 */
export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        throw new Error("Falha ao remover vínculo do dispositivo.");
    }
};

/**
 * Sincroniza o token FCM com o banco de dados.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
        const { FCM } = await import('@capacitor-community/fcm');
        
        if (platform === 'ios') {
            try { await FCM.setAutoInit({ enabled: true }); } catch (e) {}
        }

        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken) {
            const saved = await persistToken(promoterId, fcmToken, { 
                platform, 
                updatedAt: new Date().toISOString() 
            });
            if (saved) return { success: true };
        }
        return { success: false, error: "Falha ao persistir token no banco." };
    } catch (error: any) {
        return { success: false, error: error.message || "Erro na sincronização." };
    }
};

/**
 * Inicialização do serviço de push.
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
            onStatusChange?.('denied', "Permissão de notificação negada.");
            return 'denied';
        }

        onStatusChange?.('granted');
        onStatusChange?.('syncing');
        
        const syncRes = await syncTokenWithServer(promoterId);
        if (syncRes.success) {
            onStatusChange?.('success');
        } else {
            onStatusChange?.('error', syncRes.error);
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async () => {
            const r = await syncTokenWithServer(promoterId);
            onStatusChange?.(r.success ? 'success' : 'error');
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