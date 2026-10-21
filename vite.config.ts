import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {isNestRoute} from './scripts/parity/nestRoutes.mjs';

const NEST_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3000';
const LEGACY_URL = process.env.LEGACY_URL || 'http://127.0.0.1:3847';
// VIP journey UI must keep login and inquiry APIs on the same legacy server.
const VIP_FLOW_LEGACY =
  process.env.VIP_FLOW_LEGACY === '1' || process.env.npm_lifecycle_event === 'dev:vip-ui';

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
        // Method + path routing: only routes listed in scripts/parity/nestRoutes.mjs go to Nest.
        '/api': {
          target: LEGACY_URL,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            const web = proxy.web.bind(proxy);
            proxy.web = (req, res, options, callback) => {
              const routed = {
                ...options,
                target: !VIP_FLOW_LEGACY && isNestRoute(req.method, req.url) ? NEST_URL : LEGACY_URL,
              };
              return callback ? web(req, res, routed, callback) : web(req, res, routed);
            };
          },
        },
      },
    },
  };
});
