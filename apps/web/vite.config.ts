import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: {
  env: Record<string, string | undefined>;
};

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3400'
    }
  }
});
