
declare module '@capacitor-community/fcm' {
  export interface FCMPlugin {
    getToken(): Promise<{ token: string }>;
    setAutoInit(options: { enabled: boolean }): Promise<void>;
    isAutoInitEnabled(): Promise<{ enabled: boolean }>;
    subscribeTo(options: { topic: string }): Promise<void>;
    unsubscribeFrom(options: { topic: string }): Promise<void>;
    deleteInstance(): Promise<void>;
  }
  export const FCM: FCMPlugin;
}
