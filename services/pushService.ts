import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export interface PushResult {
    success: boolean;
    token?: string;
    error?: string;
}

/**
 * Inicializa as notificações push e verifica a validade do token.
 */
export const initPushNotifications = async (promoterId: string): Promise<PushResult> => {
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    
    if (!Capacitor.isNativePlatform()) {
        return { success: false, error: "Push nativo não disponível em ambiente Web." };
    }

    try {
        console.log(`Push: Solicitando permissões para divulgadora ${promoterId}...`);
        const permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive !== 'granted') {
            const request = await PushNotifications.requestPermissions();
            if (request.receive !== 'granted') {
                return { success: false, error: "Permissão negada pelo usuário." };
            }
        }

        // Limpar ouvintes antigos para evitar duplicidade
        await PushNotifications.removeAllListeners();

        return new Promise(async (resolve) => {
            // Evento disparado quando o registro no SO é concluído
            await PushNotifications.addListener('registration', async (token) => {
                const tokenValue = token.value;
                
                // DIAGNÓSTICO DE FORMATO (Registre e Compare)
                // Tokens APNs (iOS) puros costumam ter 64 caracteres hexadecimais.
                // Tokens FCM costumam ser muito mais longos (140+) e conter delimitadores.
                const isLikelyAPNs = /^[0-9a-fA-F]{64}$/.test(tokenValue);
                
                console.log("-----------------------------------------");
                console.log("PUSH TOKEN REGISTRADO:");
                console.log("VALOR:", tokenValue);
                console.log("COMPRIMENTO:", tokenValue.length);
                console.log("PROVÁVEL APNs (iOS Nativo):", isLikelyAPNs ? "SIM (Problema)" : "NÃO (OK)");
                console.log("-----------------------------------------");

                if (isLikelyAPNs && platform === 'ios') {
                    console.warn("ALERTA: O token recebido parece ser um token APNs puro. " +
                                 "Se as notificações falharem no servidor, verifique se o arquivo " +
                                 "GoogleService-Info.plist está correto e se o Firebase Messaging " +
                                 "está devidamente linkado no Xcode.");
                }
                
                try {
                    // Salva no Firestore com higienização rigorosa
                    await savePushToken(promoterId, tokenValue, platform);
                    console.log("Push: Token sincronizado com sucesso.");
                    resolve({ success: true, token: tokenValue });
                } catch (e: any) {
                    console.error("Push: Erro ao salvar token no banco:", e);
                    resolve({ success: false, error: "Erro ao gravar registro no servidor." });
                }
            });

            await PushNotifications.addListener('registrationError', (error) => {
                console.error("Push: Erro nativo no registro:", error.error);
                resolve({ success: false, error: error.error });
            });

            // Inicia o processo de registro
            await PushNotifications.register();
        });

    } catch (error: any) {
        console.error("Push: Falha crítica no setup:", error);
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