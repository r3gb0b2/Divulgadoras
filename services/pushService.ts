
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
        console.log(`Push: Tentativa de obter token FCM (Tentativa ${retryCount + 1})...`);
        
        // No iOS, o plugin FCM pode não estar disponível se o registro no AppDelegate falhar
        // ou se as bibliotecas nativas não foram compiladas corretamente.
        const isFCMAvailable = Capacitor.isPluginAvailable('FCM');

        if (!isFCMAvailable) {
            console.error("Push: Plugin FCM não detectado como implementado.");
            if (retryCount < 3) {
                // Pequena espera para garantir que o bridge nativo foi carregado
                await new Promise(resolve => setTimeout(resolve, 2000));
                return await getTokenAndSave(promoterId, retryCount + 1);
            }
            throw new Error("PLUGIN_FCM_NOT_IMPLEMENTED_ON_IOS");
        }

        // Obtém o token do Firebase (FCM) em vez do token APNS puro do iOS
        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push: Token FCM obtido com sucesso.');
            const savePromoterToken = functions.httpsCallable('savePromoterToken');
            await savePromoterToken({ promoterId, token: fcmToken });
            
            // Limpa erro anterior se houver sucesso
            await firestore.collection('promoters').doc(promoterId).update({
                "pushDiagnostics.lastError": firebase.firestore.FieldValue.delete()
            }).catch(() => {});

            return fcmToken;
        }

        return null;
    } catch (e: any) {
        const errorMsg = e.message || "Erro nativo desconhecido";
        console.error("Push: Erro fatal ao obter token:", errorMsg);
        
        // Se o erro for "not implemented", damos uma instrução clara no log do Firebase
        if (errorMsg.includes("not implemented")) {
            await reportTechnicalError(promoterId, "IOS_PLUGIN_NOT_CONFIGURED_IN_XCODE");
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

        // No iOS, o 'registration' retorna o token APNS (Apple)
        // Mas nós precisamos do token FCM (Google) que é obtido via plugin FCM.getToken()
        PushNotifications.addListener('registration', async () => {
            console.log("Push: Registro nativo concluído, solicitando token FCM...");
            try {
                // Aguarda um pouco para o Firebase iOS estabilizar a conexão
                setTimeout(async () => {
                    try {
                        await getTokenAndSave(promoterId);
                    } catch (err) {
                        console.warn("Push: Registro APNS OK, mas falha ao converter para FCM.");
                    }
                }, 1000);
            } catch (err) {
                console.warn("Push: Falha pós-registro.");
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error("Push: Erro de registro nativo:", error.error);
            reportTechnicalError(promoterId, `NATIVE_REG_ERROR: ${error.error}`);
        });

        // Este método inicia o fluxo de registro no APNS (iOS) ou FCM (Android)
        await PushNotifications.register();
        return true;
    } catch (error: any) {
        console.error("Push: Falha na inicialização:", error.message);
        await reportTechnicalError(promoterId, `INIT_FAILED: ${error.message}`);
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        // Garante que o registro nativo está ativo
        await PushNotifications.register();
        // Tenta buscar o token FCM
        return await getTokenAndSave(promoterId);
    } catch (e) {
        console.error("Push: Falha na sincronização manual.");
        throw e;
    }
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {}
};
