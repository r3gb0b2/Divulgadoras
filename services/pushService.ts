
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM e salva no banco chamando a Cloud Function correspondente.
 */
export const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;

    try {
        console.log(`Push Debug: Tentando capturar token... (${retryCount + 1}/5)`);
        
        // Verificação de segurança: O plugin FCM community pode não estar vinculado no iOS
        if (!FCM || typeof FCM.getToken !== 'function') {
            console.warn("Push Debug: Plugin FCM não detectado no sistema nativo.");
            throw new Error("Plugin de notificações não inicializado.");
        }

        const res = await FCM.getToken();
        const fcmToken = res.token;

        if (fcmToken) {
            console.log('Push Debug: Token encontrado:', fcmToken);
            const success = await savePushToken(promoterId, fcmToken);
            if (success) return fcmToken;
            throw new Error("Falha ao salvar o token via Cloud Function.");
        }

        if (retryCount < 5) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        return null;
    } catch (e: any) {
        console.error("Push Debug: Erro no processo de registro:", e);
        
        // Trata especificamente o erro de plugin não implementado (comum no iOS se não configurado no Xcode)
        if (e.message && e.message.includes("not implemented")) {
            throw new Error("O suporte a notificações push nativas não foi detectado nesta versão do App.");
        }
        
        throw e;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão negada pelo usuário.");
            return false;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo concluído. Tentando converter para FCM...');
            try {
                // No iOS, o token de 'registration' é o APNs. O FCM.getToken() converte para o formato Google.
                await getTokenAndSave(promoterId);
            } catch (err) {
                console.error("Erro ao converter token para FCM:", err);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo:', error);
        });

        await PushNotifications.register();

        // Tenta buscar o token FCM após um curto delay caso a permissão já exista
        setTimeout(async () => {
            try {
                // Verifica se o plugin FCM está disponível antes de tentar
                if (FCM && typeof FCM.getToken === 'function') {
                    await getTokenAndSave(promoterId);
                }
            } catch (err) {
                console.error("Erro no fetch inicial do push:", err);
            }
        }, 2000);

        return true;
    } catch (error) {
        console.error("Push: Erro na inicialização:", error);
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) return null;
    return await getTokenAndSave(promoterId);
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {
        console.warn("Erro ao limpar listeners de push:", e);
    }
};
