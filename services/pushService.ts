
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Obtém o token FCM correto e salva no Firestore.
 * Inclui lógica de retentativa pois o Firebase iOS pode demorar alguns segundos 
 * para validar o APNs após o boot do app.
 */
const getTokenAndSave = async (promoterId: string, retryCount = 0): Promise<boolean> => {
    try {
        console.log(`Push Debug: Tentando obter token (Tentativa ${retryCount + 1}) para ${promoterId}`);
        
        let fcmToken: string | null = null;

        // No iOS, usamos obrigatoriamente o plugin community-fcm para converter o token Apple em Google
        if (Capacitor.getPlatform() === 'ios') {
            const res = await FCM.getToken();
            fcmToken = res.token;
        } else {
            // Android ou outros
            const res = await FCM.getToken();
            fcmToken = res.token;
        }

        if (fcmToken) {
            console.log('Push Debug: Token FCM obtido:', fcmToken);
            await savePushToken(promoterId, fcmToken);
            return true;
        }

        // Se falhou em obter o token, tenta novamente em 3 segundos (até 5 vezes)
        if (retryCount < 5) {
            console.log('Push Debug: Token ainda não disponível, agendando retentativa...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await getTokenAndSave(promoterId, retryCount + 1);
        }

        console.error('Push Debug: Falha definitiva ao obter token após 5 tentativas.');
        return false;
    } catch (e) {
        console.error("Push Debug: Erro crítico no processo de obtenção do token:", e);
        return false;
    }
};

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push: Rodando no navegador, notificações desativadas.");
        return false;
    }

    try {
        // 1. Verifica permissões existentes
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão negada.");
            return false;
        }

        // 2. Limpa e configura os Listeners
        await PushNotifications.removeAllListeners();

        // Evento disparado quando o registro no sistema da Apple/Google é feito
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push: Registro nativo (Apple/Google) OK. Convertendo para FCM...');
            await getTokenAndSave(promoterId);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro de registro nativo:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida em primeiro plano:', notification);
        });

        // 3. Registra o dispositivo
        await PushNotifications.register();

        // 4. Força uma tentativa imediata (caso o registro nativo já tenha ocorrido em sessões anteriores)
        // Isso resolve o caso de usuários que já aceitaram o push mas o token não foi salvo.
        setTimeout(() => {
            getTokenAndSave(promoterId);
        }, 1500);

        return true;

    } catch (error) {
        console.error("Push: Erro fatal na inicialização:", error);
        return false;
    }
};

export const syncPushTokenManually = async (promoterId: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    console.log('Push: Sincronização manual iniciada...');
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
