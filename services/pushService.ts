// @ts-nocheck
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';
import { firestore, functions } from '../firebase/config';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Persiste o token no banco através de Cloud Function (Região southamerica-east1).
 */
const persistTokenOnServer = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        console.log("Chamando savePromoterToken para:", promoterId);
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ 
            promoterId, 
            token, 
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            }
        });
        const data = result.data as any;
        if (!data.success) {
            console.error("Erro retornado pela função:", data.message);
        }
        return data.success;
    } catch (error) {
        console.error("Erro crítico ao chamar savePromoterToken:", error);
        return false;
    }
};

/**
 * Sincroniza o token FCM real com o servidor.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
        const { FCM } = await import('@capacitor-community/fcm');
        
        // Ativa o auto-init do FCM para garantir que o token seja renovado
        try { await FCM.setAutoInit({ enabled: true }); } catch (e) {}

        // Obtém o token específico do Firebase (essencial para Android)
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken) {
            const saved = await persistTokenOnServer(promoterId, fcmToken, { platform });
            if (saved) return { success: true };
            return { success: false, error: "Servidor não conseguiu salvar o token." };
        }
        return { success: false, error: "O plugin FCM não retornou um token válido." };
    } catch (error: any) {
        console.error("Falha no syncTokenWithServer:", error);
        return { success: false, error: error.message || "Erro desconhecido no plugin FCM." };
    }
};

/**
 * Inicialização com fluxo reforçado para Android.
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
        // 1. Permissões
        onStatusChange?.('requesting');
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied', "Permissão negada. Ative as notificações nas configurações do celular.");
            return 'denied';
        }

        onStatusChange?.('granted');

        // 2. Listeners
        await PushNotifications.removeAllListeners();

        // No Android, o registro nativo dispara o registration
        PushNotifications.addListener('registration', async (token) => {
            console.log("Device registrado nativamente. Token base:", token.value.substring(0, 10) + "...");
            onStatusChange?.('syncing');
            const r = await syncTokenWithServer(promoterId);
            onStatusChange?.(r.success ? 'success' : 'error', r.error);
        });

        PushNotifications.addListener('registrationError', (err) => {
            console.error("Erro no registro nativo Push:", err.error);
            onStatusChange?.('error', `Falha no sistema Android: ${err.error}`);
        });

        // 3. Efetuar Registro
        await PushNotifications.register();

        // 4. Fallback: Se após 2 segundos nada aconteceu, tentamos forçar via plugin FCM
        // Muito comum em Androids que já abriram o app antes.
        setTimeout(async () => {
            console.log("Verificação de redundância de token...");
            const r = await syncTokenWithServer(promoterId);
            if (r.success) {
                onStatusChange?.('success');
            }
        }, 2500);

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

// FIX: Added deletePushToken to fix the missing export error in AdminPushCampaignPage.tsx
export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            pushDiagnostics: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error: any) {
        console.error("Error deleting push token:", error);
        throw new Error("Não foi possível remover o vínculo do dispositivo.");
    }
};