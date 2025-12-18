
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM correto e salva no Firestore.
 */
const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<boolean> => {
    try {
        console.log(`Push: Tentando obter token para o promoter ${promoterId} (Tentativa ${retryCount + 1})`);
        
        let fcmToken: string | null = null;

        // No iOS, precisamos converter o token APNs em FCM através do plugin community-fcm
        if (Capacitor.getPlatform() === 'ios') {
            const res = await FCM.getToken();
            fcmToken = res.token;
        } else {
            // No Android ou fallback, tentamos direto do plugin nativo
            const res = await FCM.getToken();
            fcmToken = res.token;
        }

        if (fcmToken) {
            console.log('Push: Token FCM obtido com sucesso:', fcmToken);
            await savePushToken(promoterId, fcmToken);
            return true;
        }

        // Se não obteve o token, tenta novamente após um delay (pode ser lentidão na conexão com Firebase)
        if (retryCount < 4) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        console.error('Push: Falha ao obter token após várias tentativas.');
        return false;
    } catch (e) {
        console.error("Push: Erro crítico ao obter/salvar token:", e);
        return false;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push: Rodando no navegador, notificações desativadas.");
        return false;
    }

    try {
        // 1. Solicita ou verifica permissões
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão negada pelo usuário.");
            return false;
        }

        // 2. Configura os Listeners
        await PushNotifications.removeAllListeners();

        // Este evento dispara quando o registro no APNs (Apple) ou GCM (Google) é concluído
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo concluído. Iniciando conversão para FCM...');
            await getTokenAndSave(promoterId);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro no registro nativo:', JSON.stringify(error));
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida:', notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            const data = notification.notification.data;
            if (data && data.url) {
                const target = data.url.replace('/#', '').replace('#', '');
                window.location.hash = target;
            }
        });

        // 3. Solicita o registro no serviço de push
        await PushNotifications.register();

        // 4. Força uma tentativa de captura imediata 
        // (Caso o app já estivesse registrado de uma vez anterior, o evento 'registration' pode não disparar)
        setTimeout(() => {
            getTokenAndSave(promoterId);
        }, 2000);

        return true;

    } catch (error) {
        console.error("Push: Erro na inicialização:", error);
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    console.log('Push: Sincronização manual solicitada...');
    return await getTokenAndSave(promoterId);
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {
        console.error("Push: Erro ao limpar listeners", e);
    }
};
