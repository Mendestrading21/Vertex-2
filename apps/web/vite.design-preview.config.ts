// Prévisualisation DESIGN sur la base synthétique vertex_e2e : proxy /api -> 8001.
// Configuration de développement (aucun secret) : `pnpm exec vite --config vite.design-preview.config.ts`
// avec l'API de prévisualisation sur 8001 ; `vite.config.ts` reste la référence de build.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.ts';
export default mergeConfig(base, defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8001', changeOrigin: false } } },
}));
