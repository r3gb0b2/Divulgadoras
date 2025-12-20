
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

/**
 * Inicializa as notificações push no dispositivo físico.
 * No iOS, isso solicitará a permissão "Deseja receber notificações?".
 */
export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push: Operação ignorada. Notificações nativas requerem um iPhone físico.");
        return false;
    }

    try {
        // 1. Verificar permissão
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push: Permissão negada pelo usuário.");
            return false;
        }

        // 2. Limpar listeners para evitar registros duplicados em re-renders
        await PushNotifications.removeAllListeners();

        // 3. Listener de Registro (Sucesso)
        // O token recebido aqui é o que o Firebase usará para enviar via Apple APNs
        PushNotifications.addListener('registration', async (token) => {
            const deviceToken = token.value;
            console.log('Push: Dispositivo registrado com sucesso. Token:', deviceToken);
            try {
                // Salva o token no perfil da divulgadora para permitir envios segmentados
                await savePushToken(promoterId, deviceToken);
            } catch (e) {
                console.error("Push: Erro ao salvar token no Firestore:", e);
            }
        });

        // 4. Listener de Erro no Registro
        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push: Erro nativo no registro do serviço:', JSON.stringify(error));
        });

        // 5. Listener de Recebimento (App aberto/Foreground)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push: Notificação recebida em primeiro plano:', notification);
        });

        // 6. Listener de Ação (Usuário clicou na notificação)
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            const data = notification.notification.data;
            console.log('Push: Usuário clicou na notificação. Dados recebidos:', data);
            
            if (data && data.url) {
                // Redireciona para a rota enviada (ex: /#/posts)
                let target = data.url;
                if (target.startsWith('/#')) target = target.substring(2);
                window.location.hash = target;
            }
        });

        // 7. Efetuar o registro no sistema da Apple/Google
        await PushNotifications.register();
        return true;

    } catch (error) {
        console.error("Push: Falha crítica na inicialização:", error);
        return false;
    }
};

/**
 * Remove todos os ouvintes do sistema.
 */
export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {
        console.error("Push: Erro ao remover listeners", e);
    }
};
