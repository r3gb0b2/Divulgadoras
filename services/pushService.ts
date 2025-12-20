
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export const initPushNotifications = async (promoterId: string): Promise<string | null> => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push: Ambiente web detectado.");
        return null;
    }

    // Se estiver no simulador iOS, o registro vai travar. Vamos avisar.
    if (Capacitor.getPlatform() === 'ios' && !Capacitor.isNativePlatform()) {
        console.warn("Push: Notificações não funcionam em simuladores iOS.");
        return null;
    }

    return new Promise(async (resolve) => {
        let isResolved = false;

        // Timeout de segurança: se o sistema não responder em 10s, cancela.
        const timeout = setTimeout(() => {
            if (!isResolved) {
                console.error("Push: Tempo limite de registro atingido.");
                isResolved = true;
                resolve(null);
            }
        }, 10000);

        try {
            const permStatus = await PushNotifications.checkPermissions();
            
            if (permStatus.receive !== 'granted') {
                const request = await PushNotifications.requestPermissions();
                if (request.receive !== 'granted') {
                    console.warn("Push: Permissão negada pelo usuário.");
                    clearTimeout(timeout);
                    resolve(null);
                    return;
                }
            }

            await PushNotifications.removeAllListeners();

            // Ouvinte de Sucesso
            PushNotifications.addListener('registration', async (token) => {
                console.log("Push: Registro bem sucedido via hardware.");
                const platform = Capacitor.getPlatform().toLowerCase() as 'ios' | 'android';
                
                if (promoterId && !isResolved) {
                    await savePushToken(promoterId, token.value, platform);
                    clearTimeout(timeout);
                    isResolved = true;
                    resolve(token.value);
                }
            });

            // Ouvinte de Erro (Geralmente por falta de configuração no Xcode)
            PushNotifications.addListener('registrationError', (error) => {
                console.error('Push: Erro de registro no sistema:', error);
                if (!isResolved) {
                    clearTimeout(timeout);
                    isResolved = true;
                    resolve(null);
                }
            });

            // Ouvinte de Notificação Recebida
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push: Recebida em primeiro plano:', notification);
            });

            // Ouvinte de Ação (Clique na notificação)
            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                const data = notification.notification.data;
                if (data && data.url) {
                    let target = data.url;
                    if (target.startsWith('/#')) target = target.substring(2);
                    window.location.hash = target;
                }
            });

            console.log("Push: Solicitando token ao sistema operacional...");
            await PushNotifications.register();

        } catch (error) {
            console.error("Push: Falha fatal no setup:", error);
            clearTimeout(timeout);
            resolve(null);
        }
    });
};

export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {
            console.error("Push: Erro ao limpar listeners:", e);
        }
    }
};
