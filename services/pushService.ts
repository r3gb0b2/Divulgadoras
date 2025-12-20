import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export interface PushResult {
    success: boolean;
    token?: string;
    error?: string;
}

/**
 * Inicializa as notificações push para um promoter específico.
 */
export const initPushNotifications = async (promoterId: string): Promise<PushResult> => {
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    console.log(`Push: Iniciando processo para ${promoterId} na plataforma ${platform}`);

    if (!Capacitor.isNativePlatform()) {
        return { success: false, error: "Web não suporta Push nativo." };
    }

    return new Promise(async (resolve) => {
        let isResolved = false;

        // Timeout de 30 segundos para resposta dos serviços nativos (APNs/FCM)
        const timeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                console.error("Push: Tempo limite atingido aguardando resposta nativa.");
                resolve({ 
                    success: false, 
                    error: "Serviço de notificações demorou a responder. Verifique sua conexão ou configurações do sistema." 
                });
            }
        }, 30000);

        try {
            console.log("Push: Verificando permissões atuais...");
            const permStatus = await PushNotifications.checkPermissions();
            
            if (permStatus.receive !== 'granted') {
                console.log("Push: Solicitando permissões ao usuário...");
                const request = await PushNotifications.requestPermissions();
                if (request.receive !== 'granted') {
                    clearTimeout(timeout);
                    isResolved = true;
                    resolve({ success: false, error: "Permissão de notificação negada pelo usuário." });
                    return;
                }
            }

            // IMPORTANTE: Adicionar o listener ANTES de chamar o register()
            console.log("Push: Configurando ouvintes de evento...");
            
            // Sucesso no Registro
            const regListener = await PushNotifications.addListener('registration', async (token) => {
                console.log("Push: Sucesso! Token recebido:", token.value);
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
                
                try {
                    // Salva no banco usando a plataforma detectada
                    await savePushToken(promoterId, token.value, platform);
                    resolve({ success: true, token: token.value });
                } catch (e: any) {
                    console.error("Push: Erro ao salvar no Firestore:", e);
                    resolve({ success: false, error: "O token foi gerado, mas não pôde ser salvo no banco de dados." });
                }
            });

            // Erro no Registro
            const errListener = await PushNotifications.addListener('registrationError', (error) => {
                console.error("Push: Erro nativo retornado:", error);
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: `Erro nativo: ${error.error}` });
            });

            console.log("Push: Disparando registro nativo...");
            await PushNotifications.register();

        } catch (error: any) {
            console.error("Push: Exceção crítica no setup:", error);
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                resolve({ success: false, error: error.message || "Erro interno no setup de notificações." });
            }
        }
    });
};

export const clearPushListeners = async () => {
    if (Capacitor.isNativePlatform()) {
        try {
            console.log("Push: Removendo todos os ouvintes.");
            await PushNotifications.removeAllListeners();
        } catch (e) {
            console.error("Push: Erro ao limpar listeners:", e);
        }
    }
};