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
| Impeccable | `.claude/skills/impeccable/` + `.claude/agents/impeccable-*.md` | pbakaus/impeccable `4bee58d8…` (2026-09-05), skill 4.2.0 | Apache-2.0 | critique indépendante, `layout`, `harden`, `clarify`, `polish` par LECTURE des playbooks — aucune invocation native du moteur ; le dossier `scripts/` amont (launcher téléchargeant un binaire) n'est pas vendu, retiré le 2026-09-06 pour les portes secrets et frontière financière |

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

### 7.3 Lots exécutés (branche `agent/vertex-total-audit-ultimate-polish`)

Dix-neuf commits bornés depuis `main` = `0b82eb2`, aucun merge, aucun
force-push, aucun secret, aucune donnée réelle :

| Commit | Lot |
|---|---|
| `2f63931` | skills de design installés au niveau projet, avec provenance |
| `f27d402` | portes `no-ambiguous-dash` / `no-fabricated-values` indépendantes du séparateur de chemin |
| `b89ce75`, `e622319`, `3381104` | mission 1 : Options recomposée, carte performance totale, document de suivi |
| `481e476` | sélecteur mort, doublon `::before` de la dominante, densité étendue à toutes les planches |
| `56ca327` | mission 2 : sécurité Git, bundle de référence, décisions |
| `8792b09` | primitive partagée `ModuleCell`, garde `SparkFigure`, identifiants stables de jauge |
| `47d819f` | Aujourd'hui et Sources & Rapports recomposées (signal → dominante) |
| `86d7965` | instrument actif visible dans le bandeau, Marchés → contexte, raccourci Options |
| `41b472d` | budget asynchrone 4 s des `findBy` de page (course du premier test) |
| `bf6ea97` | journal de nuit |
| `f8bba5e` | `cssToken` et `publishedOr` uniques |
| `27d1b30` | `Widget` accepte la densité `compact` |
| `502362e` | Opportunités, Catalyseurs, Marchés, Analyse, Portefeuille, Risques, Graphiques recomposées |
| `aaad690` | Calendrier et Simulateur sur douze colonnes nommées |
| `aeb1025` | 75 règles CSS mortes retirées (36 classes), `align-items` de `.vx-board` décidé une fois |
| `1eff79c` | passe 2 : rangées équilibrées, fin des débordements horizontaux |
| `7460161` | passe 3 : libellés, notes et contrôles bornés à leur cellule |
| `8d5dbda` | Sources : diagnostic par paires, absences sur trois rangées |

### 7.4 Ce qui a changé, page par page

Grammaire commune : grille de douze colonnes à aires nommées, ordre du DOM =
ordre de lecture (signal → dominante → chiffres → absences déclarées groupées
en dernier), cellules `ModuleCell` portant `data-module` / `data-size` /
`data-density`, kickers de nature (Observé / Publié / Calculé / Déclaré), pieds
d'une ligne, une seule dominante par page.

| Page | Avant (1440) | Après (1440) |
|---|---|---|
| Options | page 3 613 px, dominante à ~2 300 px, rangées jusqu'à 45 % de vide | 2 920 px, dominante à 633 px, pire rangée 19 % |
| Aujourd'hui | signal après la dominante, rangée finale 34 % | signal d'abord, catalyseur + portefeuille empilés, absences seules ; pire rangée 28 % |
| Opportunités | rangées à 47 % et 44 % | profil sur deux rangées face à provenance, qualité et exclusions ; pire rangée 27 % |
| Analyse | preuves isolées (39 %), identité qui débordait | preuves avec indicateurs/oscillateurs, financiers + pairs empilés ; 0 débordement |
| Catalyseurs | revue seule sur 912 px, exposition à 38 % | exposition + orphelines empilées face à la revue |
| Graphiques | superpositions (1 014 px) face au volume (324) : 36 % | superpositions sur deux rangées, volume + indicateurs empilés |
| Portefeuille | valorisation 629 face à 298/214 ; saisie 869 face à import 252 | performance + devise empilées ; import + registre empilés |
| Marchés | table de carte sans borne | région défilante 560 px, treemap plus haute, choix → contexte |
| Risques | grille à quatre colonnes | douze colonnes, densité compacte sur les comptes |
| Calendrier | absences au milieu, variante 1600 à cinq colonnes | absences en dernier, dégradation < 1280 explicite |
| Simulateur | idem | idem, matrice de scénarios sur 8/12 |
| Sources & Rapports | exports face à quatre absences (35 %) | paires composants/versions et exports/sondes ; absences 0 % |

