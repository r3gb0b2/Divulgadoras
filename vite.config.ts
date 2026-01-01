
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
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/compat/app', 'firebase/compat/auth', 'firebase/compat/firestore']
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '.',
    },
  },
});
