
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './promoterService';

export const initPushNotifications = async (promoterId: string) => {
    if (!Capacitor.isNativePlatform()) {
        console.log("Push notifications are only available on native devices.");
        return;
    }

    try {
        // 1. Check permission
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn("Push notification permission denied.");
            return;
        }

        // 2. Register listeners (must be done before registering)
        
        // On success, we get the token
        PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success, token: ' + token.value);
            // Save token to Firestore linked to the promoter
            try {
                await savePushToken(promoterId, token.value);
            } catch (e) {
                console.error("Failed to save push token to database", e);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Error on push registration: ' + JSON.stringify(error));
        });

        // Show alert/toast when notification arrives in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push received: ', notification);
            // You can implement a custom toast here if you want
            // For now, let's just log it. The OS usually handles the rest or Capacitor allows local notifications.
        });

        // Handle action when user taps the notification
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push action performed: ', notification);
            const data = notification.notification.data;
            if (data && data.url) {
                window.location.href = data.url; // Navigate to specific page if URL is provided
            }
        });

        // 3. Register with FCM
        await PushNotifications.register();

    } catch (error) {
        console.error("Error initializing push notifications:", error);
    }
};

export const clearPushListeners = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await PushNotifications.removeAllListeners();
    } catch (e) {
        console.error("Error clearing push listeners", e);
    }
};