### 7.5 Mesures après (2026-09-06)

Méthode : mesure JavaScript dans le navigateur intégré (rangées formées par
`offsetTop` des cellules `[data-module]` de premier niveau, vide = surface
manquante face à la plus haute cellule de la rangée ; débordement = tout
élément dont `scrollWidth` dépasse `clientWidth` hors régions défilantes).
Cette méthode sépare les cellules empilées d'une même aire ; les valeurs
ci-dessous sont donc des majorants. Playwright reste non exécutable sur ce
poste ; les portes e2e n'ont pas été rejouées.

Pire rangée par page (vide, %) :

| Page | 1280 | 1440 | 1600 | Dominantes |
|---|---|---|---|---|
| Aujourd'hui | 28 | 28 | 28 | 1 |
| Opportunités | 27 | 28 | 27 | 1 |
| Analyse | 18 | 21 | 21 | 1 |
| Options | 24 | 19 | 24 | 1 |
| Simulateur | 16 | 21 | 17 | 0 à vide (attendu) |
| Calendrier | 17 | 9 | 10 | 1 |
| Marchés | 24 | 26 | 28 | 1 |
| Graphiques | 24 | 23 | 22 | 1 |
| Portefeuille | 32 | 31 | 25 | 1 |
| Catalyseurs | 19 | 17 | 17 | 1 |
| Risques | 26 | 24 | 24 | 1 |
| Sources & Rapports | 20 | 23 | 23 | 1 |

Débordements horizontaux restants : aucun sur les douze pages hors (a) tables
dans une région défilante déclarée (classement des Opportunités, registre des
Sources), (b) `select` natifs dont `scrollWidth` reflète le texte des options
alors que la boîte est bornée à 100 %.

Bundle de production (Vite 8) — avant → après :

| Chunk | Minifié | gzip |
|---|---|---|
| `index.css` | 202 kB → 199 kB | 29 kB → 28,5 kB |
| `index` (shell) | 323 kB → 324 kB | 97 kB → 97,5 kB |
| `echartsLoader` / `lightweightChartsLoader` / `decisionApi` | inchangés (paresseux) | inchangés |

Le shell gagne `ModuleCell`, le lien d'instrument actif et le repli de
sélecteur d'Options ; il ne charge aucun moteur graphique.

Tests : typecheck 0 erreur, Biome 0 erreur sur 305 fichiers, Vitest 122
fichiers / 1 168 tests verts en suite complète (deux exécutions), portes de
design (`no-ambiguous-dash`, `no-fabricated-values`) vertes.

### 7.6 Dépendances évaluées, aucune ajoutée

`.claude/rules/architecture.md` exige un ADR pour toute dépendance ; aucune ne
justifie un ADR à ce stade :

- **TanStack Table / Virtual** : les tables servies sont bornées par contrat
  (`row_budget`, 10 000 lignes max) et déjà dans des régions défilantes ; le
  tri et la sélection sont côté serveur. À reconsidérer si une table dépasse
  le budget de rendu mesuré.
- **Radix UI** : les seuls composants en jeu (repli `<details>`, boutons
  `aria-pressed`, inspecteur latéral) sont natifs et accessibles ; un dialogue
  modal n'existe pas dans le produit.
- **motion** : `prefers-reduced-motion` et les transitions CSS suffisent ; les
  règles interdisent toute animation qui altère la lecture.
- **lucide-react** : le catalogue d'icônes du système de design est textuel
  (glyphes) ; un jeu d'icônes supplémentaire ferait deux vocabulaires.
- **react-resizable-panels** : l'inspecteur a une largeur fixe décidée par la
  planche ; redimensionner casserait les mesures de rangée.

### 7.7 Restes et risques

- Playwright (portes de mise en page, a11y axe, quatre projets) à rejouer sur
  un poste équipé avant fusion ; les mesures ci-dessus en sont un substitut,
  pas une preuve e2e.
- `apps/web/vite.design-preview.config.ts` (proxy `/api` → 8001) est la
  configuration de prévisualisation design, suivie dans Git depuis `c0b799f`
  (aucun secret) ; `vite.config.ts` reste la référence de build.
- `StatusBadge` (capacités de source, six statuts avec glyphe) et `StatusChip`
  (badge générique) restent deux composants : ils portent deux contrats
  différents, l'unification demanderait un ADR de vocabulaire.
- Format des nombres (point servi vs virgule française) : décision produit
  toujours ouverte.
- Le Simulateur à vide a une matrice de scénarios courte face à la provenance
  (21 %) : la grille est composée pour l'état calculé, seul état où la page a
  une dominante.
