
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Definimos módulos que são carregados via CDN/Import Map como externos
      external: [
        '@capacitor/core',
        '@capacitor/push-notifications',
        '@capacitor-community/fcm',
        'xlsx'
      ],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  resolve: {
    // Como o projeto não usa uma pasta /src estruturada (arquivos na raiz), removemos o alias complexo
    alias: {
      '@': '.',
    },
  },
});
