# Refonte totale — vague 2 (plan d'exécution, 2026-09-06)

La vague 1 (nuit du 5 au 6 septembre, `docs/ui-refonte-vertex.md` §7) a
recomposé les douze pages : grille de douze colonnes nommées, ordre signal →
dominante → chiffres → absences, `ModuleCell`, mesures aux trois viewports.
Cette vague 2 reprend l'énoncé « audit total puis optimisation totale » point
par point et exécute ce qui n'a pas été fait, dans l'ordre où chaque lot
rend le suivant plus simple. Identité inchangée : **Vertex Titanium Ledger
Black Glass** (`.claude/skills/vertex-titanium-ledger/SKILL.md`).

Règles qui bornent l'exécution : aucune dépendance sans ADR accepté
(`.claude/rules/architecture.md`), aucun calcul financier en TypeScript,
absence jamais rendue par zéro ni tiret, une dominante par page, tests verts
à chaque lot, commits bornés sur la branche `agent/vertex-total-audit-ultimate-polish`
(déjà publiée : PR #76 ; la vague 2 s'y ajoute, la fusion reste humaine).

## Ordre des lots

| Lot | Énoncé couvert | Contenu | Preuve attendue |
|---|---|---|---|
| **V2-1 Vocabulaire des états de données** | §26, §27, §44, §52, §53 | Un seul type `DataMode` (`LIVE`, `NEAR_LIVE`, `DELAYED`, `CACHED`, `STALE`, `CLOSED`, `MANUAL`, `SIMULATED`, `UNAVAILABLE`) dérivé UNIQUEMENT des champs servis (`delay_status`, `population`, âge/budget, état de session) ; `LiveDataIndicator` (badge + popover source/horodatage/fraîcheur) ; famille `DataState` unifiée (`Empty`, `Unavailable`, `Delayed`, `Stale`, `Partial`, `Error`, `NoEntitlement`, `MarketClosed`) remplaçant les variantes locales ; un seul vocabulaire `DataFreshness`. | tests unitaires de dérivation (aucun `LIVE` sans preuve servie), grep : zéro composant d'état local restant |
| **V2-2 Squelettes et tooltips** | §42, §43 | `ChartSkeleton`, `TableSkeleton` (existe), `MetricSkeleton`, `HeatmapSkeleton`, `CalendarSkeleton`, `InspectorSkeleton` ; un `Tooltip` unique (surface, padding, rayon, police, positionnement borné à l'écran, clavier) sur les primitives natives, sans dépendance | tests clavier/positionnement, aucune `title=` orpheline |
| **V2-3 Cartes à niveaux** | §10, §11 | Sur la `Card` existante : niveaux `Hero`, `Decision`, `Signal`, `Analytics`, `Data`, `CompactMetric`, `TablePanel`, `InspectorPanel` exprimés par `data-level` + tokens (pas huit composants divergents) ; chaque widget expose titre, valeur, unité, source, fraîcheur, état | catalogues `*Modules.ts` portent le niveau ; test : un seul niveau `Hero` par page |
| **V2-4 Typographie numérique et formats** | §9 | `Num` partagé : tabular, séparateur `'`, signe `−` typographique, `%`, `bps`, `×`, devises, dates/heures Europe/Zurich, tout depuis la chaîne servie sans recalcul | tests de format, grep des formats locaux |
| **V2-5 Système de graphiques** | §12, §14 | Consolider `ChartFrame`, `ChartToolbar`, `ChartLegend`, `CrosshairReadout`, `Sparkline`/`MicroArea`/`MicroBars`, `HeatmapMatrix`, `MarketTreemap`, jauges (`Risk`, `Confidence`, `Regime`, `DataQuality`, bullet quand plus clair), `AllocationDonut`, `BreadthChart`, `CorrelationMatrix` — Lightweight Charts pour le prix/volume, ECharts pour le reste, thème unique `charts/theme.ts` | rendu à 1280/1440/1600, aucune couleur codée en dur hors tokens |
| **V2-6 Inspecteur commun** | §25, §24 | `InspectorPanel` unique (instrument, option, catalyseur, événement, source, rapport) : même en-tête, mêmes sections, mêmes actions, focus restitué ; interactions liées via `useWorkspace().activeInstrument` (carte → graphique → inspecteur → catalyseurs → options) | tests d'enchaînement, un seul état par sélection |
| **V2-7 Tableaux** | §15 | Évaluer TanStack Table/Virtual sur mesure (10 000 lignes) : sans ADR accepté, table native consolidée (tri/filtre servis, en-tête collant, clavier, région défilante bornée) ; virtualisation seulement si la mesure la justifie | mesure de rendu avant/après sur Marchés et Options |
| **V2-8 Options** | §16 | Colonnes configurables persistées dans l'URL, ATM/ITM/OTM lisibles, spread, IV, Greeks servis, en-tête et strike collants (existent), source et fraîcheur par ligne, zéro vocabulaire d'ordre | test : aucun libellé Buy/Sell/Order ; captures |
| **V2-9 Bandeau de marché** | §28 | `MarketTickerStrip` sur les indices/devises **servis** seulement (chaîne 3 du plan données) ; sans données, le bandeau dit l'absence, jamais une valeur | dépend du lot données « indices » ; sinon état `UNAVAILABLE` honnête |
| **V2-10 Pages, passe finale** | §31–§41, §33 | Aujourd'hui « what matters now », Marchés market desk, Opportunités screener, Analyse chart-first, Simulateur, Portefeuille, Graphiques workspace, Risques, Catalyseurs, Calendrier (vues jour/semaine/agenda), Sources cockpit — trois passes chacune (structure, visuel, interaction) sur les primitives des lots précédents | captures avant/après, mesures de rangées, tests de composition |
| **V2-11 Accessibilité et mouvement** | §20, §45 | Durées tokenisées (micro 100–160, panneau 160–220, page 200–280 ms), `prefers-reduced-motion`, focus visible unique, ARIA des tables/dialogues/tooltips, contraste | axe (CI e2e), tests clavier |
| **V2-12 Performance et code mort** | §46–§50 | Mesures avant/après (bundle, rendu graphique/table, rerenders), mémoïsation ciblée, dédoublonnage des requêtes, chargement progressif cache → primaire → secondaire → analytique ; suppression du code mort confirmé (usages dynamiques vérifiés) | tableau avant/après dans le rapport, build |
| **V2-13 Quality gate et rapport** | §54–§58 | tsc, Biome, Vitest, build, e2e CI (Chromium, axe, portes de mise en page), captures 1280/1440/1600, rapport final §58 | PR mise à jour |

## Dépendances candidates — décision

| Candidat | Décision vague 2 | Motif |
|---|---|---|
| Radix primitives | non, sauf ADR | dialogues/menus/tooltips natifs + clavier suffisent au périmètre desktop ; un ADR serait justifié uniquement pour un menu contextuel riche |
| motion | non | transitions CSS tokenisées + `prefers-reduced-motion` couvrent feedback, panneaux, sélection |
| lucide-react | non | catalogue d'icônes du système existant ; une seule famille = celle déjà en place |
| TanStack Table/Virtual | mesure d'abord (lot V2-7) | ADR proposé si une table dépasse le budget de rendu |
| react-resizable-panels | non | inspecteur à largeur fixe décidée par la planche ; le redimensionnement libre casse les mesures |
| react-scan | outil local seulement | jamais dans le bundle |

## Ce que la vague 2 ne fait pas

Aucun ordre, aucun bouton d'ordre, aucune lecture de compte IBKR ; aucune
refonte de l'identité ; aucune valeur inventée pour « remplir » une carte ;
aucun merge.

## Journal d'exécution (2026-09-06)

| Lot | État | Commit | Preuve |
|---|---|---|---|
| V2-1 vocabulaire des états de donnée | fait | `921bc96` | `liveDataStateOf` (24 cas), dix états, méta de chaque Widget ; « NEAR LIVE » refusé (aucun champ servi) ; nombre jamais tronqué par une ellipse |
| V2-4 typographie numérique | fait | `8ef9d29` | `components/number.ts` : `12'845.20`, `+2.48%`, `−0.72%` ; 30 sites ; 15 attentes de tests mises au format |
| V2-6 inspecteur commun | fait | `aa8e072` | en-tête unique de `InspectorPanel` (kicker, sujet, note, Fermer) sur sept pages |
| V2-10a densité textuelle | fait | `2951c29` | 26 pieds de carte ramenés sous 60 caractères |
| V2-8 Options : sélection dans l'URL | fait | `330a2c8` | `?group=` et `?cols=` persistés, deny by default, table contrôlée ; 73 tests Options verts |
| V2-2 squelettes et tooltips | déjà en place / reporté | — | `Skeleton.tsx` couvre Chart, Metric, Table, Calendar, Heatmap, Inspector ; le tooltip unique reste à faire (les définitions sont déjà accessibles au clavier par le nom accessible) |
| V2-3 cartes à niveaux | reformulé | — | `Card.rank` (dominant / default / quiet) + `data-density` tiennent lieu de niveaux ; huit composants divergents refusés |
| V2-5 système de graphiques | en place | — | `ChartFrame`, `SparkFigure`, `MicroBars`, `MicroRange`, `CellGrid`, `MarketMap`, `ArcGauge`, `LinearGauge`, `BulletMetric`, `RingShares`, `MultiSeriesArea`, matrice de corrélation ; thème unique `charts/theme.ts` ; cinq primitives livrées non encore adoptées par une page (`BulletMetric`, `ChartFrame`, `MicroBars`, `MicroRange`, `MiniHeatStrip`) — conservées, hors bundle par tree-shaking |
| V2-11 mouvement | déjà en place | — | tokens `--vx-motion-90/140/180/220/600`, `prefers-reduced-motion` ramène tout à 0 ms, deux durées brutes seulement (0 ms) |
| V2-2b infobulle unique | fait | (ce lot) | `components/Tooltip.tsx` : une surface, un rayon, une police, placement borné à l'écran (`positionTooltip`, fonction pure testée : côté demandé → côté opposé → ramené dans l'écran), `role="tooltip"` + `aria-describedby`, ouverture au survol et au focus de tout descendant, `tabbable` pour un déclencheur non focusable, Échap ferme sans quitter le déclencheur, défilement/redimensionnement replacent ; posée sur les en-têtes et les options de colonnes de la chaîne, la nature et la liste des faits d'Opportunités, le rail replié. `title` reste sur les cellules denses (une provenance par cellule doublerait le DOM), sur le glyphe d'absence (redondance testée) et sur la valeur entière des nombres tronqués |
| V2-7 tableaux — mesure | mesuré, virtualisation refusée | — | voir « Mesures V2-7 » ci-dessous : à 240 lignes (plafond servi) la chaîne tient dans le budget d'interaction ; aucune table produit n'atteint 10 000 lignes |
| V2-12 performance — mesure | mesuré | — | chargement initial 172 872 octets gzip (budget 300 Ko), 5 fichiers, ECharts et Lightweight Charts hors chargement initial (`tools/measure_web_bundle.py`) ; cinq primitives non adoptées conservées (hors bundle) |
| V2-9 | à faire | — | dépend de la chaîne données « indices » |

Mesures inchangées depuis la vague 1 (rangées ≤ 28 % de vide aux trois
viewports) ; Vitest 124 fichiers / 1 180 verts, tsc 0, Biome 0 après chaque
lot.

### Retour de la CI e2e (Chromium, trois viewports, axe) — 2026-09-06

Première exécution Playwright de la branche : 17 parcours rouges par
viewport, tous traités (`983dda4`, `4039f79`, `79111c8`) :

- `unbroken-measure` : le repli des nombres introduit au lot 1 coupait un
  instant et un Herfindahl sur deux lignes → segment de mesure de nouveau
  atomique (nowrap, 14ch, valeur entière dans le `title`), la colonne trop
  étroite corrigée à la source ;
- « le contenu tient dans sa carte » sur /options à 1280 : les segments de la
  ligne de méta (instant ISO, badge d'état) peuvent se replier ;
- Options : la case de colonne cochée changeait d'état un rendu trop tard
  (état dérivé de l'URL seule) → miroir local synchrone, l'URL reste la vérité ;
  « Fermer » ayant rejoint l'en-tête commun, le focus entrant et Échap sont
  portés par le panneau entier ;
- attentes des parcours mises au format produit (`e2e/format.ts`) et au nom
  accessible « Inspecteur — <sujet> » ; témoin hors ligne désambiguïsé.

Deuxième et troisième exécutions (`c0b799f`, `03a2c01`) : 9 puis 3 rouges,
tous sur la porte « le contenu tient dans sa carte » de `/options`, aux trois
largeurs (Spot 18 px, Taux et Dividende 35 px à 1280). Le diagnostic a pris
deux tours parce que la planche mesurée n'était pas celle regardée : la porte
visite `/options` **sans sous-jacent**, où la planche rend des `Widget` en
état `empty`. Là, les aires nommées de `.vx-options-grid` (dans `global.css`)
perdaient, à spécificité égale, contre les spans du socle
`.vx-w2[data-size]` importés après : Spot, Taux et Dividende tombaient à une
colonne (76 px, 34 px de corps) et « Aucun snapshot publié » débordait.
Correction `c3cdb7d` : les aires déménagent dans `widgets.css` (même motif
que Marchés au lot P1 et Opportunités au lot P2d) et la planche vide garde la
densité compacte des cinq mêmes modules qu'en planche servie. Le tour
précédent (`03a2c01`) reste utile : dans une cellule compacte, unité, note,
pied et `code` se replient mot à mot et la cellule défile plutôt que de
couper si une police de secours élargit encore un segment.

Quatrième exécution, `c3cdb7d` : **7 jobs sur 7 verts** (run 34021031911 ;
e2e 834 parcours, trois viewports, axe). PR #76 à jour, relecture et fusion
humaines.

### Mesures V2-7 — coût DOM des tables natives (Chromium, 1280×800, SYNTHETIC)

Méthode : la table servie est clonée hors écran avec N lignes (répétition des
lignes réelles), insérée, puis mesurée (`getBoundingClientRect`) — le coût
inclut la construction du DOM et la mise en page, pas la réconciliation
React. Une mesure par taille, sans moyenne.

| Table | Lignes servies | 240 lignes | 1 000 lignes | 10 000 lignes |
|---|---|---|---|---|
| Chaîne d'options (11 cellules/ligne) | 13 → 40 ms | 80 ms | 343 ms | 4 758 ms |
| Marchés (7 cellules/ligne) | 22 → 4 ms | 42 ms | 170 ms | 2 402 ms |

Lecture : le plafond servi de la chaîne est 240 lignes (`row budget`,
tronquées comptées) et l'univers Marchés compte 57 instruments ; aux tailles
que le produit sert réellement, la table native reste sous le budget INP de
200 ms. À 10 000 lignes, seule une virtualisation tiendrait — mais aucune
table de Vertex 1.0 Beta n'y arrive, et un ADR TanStack Table/Virtual n'est
donc pas proposé. Ce qui reste du lot V2-7 sans virtualisation : tri/filtre
servis, en-tête collant, clavier et région défilante bornée — déjà en place
sur Marchés et sur la chaîne (`.vx-markets-table-scroll[tabindex]`,
`.vx-chain-table-scroll[tabindex]`).

Cinquième exécution, `e9563f1` (infobulle unique, mesures) : **7 jobs sur 7
verts** (run 34028650506). Revue complète du logiciel sur la pile live :
`docs/VERTEX_FINAL_REPORT.md` §2 ter.

Tour de mise en place (`908f502`) : neuf dettes de la porte « le contenu
tient dans sa carte » retirées après mesure à 0 px aux trois largeurs
(population SYNTHETIC et réelle), cliquet ramené à 1 ; hors UI, le worker
récupère désormais les baux expirés avant chaque réclamation (défaut trouvé
sur la base réelle pendant la revue).
