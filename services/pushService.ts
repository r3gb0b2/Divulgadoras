// @ts-nocheck
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';
import { firestore, functions } from '../firebase/config';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Persiste o token e metadados no servidor para diagnóstico.
 */
const persistTokenOnServer = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ 
            promoterId, 
            token, 
            metadata: {
                ...metadata,
                pluginVersion: 'Capacitor 6',
                lastAttempt: new Date().toISOString()
            }
        });
        return (result.data as any).success;
    } catch (error) {
        console.error("PushService Persist Error:", error);
        return false;
    }
};

/**
 * Remove o vínculo do token.
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
 * Sincroniza o token FCM (token de nuvem do Firebase).
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
        const { FCM } = await import('@capacitor-community/fcm');
        
        // No Android/iOS, garante que o autoInit está ligado
        try { await FCM.setAutoInit({ enabled: true }); } catch (e) {}

        // Obtém o token FCM real (essencial para o Admin SDK enviar as notificações)
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken) {
            const saved = await persistTokenOnServer(promoterId, fcmToken, { 
                platform,
                tokenType: 'FCM'
            });
            if (saved) return { success: true };
        }
        return { success: false, error: "Token gerado, mas não salvo no banco." };
    } catch (error: any) {
        console.error("FCM Token Error:", error);
        return { success: false, error: error.message || "Erro ao obter token FCM." };
    }
};

/**
 * Inicialização com suporte aprimorado para Android 13+.
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
        // 1. Verificar/Solicitar Permissões
        onStatusChange?.('requesting');
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied', "Permissão de notificação negada pelo usuário.");
            return 'denied';
        }

        onStatusChange?.('granted');

        // 2. IMPORTANTE: Configurar Listeners ANTES de registrar (Melhora Android)
        await PushNotifications.removeAllListeners();

        // Listener de sucesso no registro nativo
        PushNotifications.addListener('registration', async (token) => {
            console.log("Native registration success. Device Token:", token.value);
            onStatusChange?.('syncing');
            const r = await syncTokenWithServer(promoterId);
            onStatusChange?.(r.success ? 'success' : 'error', r.error);
        });

        // Listener de erro no registro nativo (Captura falhas do Google Play Services)
        PushNotifications.addListener('registrationError', (err) => {
            console.error("Native registration error:", err.error);
            onStatusChange?.('error', `Erro nativo: ${err.error}`);
        });

        // 3. Chamar registro nativo
        await PushNotifications.register();

        // 4. Forçar uma sincronização manual caso o listener de registration não dispare de imediato
        // (comum quando o app já está registrado no SO)
        setTimeout(async () => {
            const r = await syncTokenWithServer(promoterId);
            if (r.success) onStatusChange?.('success');
        }, 1500);

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