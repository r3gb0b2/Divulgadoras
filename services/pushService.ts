
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { functions, firestore } from '../firebase/config';
import firebase from 'firebase/compat/app';

/**
 * Registra logs de erro técnicos no perfil da divulgadora para que o admin saiba o que houve.
 */
const reportTechnicalError = async (promoterId: string, errorMsg: string) => {
    try {
        await firestore.collection('promoters').doc(promoterId).update({
            pushDiagnostics: {
                lastError: errorMsg,
                platform: Capacitor.getPlatform(),
                pluginStatus: (typeof FCM !== 'undefined' && FCM !== null) ? 'LOADED' : 'NOT_LOADED',
                updatedAt: firebase.firestore.Timestamp.now()
            }
        });
    } catch (e) {
        console.error("Falha ao salvar log de erro:", e);
    }
};

export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push: Tentativa de obter token ${retryCount + 1}...`);
        
        // No iOS, o plugin pode demorar alguns milissegundos para injetar o bridge.
        const isFCMAvailable = (typeof FCM !== 'undefined' && FCM !== null);

        if (!isFCMAvailable) {
            if (retryCount < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await getTokenAndSave(promoterId, retryCount + 1);
            }
            throw new Error("PLUGIN_FCM_NOT_LOADED");
        }

        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push: Token obtido com sucesso.');
            const savePromoterToken = functions.httpsCallable('savePromoterToken');
            await savePromoterToken({ promoterId, token: fcmToken });
            
            // Limpa erro anterior se houver sucesso
            await firestore.collection('promoters').doc(promoterId).update({
                "pushDiagnostics.lastError": firebase.firestore.FieldValue.delete()
            }).catch(() => {});

            return fcmToken;
        }

        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e: any) {
        const errorMsg = e.message || "Erro nativo desconhecido";
        console.error("Push: Erro fatal:", errorMsg);
        await reportTechnicalError(promoterId, errorMsg);
        throw e;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive !== 'granted') {
            await reportTechnicalError(promoterId, "USER_DENIED_PERMISSIONS");
            return false;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async () => {
            try {
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.warn("Push: Registro nativo OK, mas falha no FCM.");
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            reportTechnicalError(promoterId, `NATIVE_ERROR: ${error.error}`);
        });

        await PushNotifications.register();
        return true;
    } catch (error: any) {
        await reportTechnicalError(promoterId, `INIT_FAILED: ${error.message}`);
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        await PushNotifications.register();
        return await getTokenAndSave(promoterId);
    } catch (e) {
        throw e;
    }
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {}
};
