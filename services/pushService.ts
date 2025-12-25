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
        console.log(`[PushService] Tentando salvar token para ${promoterId}...`);
        const saveFunc = functions.httpsCallable('savePromoterToken');
        const result = await saveFunc({ 
            promoterId, 
            token, 
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                platform: Capacitor.getPlatform(),
                plugin: 'capacitor-fcm'
            }
        });
        const data = result.data as any;
        if (data.success) {
            console.log("[PushService] Token persistido com sucesso no Firestore.");
        } else {
            console.error("[PushService] Servidor retornou erro:", data.message);
        }
        return data.success;
    } catch (error) {
        console.error("[PushService] Erro crítico ao chamar savePromoterToken:", error);
        return false;
    }
};

/**
 * Sincroniza o token FCM real com o servidor.
 * No Android, isso garante que pegamos o token de nuvem correto.
 * No iOS, o plugin converte o token APNS para FCM automaticamente.
 */
const syncTokenWithServer = async (promoterId: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const platform = Capacitor.getPlatform();
        const { FCM } = await import('@capacitor-community/fcm');
        
        // Garante inicialização
        try { await FCM.setAutoInit({ enabled: true }); } catch (e) {}

        // Obtém o token FCM (mais confiável que o evento registration direto no Android)
        const result = await FCM.getToken();
        const fcmToken = result.token;

        if (fcmToken) {
            console.log(`[PushService] Token FCM obtido (${platform}):`, fcmToken.substring(0, 10) + "...");
            const saved = await persistTokenOnServer(promoterId, fcmToken, { platform });
            if (saved) return { success: true };
            return { success: false, error: "Servidor não salvou o token." };
        }
        return { success: false, error: "Token FCM vazio retornado pelo plugin." };
    } catch (error: any) {
        console.error("[PushService] Falha na sincronização FCM:", error);
        return { success: false, error: error.message || "Erro no plugin FCM." };
    }
};

/**
 * Inicialização com fluxo reforçado para Android e estável para iOS.
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
        // 1. Verificação de Permissões
        onStatusChange?.('requesting');
        let permStatus = await PushNotifications.checkPermissions();
        
        // Se for Android 13+ ou iOS e não tiver permissão
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("[PushService] Permissão de notificação negada.");
            onStatusChange?.('denied', "Permissão negada. Ative as notificações para receber alertas de posts.");
            return 'denied';
        }

        onStatusChange?.('granted');

        // 2. Configurar Listeners
        await PushNotifications.removeAllListeners();

        // Este evento dispara no iOS e Android quando o registro nativo termina
        PushNotifications.addListener('registration', async (token) => {
            console.log("[PushService] Evento 'registration' disparado.");
            onStatusChange?.('syncing');
            const r = await syncTokenWithServer(promoterId);
            onStatusChange?.(r.success ? 'success' : 'error', r.error);
        });

        PushNotifications.addListener('registrationError', (err) => {
            console.error("[PushService] Erro no registro nativo:", err.error);
            onStatusChange?.('error', `Erro no sistema de notificações: ${err.error}`);
        });

        // 3. Efetuar Registro Nativo
        await PushNotifications.register();

        // 4. Fallback de Segurança (Crucial para Android)
        // Se após 3 segundos o token ainda não subiu (comum quando o app já estava aberto)
        setTimeout(async () => {
            console.log("[PushService] Rodando verificação de redundância...");
            const r = await syncTokenWithServer(promoterId);
            if (r.success) {
                onStatusChange?.('success');
            }
        }, 3000);

        return 'granted';
    } catch (error: any) {
        console.error("[PushService] Erro na inicialização:", error);
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

/**
 * Remove o vínculo do token (útil no logout).
 */
export const deletePushToken = async (promoterId: string): Promise<void> => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            pushDiagnostics: firebase.firestore.FieldValue.delete(),
            lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log("[PushService] Token removido do banco.");
    } catch (error: any) {
        console.error("[PushService] Erro ao deletar token:", error);
        throw new Error("Não foi possível remover o vínculo do dispositivo.");
    }
};