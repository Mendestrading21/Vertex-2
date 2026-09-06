import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * LES MOTEURS DE GRAPHIQUE SONT DOUBLÉS POUR TOUTE LA SUITE.
 *
 * MESURÉ EN CI LE 2026-09-06 : 1 197 tests verts, et pourtant le travail web
 * ROUGE — « Vitest caught 1 unhandled error ». La trace vient de
 * `lightweight-charts` : `ChartWidget._private__drawImpl` appelé depuis une
 * `requestAnimationFrame` de jsdom APRÈS que le graphique a été retiré, donc
 * `ensureNotNull` sur un axe déjà détruit. Vitest l'attribue au fichier qui
 * s'exécutait à cet instant, pas à celui qui a créé le graphique : le rapport
 * accusait `AiExplanationPanel.test.tsx`, qui n'a pas de graphique.
 *
 * POURQUOI ICI ET NON DANS TROIS FICHIERS. Trois fichiers de page déclaraient
 * déjà leur propre double ; il en restait deux qui montent l'application
 * ENTIÈRE (le routeur, donc la page Analyse et ses chandeliers) sans doubler
 * quoi que ce soit. Ajouter le double au cas par cas laisse la porte ouverte
 * au prochain fichier qui montera l'application. Le double vit donc une seule
 * fois, pour toute la suite.
 *
 * CE QUE CE DOUBLE N'EST PAS : un contournement d'assertion. Un moteur de
 * canevas dans jsdom ne dessine RIEN — il n'y a ni contexte 2D, ni mise en
 * page, ni taille. Aucun test ne peut donc rien vérifier du rendu graphique ;
 * ce que les tests vérifient est notre propre balisage (cadre, légende,
 * description accessible, table équivalente), et il est rendu à l'identique.
 * Le rendu graphique réel est vérifié là où il existe : par les parcours
 * Playwright sur Chromium.
 *
 * Un fichier qui a besoin d'observer les appels (`setData`, `remove`) déclare
 * son propre `vi.mock` : la déclaration du fichier l'emporte sur celle-ci.
 */
vi.mock('../charts/lightweightChartsLoader.ts', () => ({
  CandlestickSeries: { name: 'Candlestick' },
  HistogramSeries: { name: 'Histogram' },
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    remove: vi.fn(),
  })),
}));

vi.mock('../charts/echartsLoader.ts', () => ({
  echarts: {
    init: vi.fn(() => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getZr: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
    })),
  },
}));

/**
 * REFONTE UI 2026-09-05 — LE PREMIER TEST D'UNE PAGE PERDAIT LA COURSE.
 *
 * Chaque fichier de page monte l'application ENTIÈRE (routeur, React Query,
 * shell, planche) dans son premier `findByRole`. Sous une exécution complète
 * et parallèle de la suite, ce premier rendu dépasse le budget PAR DÉFAUT de
 * `findBy*` (1 000 ms) ; mesuré ici : cinq fichiers rouges en suite complète,
 * verts un par un, toujours sur le PREMIER test du fichier. Ce n'est pas un
 * défaut du produit ni des assertions : c'est un délai d'attente calibré pour
 * un composant isolé, appliqué à une page.
 *
 * Le budget passe à 4 s. Aucune assertion n'est affaiblie : une page qui ne
 * rend pas ce qu'on attend échoue toujours — quatre secondes plus tard.
 */
configure({ asyncUtilTimeout: 4_000 });

/**
 * LOT T6 — `matchMedia` MANQUAIT À L'ENVIRONNEMENT, ET DES ERREURS NON
 * CAPTURÉES EN SORTAIENT.
 *
 * jsdom n'implémente pas `window.matchMedia`. Toute bibliothèque qui l'appelle
 * sans se protéger explose — et `fancy-canvas`, dépendance de Lightweight
 * Charts, l'appelle dans une MICRO-TÂCHE, donc APRÈS que le fichier de test a
 * rendu la main et que la fenêtre a été détruite. Résultat mesuré :
 * `vitest run` rapportait « 7 unhandled errors » à côté de 955 tests verts,
 * avec l'avertissement de Vitest lui-même — « This might cause false positive
 * tests ». Une suite verte accompagnée d'erreurs non capturées n'est pas une
 * preuve.
 *
 * CE QUE CE DOUBLE EST, ET CE QU'IL N'EST PAS. C'est un comblement de TROU
 * D'ENVIRONNEMENT, pas un contournement de test : dans tout navigateur réel,
 * `matchMedia` existe TOUJOURS. Il répond `matches: false` à chaque requête —
 * exactement ce que répond un navigateur sans préférence déclarée, qui est le
 * défaut. Aucune requête n'est interprétée, aucune n'est privilégiée : le
 * double ne simule pas un état de média, il rend la fonction appelable.
 *
 * Conséquence voulue : `prefersReducedMotion()` (`Widget.tsx`) cesse de sortir
 * par sa trappe `typeof !== 'function'` et exerce enfin sa vraie branche.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => {
    const liste: MediaQueryList = {
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      // Les deux formes historiques : certaines bibliothèques n'ont jamais
      // migré vers `addEventListener`, et une absence les ferait échouer.
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
    return liste;
  };
}

afterEach(() => {
  cleanup();
  // Les tests de design (environnement node) n'ont pas de `window`.
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});
