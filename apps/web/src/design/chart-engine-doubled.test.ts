// @vitest-environment node
/**
 * PORTE DU MOTEUR DE CHANDELIERS DOUBLÉ.
 *
 * `CandleChart` importe `charts/lightweightChartsLoader.ts` et appelle
 * `createChart`. Dans jsdom il n'y a pas de canvas : le graphique se construit
 * quand même, planifie un `requestAnimationFrame`, et quand celui-ci s'exécute
 * après le démontage `PriceAxisWidget._internal_optimalWidth` lève « Value is
 * null » — HORS de tout test.
 *
 * CE QUE CELA COÛTE, ET POURQUOI AUCUNE ASSERTION NE L'ATTRAPE. L'erreur ne
 * fait échouer aucun test : elle est comptée par Vitest en « unhandled error ».
 * La campagne affiche donc ses tests TOUS VERTS et sort en code 1. Un lecteur
 * pressé lit « 1171 passed » et cherche le défaut ailleurs.
 *
 * PIRE : c'est une COURSE. Le défaut a vécu des semaines dans
 * `AiExplanationPanel.test.tsx`, qui rendait `/analysis/SYN-TECH-01` sans
 * doubler le moteur, sans jamais tomber dans la fenêtre. Il a émergé en CI le
 * jour où un fichier de test supplémentaire a décalé l'ordonnancement. Une
 * campagne verte ne prouvait donc rien à son sujet, et n'aurait rien prouvé
 * demain non plus.
 *
 * DEUX RÉPONSES AU MÊME DÉFAUT, RÉCONCILIÉES ICI (2026-09-09). La première
 * version de cette porte exigeait que CHAQUE fichier rendant une route à
 * graphique déclare son propre `vi.mock` du chargeur. En parallèle, une autre
 * branche a résolu le même défaut en doublant les deux moteurs UNE fois pour
 * toute la suite, dans `src/test/setup.ts`. Les deux branches fusionnées, la
 * porte accusait `shell/ContextBar.test.tsx` — un fichier parfaitement couvert
 * par le doublage global. Elle vérifiait le MÉCANISME (un `vi.mock` par
 * fichier) et non l'INTENTION (aucun vrai moteur ne se monte dans jsdom).
 *
 * LA PORTE, DÉSORMAIS. Trois faits, tous statiques — elle lit les fichiers,
 * parce qu'une porte dynamique dépendrait de l'ordonnancement, c'est-à-dire
 * de la chose même qui rend ce défaut invisible :
 *   1. `src/test/setup.ts` double le chargeur de chandeliers ET celui
 *      d'ECharts — c'est la garantie porteuse, et elle doit exister ;
 *   2. `vite.config.ts` charge bien `setup.ts` en `setupFiles` — sans quoi le
 *      doublage global n'est jamais exécuté et la garantie est vide ;
 *   3. aucun fichier de test ne DÉ-DOUBLE le chargeur (`vi.unmock`,
 *      `vi.doUnmock`, `vi.importActual`, `vi.doMock` vers le module réel) —
 *      car « la déclaration du fichier l'emporte sur celle-ci », comme le dit
 *      `setup.ts` lui-même. Un `vi.mock` local qui redéclare un autre double
 *      reste admis : il sert à observer les appels.
 *
 * CE QU'ELLE NE VOIT PAS, et il faut le dire plutôt que de laisser croire
 * qu'elle couvre tout : un test qui importerait le module réel par un chemin
 * qu'elle ne reconnaît pas (alias, `require`, chaîne construite). Mesuré au
 * moment de l'écrire : aucun fichier ne le fait. La porte couvre l'existant ;
 * elle demandera d'être élargie si cela change.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const racine = fileURLToPath(new URL('../', import.meta.url));
const racineWeb = fileURLToPath(new URL('../../', import.meta.url));

const CHARGEUR_CHANDELIERS = 'charts/lightweightChartsLoader.ts';
const CHARGEUR_ECHARTS = 'charts/echartsLoader.ts';

/** Formes qui remplaceraient le double global par le module réel. */
const DEDOUBLAGES = ['vi.unmock(', 'vi.doUnmock(', 'vi.importActual(', 'vi.doMock('];

describe('le moteur de chandeliers est doublé partout où il serait monté', () => {
  const setup = readFileSync(`${racine}test/setup.ts`, 'utf8');
  const config = readFileSync(`${racineWeb}vite.config.ts`, 'utf8');
  const fichiers = globSync('**/*.test.{ts,tsx}', { cwd: racine })
    .map((relatif) => relatif.replaceAll('\\', '/'))
    .filter((relatif) => !relatif.startsWith('design/'));

  it('énumère des fichiers de test — sinon cette porte ne mesure rien', () => {
    expect(fichiers.length).toBeGreaterThan(50);
  });

  it('le doublage global existe : setup.ts double les deux moteurs de graphiques', () => {
    expect(
      setup,
      `src/test/setup.ts ne double plus \`${CHARGEUR_CHANDELIERS}\` : un vrai moteur de ` +
        'chandeliers se monterait dans jsdom, et son requestAnimationFrame lèverait ' +
        '« Value is null » hors de tout test',
    ).toContain(`vi.mock('../${CHARGEUR_CHANDELIERS}'`);
    expect(
      setup,
      `src/test/setup.ts ne double plus \`${CHARGEUR_ECHARTS}\``,
    ).toContain(`vi.mock('../${CHARGEUR_ECHARTS}'`);
  });

  it('le doublage global est chargé : vite.config.ts déclare setup.ts en setupFiles', () => {
    expect(
      config,
      'vite.config.ts ne charge plus src/test/setup.ts : le doublage global y est ' +
        'écrit mais jamais exécuté, et la garantie est vide',
    ).toMatch(/setupFiles:\s*\[\s*['"]\.\/src\/test\/setup\.ts['"]/);
  });

  it('aucun fichier ne dé-double le chargeur — la déclaration locale l’emporterait', () => {
    const fautifs: string[] = [];
    for (const relatif of fichiers) {
      const texte = readFileSync(`${racine}${relatif}`, 'utf8');
      if (!texte.includes(CHARGEUR_CHANDELIERS)) {
        continue;
      }
      const dedouble = DEDOUBLAGES.some((forme) => {
        // Le dé-doublage doit viser LE chargeur, pas un autre module du fichier.
        const debut = texte.indexOf(forme);
        if (debut === -1) {
          return false;
        }
        return texte.slice(debut, debut + 200).includes(CHARGEUR_CHANDELIERS);
      });
      if (dedouble) {
        fautifs.push(relatif);
      }
    }
    expect(
      fautifs,
      'ces fichiers remplacent le double global du chargeur par le module réel — ' +
        'un vrai graphique serait créé dans jsdom :\n  ' +
        fautifs.join('\n  '),
    ).toEqual([]);
  });
});
