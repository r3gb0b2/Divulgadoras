
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { firestore, functions } from '../firebase/config';

/**
 * Salva o token ou o erro de diagnóstico no perfil da divulgadora
 */
const reportPushStatus = async (promoterId: string, data: any) => {
    try {
        const savePromoterToken = functions.httpsCallable('savePromoterToken');
        await savePromoterToken({ promoterId, ...data });
    } catch (e) {
        console.error("Falha ao reportar status de push:", e);
    }
};

export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push: Tentativa ${retryCount + 1}`);
        
        const isFCMAvailable = typeof FCM !== 'undefined' && FCM !== null && typeof FCM.getToken === 'function';

        if (!isFCMAvailable) {
            await reportPushStatus(promoterId, { error: "PLUGIN_FCM_MISSING_IN_BINARY" });
            throw new Error("DETECTION_FAILED");
        }

        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            await reportPushStatus(promoterId, { token: fcmToken });
            return fcmToken;
        }

        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e: any) {
        const errorMsg = e.message || "Unknown";
        if (errorMsg.includes("not implemented") || errorMsg === "DETECTION_FAILED") {
            // Se o FCM falhar, tentamos pegar o token nativo (APNs no iOS) como prova de que as permissões funcionam
            try {
                const nativeToken = await PushNotifications.register();
                await reportPushStatus(promoterId, { error: "FCM_NOT_IMPLEMENTED_BUT_REGISTERED" });
            } catch (regErr) {
                await reportPushStatus(promoterId, { error: "FULL_PUSH_FAILURE" });
            }
            throw new Error("DETECTION_FAILED");
        }
        throw e;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive !== 'granted') {
            await reportPushStatus(promoterId, { error: "PERMISSION_DENIED" });
            return false;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro concluído. Token nativo recebido.');
            // No iOS, o 'registration' retorna o token APNs. O FCM plugin converte.
            try {
                await getTokenAndSave(promoterId);
            } catch (err) {}
        });

        PushNotifications.addListener('registrationError', async (error) => {
            await reportPushStatus(promoterId, { error: `REGISTRATION_ERROR: ${error.error}` });
        });

        await PushNotifications.register();
        return true;
    } catch (error: any) {
        await reportPushStatus(promoterId, { error: `INIT_ERROR: ${error.message}` });
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    // Forçamos o registro nativo antes de pedir o token FCM
    await PushNotifications.register();
    return await getTokenAndSave(promoterId);
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {}
};
