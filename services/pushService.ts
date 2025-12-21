
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
        // No iOS, o plugin pode demorar alguns milissegundos para injetar o bridge.
        // Verificamos se o objeto FCM existe e se o método getToken está implementado
        const isFCMAvailable = (typeof FCM !== 'undefined' && FCM !== null);

        if (!isFCMAvailable) {
            console.warn(`Push: Plugin FCM não detectado na tentativa ${retryCount + 1}`);
            if (retryCount < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await getTokenAndSave(promoterId, retryCount + 1);
            }
            throw new Error("PLUGIN_FCM_NOT_LOADED");
        }

        // Tenta obter o token. Se der "not implemented", o try/catch pegará.
        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push: Token obtido com sucesso.');
            const savePromoterToken = functions.httpsCallable('savePromoterToken');
            await savePromoterToken({ promoterId, token: fcmToken });
            
            await firestore.collection('promoters').doc(promoterId).update({
                "pushDiagnostics.lastError": firebase.firestore.FieldValue.delete()
            }).catch(() => {});

            return fcmToken;
        }

        return null;
    } catch (e: any) {
        const errorMsg = e.message || "Erro nativo desconhecido";
        console.error("Push: Erro ao obter token:", errorMsg);
        
        if (errorMsg.includes("not implemented")) {
            await reportTechnicalError(promoterId, "FCM_NOT_IMPLEMENTED_ON_NATIVE_SIDE");
        } else {
            await reportTechnicalError(promoterId, errorMsg);
        }
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

        // No iOS, o fluxo correto é:
        // 1. Registrar no APNs (PushNotifications.register)
        // 2. O evento 'registration' dispara
        // 3. O plugin FCM converte o token APNs em token FCM automaticamente
        PushNotifications.addListener('registration', async () => {
            try {
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.warn("Push: Registro nativo OK, mas falha ao converter para FCM.");
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            reportTechnicalError(promoterId, `NATIVE_REG_ERROR: ${error.error}`);
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
        // Aguarda um pouco para o bridge nativo processar o token
        await new Promise(resolve => setTimeout(resolve, 1000));
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
