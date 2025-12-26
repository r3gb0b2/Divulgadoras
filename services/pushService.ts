// @ts-nocheck
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import firebase from 'firebase/compat/app';
import { firestore, functions } from '../firebase/config';

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'syncing' | 'success' | 'error';

/**
 * Persiste o token no servidor via Cloud Function.
 */
const persistTokenOnServer = async (promoterId: string, token: string, metadata?: any): Promise<boolean> => {
    try {
        console.log(`[Push] Sincronizando token para promoter ${promoterId}...`);
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ 
            promoterId, 
            token, 
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                platform: Capacitor.getPlatform()
            }
        });
        const data = result.data as any;
        return !!data.success;
    } catch (error) {
        console.error("[Push] Erro ao persistir no servidor:", error);
        return false;
    }
};

/**
 * Obtém o token FCM real. Essencial para Android.
 */
const fetchFCMTokenManual = async (): Promise<string | null> => {
    try {
        const { FCM } = await import('@capacitor-community/fcm');
        const result = await FCM.getToken();
        return result.token || null;
    } catch (e) {
        console.error("[Push] Falha ao importar/usar plugin FCM:", e);
        return null;
    }
};

/**
 * Inicialização robusta.
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
        const permStatus = await PushNotifications.requestPermissions();
        
        if (permStatus.receive !== 'granted') {
            onStatusChange?.('denied', "Permissão negada. Ative as notificações para receber suas tarefas.");
            return 'denied';
        }

        onStatusChange?.('granted');

        // Limpa listeners antigos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        // 1. Ouvir registro nativo (Funciona bem no iOS)
        PushNotifications.addListener('registration', async (token) => {
            console.log("[Push] Registro nativo bem sucedido.");
            onStatusChange?.('syncing');
            
            // No Android, preferimos o token do plugin FCM para garantir compatibilidade
            let finalToken = token.value;
            if (Capacitor.getPlatform() === 'android') {
                const fcmToken = await fetchFCMTokenManual();
                if (fcmToken) finalToken = fcmToken;
            }

            const saved = await persistTokenOnServer(promoterId, finalToken);
            onStatusChange?.(saved ? 'success' : 'error', saved ? undefined : "Erro ao salvar token.");
        });

        PushNotifications.addListener('registrationError', (err) => {
            console.error("[Push] Erro nativo:", err.error);
            onStatusChange?.('error', `Falha no sistema: ${err.error}`);
        });

        // 2. Registrar
        await PushNotifications.register();

        // 3. FALLBACK ANDROID (CRÍTICO)
        // No Android, se após 4 segundos o listener de 'registration' não disparou, 
        // forçamos a busca do token manualmente.
        if (Capacitor.getPlatform() === 'android') {
            setTimeout(async () => {
                console.log("[Push] Verificação de redundância (Android)...");
                const manualToken = await fetchFCMTokenManual();
                if (manualToken) {
                    console.log("[Push] Token capturado via fallback.");
                    onStatusChange?.('syncing');
                    const saved = await persistTokenOnServer(promoterId, manualToken);
                    if (saved) onStatusChange?.('success');
                }
            }, 4000);
        }

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

export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            pushDiagnostics: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error: any) {
        console.error("Error deleting push token:", error);
    }
};