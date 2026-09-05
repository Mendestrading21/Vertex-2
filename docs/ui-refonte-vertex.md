# Refonte coordonnée des dashboards et widgets — suivi

Branche : `refonte/ui-widgets-20260905`. Base : `main` = `0b82eb2` (LOT P6, 2026-09-05).
Document de suivi compact de la mission « refonte coordonnée des dashboards et
widgets ». Il complète `docs/05-design/` sans créer de seconde référence de
design : toute règle réutilisable est ajoutée aux documents existants, ce
fichier ne porte que le périmètre, les décisions et l'avancement.

## 1. Skills réellement utilisés et provenance

Quatre skills externes installés au niveau projet, par copie des fichiers
distribués à un commit épinglé, sans hook et sans binaire. Chaque dossier porte
un `PROVENANCE.md` (source, commit, licence, adaptations) et sa licence amont.

| Skill | Dossier | Source et commit | Licence | Rôle dans la mission |
|---|---|---|---|---|
| KPI Dashboard Design | `.claude/skills/kpi-dashboard-design/` | wshobson/agents `a30778f8…` (2026-09-01) | MIT | hiérarchie synthèse → indicateurs → analyses → détails, regroupements, doublons |
| Interface Design | `.claude/skills/interface-design/` | Dammyjay93/interface-design `2f9be320…` (2026-06-20) | MIT | anatomie et proportions des cartes, densité, typographie, cascade CSS |
| UI UX Pro Max | `.claude/skills/ui-ux-pro-max/` | nextlevelbuilder/ui-ux-pro-max-skill `f3ac1952…` (2026-09-03) | MIT | tableaux, filtres, clavier, états, responsive desktop ; outil `scripts/search.py` (Python pur, CSV locaux) |
| Impeccable | `.claude/skills/impeccable/` + `.claude/agents/impeccable-*.md` | pbakaus/impeccable `4bee58d8…` (2026-09-05), skill 4.2.0 | Apache-2.0 | critique indépendante, `layout`, `harden`, `clarify`, `polish` par LECTURE des playbooks — aucune invocation native du moteur (`scripts/impeccable` non exécuté, aucun téléchargement) |

Skills internes lus intégralement : `vertex-titanium-ledger` (SKILL.md, références
canonical-visual, component-system, charts, pages ; capture canonique et planche
§5), `vertex-one`. Docs : `docs/05-design/*` et `docs/05-design/refonte/option.md`
(conception non approuvée + 32 réfutations) et `00-systeme-visuel.md`.

Ce qui n'a PAS été installé, volontairement : le reste du catalogue
wshobson/agents ; les hooks Impeccable (`.claude/settings.json` amont) ; le
moteur binaire Impeccable ; `PRODUCT.md`/`DESIGN.md`/`.interface-design/system.md`
(la référence de design de Vertex reste `docs/05-design/`).

## 2. Périmètre

- Page pilote : Options (`/options/:underlying`) — composition, cartes, chaîne,
  sélecteurs, inspecteur.
- Composants partagés touchés : `Card`, `Widget`, `DataTable`, `Metric`,
  `AbsentModule`, `IvSmile`, CSS de planche (`.vx-board`) et de widgets.
