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
