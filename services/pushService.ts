
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM correto (especialmente no iOS) e salva no Firestore.
 */
const getTokenAndSave = async (promoterId: string) => {
    try {
        let fcmToken: string | null = null;

        if (Capacitor.getPlatform() === 'ios') {
            // No iOS, o FCM precisa converter o token APNs explicitamente
            const res = await FCM.getToken();
            fcmToken = res.token;
            console.log('Push: Token FCM obtido (iOS):', fcmToken);
        } else {
            // No Android, o PushNotifications já retorna o token FCM no evento
            // Mas buscamos novamente para garantir consistência se necessário
            const res = await FCM.getToken();
            fcmToken = res.token;
            console.log('Push: Token FCM obtido (Android):', fcmToken);
        }

        if (fcmToken) {
            await savePushToken(promoterId, fcmToken);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Push: Erro ao obter/salvar token:", e);
        return false;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push notifications: Apenas em dispositivos nativos (App).");
        return false;
    }

    try {
        // 1. Verificar permissão
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push notifications: Permissão negada pelo usuário.");
            return false;
        }

        // 2. Registrar Listeners (Limpa anteriores para evitar duplicidade)
        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Evento de registro nativo recebido.');
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
                // Remove prefixo de hash se houver e navega
                const target = data.url.replace('/#', '').replace('#', '');
                window.location.hash = target;
            }
        });

        // 3. Solicitar registro nativo
        await PushNotifications.register();

        // 4. Fallback: Tenta buscar o token imediatamente caso o app já esteja registrado
        // Isso resolve o problema de o listener 'registration' não disparar em aberturas subsequentes
        setTimeout(() => {
            getTokenAndSave(promoterId);
        }, 1000);

        return true;

    } catch (error) {
        console.error("Push: Erro na inicialização crítica:", error);
        return false;
    }
};

/**
 * Função exposta para o botão de "Sincronizar" na UI
 */
export const syncPushTokenManually = async (promoterId: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
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
