// Prévisualisation DESIGN sur la base synthétique vertex_e2e : proxy /api -> 8001.
// Fichier de travail de la refonte UI (non livré) ; `vite.config.ts` reste la référence.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.ts';
export default mergeConfig(base, defineConfig({
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8001', changeOrigin: false } } },
}));
