import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    // Variable d'env consommée par SocketClient pour joindre le serveur.
    // VITE_SERVER_URL=ws://localhost:2567
  },
  build: {
    target: 'es2021',
    sourcemap: true,
  },
});