- Généralisation : Marchés, Portefeuille, Analyse, Risques (composants validés
  sur Options d'abord).
- Hors périmètre : toute formule, score, règle de sélection, moteur IA, source,
  connexion ; toute dépendance nouvelle ; tout thème/palette/police ; toute UI
  mobile (Beta desktop only : 1280×800, 1440×900, 1600×1000 ; 1024×768 =
  dégradation).

## 3. État de référence avant modification (mesuré le 2026-09-05)

Exécuté depuis le miroir de travail `~/.vertex/app` (le dépôt OneDrive n'a ni
`node_modules` ni `.venv` ; synchronisation robocopy avant chaque contrôle) :

| Contrôle | Résultat |
|---|---|
| `pnpm typecheck` | 0 erreur |
| `pnpm lint` (Biome) | 333 fichiers, 0 erreur |
| `pnpm test` (Vitest) | 1149 verts, 5 rouges : 2 portes de design en faux positif Windows (`no-ambiguous-dash`, `no-fabricated-values` — chemins en antislash contre exemptions en barres obliques) ; 3 tests de page (`AnalysisComposition`, `AnalysisPage`, `OptionsPage` « sélecteur ») rouges sous charge complète et verts relancés seuls — course préexistante, celle que la PR #75 documente |
| Playwright e2e | NON exécutable sur ce poste : aucun navigateur Playwright installé, `global.setup.ts` suppose `python3`, `service postgresql` et les ports 8000/4173 occupés par la pile réelle |

Mesures de la page Options à 1440×900 (données SYNTHETIC, `/options/SYN-TECH-01`) :
rangée 1 `284 / 547` px, rangée 2 `242 / 212 / 212 / 172`, rangée 3
`303 / 321 / 575`, rangée 4 `258 / 356`, chaîne `1172` (dominante après ≈ 2 300 px
de défilement), rangée 6 `216 / 192 / 144` ; corps de carte `72` px dans une
carte de `242` (spot), `64` dans `258` (série). Page ≈ 3 600 px.

Environnement de prévisualisation design : base PostgreSQL séparée `vertex_e2e`
semée par `apps/web/e2e/seed_synthetic.py` (population SYNTHETIC), API sur
`127.0.0.1:8001`, Vite dev sur `127.0.0.1:5173` via
`apps/web/vite.design-preview.config.ts` (fichier de travail, proxy `/api` →
8001). La pile réelle (`vertex`, 8000/4173) n'est pas touchée.

## 4. Décisions de design (mission 1, appliquées sur Options)

Quatre analyses (KPI, Interface, UI UX, Impeccable) ont convergé sur l'ordre de
lecture et divergé sur trois points, tranchés ainsi :

1. **Ordre de lecture** : résumé → dominante → détail (`DASHBOARD_COMPOSITION.md`).
   La bande de synthèse (snapshot + spot + deux hypothèses) ouvre la planche, la
   chaîne suit en deuxième rangée. Impeccable proposait la chaîne en premier ;
   KPI proposait une synthèse de six chiffres : retenu une bande courte PUIS la
   dominante.
2. **Catalogue inchangé** : quinze modules, six absences, mêmes `data-module` et
   `data-testid` (les e2e comptent les modules et lisent ces accroches). Les
   absences sont regroupées en bas et compactées, jamais retirées (article 17).
3. **Densité de carte** : le rang `quiet` de `Card` est inerte sur une planche
   (battu par le bloc `.vx-board > [data-module] > .vx-card`). Plutôt que de le
   ressusciter — ce qui changerait toutes les pages d'un coup — un attribut de
   composition `data-density="compact"` est posé par la page, cellule par
   cellule (règle `.vx-main [data-module][data-density='compact'] > .vx-card`).
4. **Grille à douze colonnes** pour Options : les cartes n'ont plus toutes la même
   largeur ; les aires nommées restent la source de placement (porte e2e « aire
   obtenue »).
5. **Sélecteur de sous-jacent** : plié derrière le courant (`<details>` natif),
   déplié sans sous-jacent ; une panne réseau est rendue comme un état, jamais
   comme une couverture vide.
6. **Chaîne** : statut de quote une fois par côté (forme + texte : CROSSED corail
   plein, STALE ambre pointillé), `colgroup` de largeurs, `aria-pressed` à la
   place d'un faux `aria-haspopup="dialog"`, squelette de table au chargement,
   valeur exacte au survol ET dans « Détail » (dit dans la légende).
7. **Sourire d'IV** : tracé dans la boîte mesurée (ResizeObserver), rapport
   d'aspect préservé : un point est un disque.
8. **Refusé** : nouvelle dépendance (TanStack, Radix), moteur graphique sur les
   valeurs simples, jauge/anneau sur une valeur non servie, calcul client (mid,
   spread, ATM, jours à l'expiration), format « virgule vs point » unifié sans
   décision produit, réordonnancement du catalogue.

## 5. Avancement

- [x] Lecture des autorités du dépôt, installation et lecture des quatre skills
- [x] Base synthétique et prévisualisation, mesures « avant »
- [x] Quatre analyses parallèles en lecture seule (KPI, Interface, UI UX, Impeccable)
- [x] Portabilité Windows des portes `no-ambiguous-dash` et `no-fabricated-values`
- [ ] Plan commun et arbitrage des contradictions
- [ ] Options : composition, cartes, chaîne, sélecteurs, inspecteur
- [ ] Composants partagés
- [ ] Généralisation Marchés / Portefeuille / Analyse / Risques
- [ ] Tests, revue finale Impeccable, captures après

## 6. Points restant à traiter (issus des analyses, non exécutés)

- Playwright sur ce poste (navigateur, `python3`, ports) : les portes de mise en
  page ont été rejouées par mesure JavaScript dans le navigateur intégré, pas par
  la suite e2e.
- Persistance de la sélection (groupe, colonnes) dans l'URL (`useSearchParams`).
- Focus perdu quand un refetch SSE démonte l'inspecteur de contrat.
- Horodatages ISO bruts partout (`formatInTimeZone` existe dans `calendarView.ts`).
- Deux matériaux de carte (rayon 20 + `shadow-panel` sur cinq planches, rayon 14 sur
  sept) et deux couleurs de focus : décision de système, hors d'un lot de page.
- Format des nombres (chaîne servie avec point vs virgule française) : décision
  produit à prendre avant toute unification.

## 7. Mission 2 — audit total et optimisation par lots (2026-09-05, soir)

Branche : `agent/vertex-total-audit-ultimate-polish` (créée depuis
`refonte/ui-widgets-20260905`, elle-même sur `main` = `0b82eb2`). Aucun merge.

### 7.1 Sécurité Git relevée avant modification

- HEAD `0b82eb2`, aucun worktree secondaire, aucune stash ; 15 fichiers modifiés et
  9 non suivis, tous issus de la mission 1 (Options) — commités en cinq commits
  bornés (`2f63931` skills, `f27d402` portes Windows, `b89ce75` Options,
  `e622319` Portefeuille, `3381104` doc).
- Branches distantes d'autres agents préservées (`agent/*`, `claude/*`,
  `codex/*`, `lot/*`) ; PR #75 ouverte non touchée.
- `origin` pointe sur `Mendestrading21/Vertex-2` (renommage GitHub du dépôt
  `Vertex-1.0-Beta-` ; l'ancienne URL redirige). `.claude/rules/repository-role.md`
  nomme encore l'ancien nom : à mettre à jour dans un lot de gouvernance.

### 7.2 Mesures de référence (avant les lots de la mission 2)

Build de production (`pnpm build`, Vite 8 / rolldown, 3,3 s) :

| Chunk | Minifié | gzip | Chargement |
|---|---|---|---|
| `index` (shell, router, react-query, widgets) | 323 kB | 97 kB | initial |
| `index.css` | 202 kB | 29 kB | initial |
| `echartsLoader` | 609 kB | 205 kB | paresseux, par route |
| `lightweightChartsLoader` | 164 kB | 53 kB | paresseux (Analyse, Graphiques) |
| `decisionApi` (partagé par les pages paresseuses) | 141 kB | 46 kB | paresseux |
| pages (10 chunks) | 24–69 kB | 7–18 kB | paresseux |

Les moteurs graphiques ne sont pas dans le bundle initial. Onze routes sur douze
sont chargées paresseusement (`app/routes.tsx`).

Tests : typecheck 0 erreur, Biome 0 erreur, Vitest 1 176 verts (5 tests de
composition rouges sous charge complète, verts relancés seuls : course
préexistante documentée par la PR #75), Playwright non exécutable sur ce poste.
