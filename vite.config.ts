import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [
        '@capacitor/core',
        '@capacitor/push-notifications',
        '@capacitor-community/fcm'
      ],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  resolve: {
    // Mantemos sem aliases complexos para evitar erros de resolução de diretório no Vercel/Vite
    alias: {
      '@': '.',
    }
  }
});