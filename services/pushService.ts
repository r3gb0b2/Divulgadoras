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

        // Limpar ouvintes para garantir que apenas um processo trate o registro
        await PushNotifications.removeAllListeners();

        return new Promise(async (resolve) => {
            // Sucesso no Registro: Este evento dispara logo após o .register()
            await PushNotifications.addListener('registration', async (token) => {
                const tokenValue = token.value;
                
                // LOG PARA DEBUG (Requisito: Registre e Compare)
                console.log("-----------------------------------------");
                console.log("PUSH TOKEN GERADO NO CLIENTE:");
                console.log("ID:", promoterId);
                console.log("TOKEN:", tokenValue);
                console.log("COMPRIMENTO:", tokenValue.length);
                console.log("PLATAFORMA:", platform);
                console.log("-----------------------------------------");
                
                try {
                    // Salva no Firestore com a limpeza rigorosa já implementada no promoterService
                    await savePushToken(promoterId, tokenValue, platform);
                    
                    // Feedback visual discreto para o console, alerta apenas se necessário
                    console.log("Push: Dispositivo vinculado com sucesso.");
                    
                    resolve({ success: true, token: tokenValue });
                } catch (e: any) {
                    console.error("Push: Erro ao salvar no banco:", e);
                    resolve({ success: false, error: "Token gerado, mas falha ao sincronizar com o servidor." });
                }
            });

            // Erro no Registro Nativo
            await PushNotifications.addListener('registrationError', (error) => {
                console.error("Push: Erro nativo reportado pelo SO:", error.error);
                resolve({ success: false, error: error.error });
            });

            console.log("Push: Solicitando registro ao sistema operacional...");
            await PushNotifications.register();
        });

    } catch (error: any) {
        console.error("Push: Exceção no processo de setup:", error);
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