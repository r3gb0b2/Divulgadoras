
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.equipecerta.app',
  appName: 'Equipe Certa',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https', // Garante que o app rode em um contexto seguro
    allowNavigation: ['*'] // Permite carregar recursos externos como Firebase e Tailwind
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
