// @ts-nocheck
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';
import { firestore, functions } from '../firebase/config';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Persiste o token no banco (Implementação local para evitar imports circulares)
 */
const internalSaveToken = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ promoterId, token, metadata });
        return (result.data as any).success;
    } catch (error) {
        return false;
    }
};

/**
 * Remove o token do banco
 */
export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        throw new Error("Falha ao remover vínculo.");
    }
};

/**
 * Sincroniza o token FCM
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
            const saved = await internalSaveToken(promoterId, fcmToken, { platform, updatedAt: new Date().toISOString() });
            if (saved) return { success: true };
        }
        return { success: false, error: "Falha na persistência." };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

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
        if (permStatus.receive === 'prompt') permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied');
            return 'denied';
        }

        onStatusChange?.('granted');
        onStatusChange?.('syncing');
        
        const res = await syncTokenWithServer(promoterId);
        if (res.success) onStatusChange?.('success');

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
        try { await PushNotifications.removeAllListeners(); } catch (e) {}
    }
};