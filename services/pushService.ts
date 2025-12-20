import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export interface PushResult {
    success: boolean;
    token?: string;
    error?: string;
}

/**
 * Inicializa as notificações push.
 */
export const initPushNotifications = async (promoterId: string): Promise<PushResult> => {
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    
    if (!Capacitor.isNativePlatform()) {
        return { success: false, error: "Push nativo não disponível em ambiente Web." };
    }

    try {
        console.log(`Push: Verificando permissões para ${promoterId}...`);
        const permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive !== 'granted') {
            const request = await PushNotifications.requestPermissions();
            if (request.receive !== 'granted') {
                return { success: false, error: "Permissão negada pelo usuário." };
            }
        }

        // Importante: Remover listeners antigos antes de registrar novos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        return new Promise(async (resolve) => {
            // Sucesso no Registro
            await PushNotifications.addListener('registration', async (token) => {
                const tokenValue = token.value;
                console.log("Push: Token nativo recebido:", tokenValue);
                
                // Verificação de segurança: Tokens APNs (iOS) puros são hexadecimais de 64 chars.
                // O FCM costuma ser bem mais longo e ter caracteres como ":".
                if (platform === 'ios' && tokenValue.length < 100 && !tokenValue.includes(':')) {
                    console.warn("Push: Detectado token APNs puro. O Firebase nativo pode não estar configurado corretamente no Xcode.");
                }

                try {
                    // Tenta salvar no Firestore
                    await savePushToken(promoterId, tokenValue, platform);
                    resolve({ success: true, token: tokenValue });
                } catch (e: any) {
                    console.error("Push: Erro ao persistir token no Firestore", e);
                    resolve({ success: false, error: "Token capturado, mas erro ao salvar no banco." });
                }
            });

            // Erro no Registro Nativo
            await PushNotifications.addListener('registrationError', (error) => {
                console.error("Push: Erro nativo reportado:", error.error);
                resolve({ success: false, error: error.error });
            });

            console.log("Push: Disparando registro no SO...");
            await PushNotifications.register();
        });

    } catch (error: any) {
        console.error("Push: Exceção no setup:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Limpa todos os ouvintes de notificação.
 */
export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllListeners();
        } catch (e) {
            console.error("Push: Erro ao remover ouvintes", e);
        }
    }
};