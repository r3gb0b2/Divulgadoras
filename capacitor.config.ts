
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.equipecerta.app',
  appName: 'Equipe Certa',
  webDir: 'dist', // Certifique-se de que sua pasta de build se chama 'dist'
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
