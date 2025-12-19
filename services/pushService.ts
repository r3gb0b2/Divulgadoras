import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { functions, firestore } from '../firebase/config';
import firebase from 'firebase/compat/app';

const reportTechnicalError = async (promoterId: string, errorMsg: string) => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            pushDiagnostics: {
                lastError: errorMsg,
                platform: Capacitor.getPlatform(),
                updatedAt: firebase.firestore.Timestamp.now()
            }
        });
    } catch (e) {}
};

export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        const isFCMAvailable = Capacitor.isPluginAvailable('FCM');

        if (!isFCMAvailable) {
            if (retryCount < 5) {
                // No iOS, aguarda um pouco mais pela ponte nativa
                await new Promise(resolve => setTimeout(resolve, 3000));
                return await getTokenAndSave(promoterId, retryCount + 1);
            }
            throw new Error("PLUGIN_FCM_NOT_IMPLEMENTED_ON_IOS");
        }

        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            const savePromoterToken = functions.httpsCallable('savePromoterToken');
            await savePromoterToken({ promoterId, token: fcmToken });
            return fcmToken;
        }
        return null;
    } catch (e: any) {
        await reportTechnicalError(promoterId, e.message || "Erro ao obter token");
        throw e;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive !== 'granted') return false;

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async () => {
            // Aguarda 2 segundos após o registro nativo para converter em FCM
            setTimeout(() => getTokenAndSave(promoterId), 2000);
        });

        await PushNotifications.register();
        return true;
    } catch (error: any) {
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    await PushNotifications.register();
    return await getTokenAndSave(promoterId);
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try { await PushNotifications.removeAllListeners(); } catch (e) {}
};