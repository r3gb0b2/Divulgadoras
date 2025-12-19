
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { functions } from '../firebase/config';
import firebase from 'firebase/compat/app';

/**
 * Reporta o estado técnico do Push para o banco de dados.
 * Ajuda a identificar por que o token não está chegando no admin.
 */
const reportPushStatus = async (promoterId: string, status: { error?: string, token?: string }) => {
    try {
        const updatePushDiagnostics = functions.httpsCallable('updatePushDiagnostics');
        await updatePushDiagnostics({
            promoterId,
            diagnostics: {
                lastError: status.error || null,
                platform: Capacitor.getPlatform(),
                pluginStatus: (typeof FCM !== 'undefined' && typeof FCM.getToken === 'function') ? 'OK' : 'MISSING',
                updatedAt: firebase.firestore.Timestamp.now()
            },
            token: status.token || null
        });
    } catch (e) {
        console.error("Push Service: Falha ao reportar diagnóstico:", e);
    }
};

export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push: Tentando capturar token FCM... (Tentativa ${retryCount + 1})`);
        
        // Verifica se o plugin FCM está realmente carregado no binário
        const isFCMAvailable = typeof FCM !== 'undefined' && FCM !== null && typeof (FCM as any).getToken === 'function';

        if (!isFCMAvailable) {
            const error = "PLUGIN_FCM_NOT_DETECTED";
            await reportPushStatus(promoterId, { error });
            throw new Error(error);
        }

        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push: Token FCM obtido:', fcmToken);
            await reportPushStatus(promoterId, { token: fcmToken });
            return fcmToken;
        }

        // Retry logic for cases where the token takes time to generate
        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        await reportPushStatus(promoterId, { error: "EMPTY_TOKEN_AFTER_RETRIES" });
        return null;
    } catch (e: any) {
        const errorMsg = e.message || "Unknown native error";
        console.error("Push: Erro fatal ao obter token:", errorMsg);
        
        // Se o erro for "not implemented", significa que o plugin não foi compilado no App
        if (errorMsg.includes("not implemented") || errorMsg === "PLUGIN_FCM_NOT_DETECTED") {
            await reportPushStatus(promoterId, { error: "NATIVE_BRIDGE_FAILURE_NOT_IMPLEMENTED" });
            throw new Error("DETECTION_FAILED");
        }
        
        await reportPushStatus(promoterId, { error: errorMsg });
        throw e;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive !== 'granted') {
            await reportPushStatus(promoterId, { error: "USER_DENIED_PERMISSIONS" });
            return false;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo concluído.');
            try {
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.warn("Push: Registro nativo OK, mas conversão para FCM falhou.");
            }
        });

        PushNotifications.addListener('registrationError', async (error) => {
            console.error('Push: Erro no registro nativo:', error);
            await reportPushStatus(promoterId, { error: `NATIVE_REG_ERROR: ${error.error}` });
        });

        await PushNotifications.register();
        return true;
    } catch (error: any) {
        await reportPushStatus(promoterId, { error: `INIT_EXCEPTION: ${error.message}` });
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        // Força novo registro no sistema nativo
        await PushNotifications.register();
        return await getTokenAndSave(promoterId);
    } catch (e) {
        console.error("Push: Sincronização manual falhou.");
        throw e;
    }
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {}
};
