import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT/BASE_PATH are provided automatically on Replit (each service gets its
// own). Outside Replit (local dev on any machine, or a platform like
// Vercel/Netlify/Railway/Render) these fall back to sane defaults so
// `vite dev`/`vite build` just work. The admin app defaults to a different
// port than frontend-student (5174 vs 5173) so `pnpm run dev` can run both
// at once locally without a port collision — with `strictPort: true` below,
// a collision would otherwise crash whichever of the two starts second.
const port = Number(process.env.PORT) || 5174;
const basePath = process.env.BASE_PATH || '/';

// Where the Express API lives during local dev. The frontend proxies
// `/api/*` here so `fetch('/api/...')` works without CORS configuration.
// In production, set VITE_API_BASE_URL instead (see src/lib/api.ts) if the
// frontend and backend are deployed to different domains/platforms.
const apiProxyTarget = process.env.API_PROXY_TARGET || `http://localhost:${Number(process.env.API_PORT) || 3001}`;

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
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
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
      ? undefined // frontend calls a full remote API URL — no local proxy needed
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
