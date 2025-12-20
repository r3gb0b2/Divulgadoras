
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export interface PushResult {
    success: boolean;
    token?: string;
    error?: string;
}

export const initPushNotifications = async (promoterId: string): Promise<PushResult> => {
    console.log("Push: Iniciando processo para", promoterId);

    if (!Capacitor.isNativePlatform()) {
        return { success: false, error: "Web não suporta Push nativo." };
    }

    if (Capacitor.getPlatform() === 'ios' && !Capacitor.isNativePlatform()) {
        return { success: false, error: "Push não funciona no simulador." };
    }

    return new Promise(async (resolve) => {
        let isResolved = false;

        // Aumentado para 30s para casos de rede lenta no primeiro registro
        const timeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                console.error("Push: APNs não respondeu após 30 segundos.");
                resolve({ 
                    success: false, 
                    error: "APNs Timeout: O celular não recebeu resposta da Apple. Verifique o AppDelegate.swift no Xcode." 
                });
            }
        }, 30000);

        try {
            console.log("Push: Verificando permissões...");
            const permStatus = await PushNotifications.checkPermissions();
            
            if (permStatus.receive !== 'granted') {
                console.log("Push: Solicitando permissões ao usuário...");
                const request = await PushNotifications.requestPermissions();
                if (request.receive !== 'granted') {
                    clearTimeout(timeout);
                    resolve({ success: false, error: "Permissão de notificação negada no iOS." });
                    return;
                }
            }

            console.log("Push: Removendo listeners antigos...");
            await PushNotifications.removeAllListeners();

            // SUCESSO
            PushNotifications.addListener('registration', async (token) => {
                console.log("Push: SUCESSO! Token recebido do iOS:", token.value);
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
                
                try {
                    await savePushToken(promoterId, token.value, 'ios');
                    resolve({ success: true, token: token.value });
                } catch (e) {
                    resolve({ success: false, error: "Falha ao salvar no banco (Firestore)." });
                }
            });

            // ERRO NATIVO
            PushNotifications.addListener('registrationError', (error) => {
                console.error("Push: Erro retornado pelo iOS:", error);
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: `Erro iOS: ${error.error}` });
            });

            console.log("Push: Disparando PushNotifications.register()...");
            await PushNotifications.register();

        } catch (error: any) {
            console.error("Push: Exceção no try/catch:", error);
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            resolve({ success: false, error: error.message || "Erro no setup." });
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
