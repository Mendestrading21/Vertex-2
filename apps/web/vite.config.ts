/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const WEB_ROOT = fileURLToPath(new URL('.', import.meta.url));
const DESIGN_ASSETS_ROOT = fileURLToPath(new URL('../../design-assets', import.meta.url));

/**
 * Proxy `/api` → API locale (loopback uniquement) pour les serveurs de
 * développement et de prévisualisation Vite. Aucun rôle en production : le
 * build livré ne contient aucun proxy ni aucune adresse.
 */
const LOCAL_API_PROXY = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: false,
  },
} as const;

/**
 * En-têtes de refus par défaut des serveurs LOCAUX (développement et
 * prévisualisation). Mesuré le 2026-09-06 : l'interface servie ne renvoyait
 * que `Vary` et `Content-Type`, là où l'API en pose trois depuis le même jour.
 *
 * Ces en-têtes n'ont AUCUN rôle en production : ils sont posés par le serveur
 * qui sert les fichiers, jamais contenus dans le build. Un hébergeur réel
 * devra les poser lui-même — c'est écrit ici pour que personne ne croie que
 * le build les porte.
 *
 * `frame-ancestors 'none'` seulement : une politique de contenu complète
 * (`script-src`, `style-src`) se décide avec l'hébergement, pas dans un
 * serveur de développement, et une politique fausse est pire qu'aucune.
 */
const LOCAL_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "frame-ancestors 'none'",
} as const;

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
  },
  server: {
    fs: {
      // Les glyphes audités vivent dans le catalogue partagé du dépôt.
      allow: [WEB_ROOT, DESIGN_ASSETS_ROOT],
    },
    proxy: LOCAL_API_PROXY,
    headers: LOCAL_SECURITY_HEADERS,
  },
  preview: {
    proxy: LOCAL_API_PROXY,
    headers: LOCAL_SECURITY_HEADERS,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    /*
      LE PLAFOND D'UN TEST DOIT DÉPASSER CELUI D'UNE ATTENTE, SINON IL LE
      MANGE. `setup.ts` porte le budget d'attente d'un `findBy*` à 4 s, parce
      qu'un fichier de page monte l'application entière. Or le plafond d'un
      TEST restait à 5 s, celui de Vitest par défaut : un test qui attend deux
      rendus successifs — monter la page, puis « Calculer » — dépassait donc
      les 5 s dès que la machine était chargée, et six tests du Simulateur
      échouaient EXACTEMENT à 5,0 s en suite complète alors qu'ils passent
      isolément (mesuré trois fois le 2026-09-06, avec la pile live en marche).

      15 s N'AFFAIBLIT AUCUNE ASSERTION : un test dont l'attente n'est jamais
      satisfaite échoue toujours, simplement plus tard. Ce qui disparaît, c'est
      la panne qui dépend de la charge de la machine — un rouge qui ne dit rien
      du produit.
    */
    testTimeout: 15_000,
  },
});
