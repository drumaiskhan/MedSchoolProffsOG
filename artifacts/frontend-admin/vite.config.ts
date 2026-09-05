import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT/BASE_PATH are provided automatically on Replit.
// Outside Replit, these fall back to sensible defaults.
const port = Number(process.env.PORT) || 5174;
const basePath = process.env.BASE_PATH || '/';

// Express API target for local development.
const apiProxyTarget =
  process.env.API_PROXY_TARGET ||
  `http://localhost:${Number(process.env.API_PORT) || 3001}`;

export default defineConfig({
  base: basePath,

  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),

    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },

    dedupe: ['react', 'react-dom'],
  },

  // Netlify deployment output.
  // This creates:
  // frontend-admin/dist/index.html
  // frontend-admin/dist/assets/...
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },

  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,

    fs: {
      strict: true,
    },

    proxy: process.env.VITE_API_BASE_URL
      ? undefined
      : {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
        },
  },

  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
