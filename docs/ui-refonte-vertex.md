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

## 4. Décisions de design

_(à compléter au fil de l'implémentation — voir §6)_

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

## 6. Points restant à traiter

_(à compléter)_
