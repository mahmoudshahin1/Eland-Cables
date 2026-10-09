import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Allow Cursor Cloud / preview Host headers. Vite 6 blocks unknown hosts.
      allowedHosts: true as const,
      host: true,
      port: 5173,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/auth': {
          target: process.env.BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        '/api/admin/identity': {
          target: process.env.BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        '/api/admin/customers': {
          target: process.env.BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost:3847',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
