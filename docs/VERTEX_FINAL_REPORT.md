# Rapport final — nuit du 5 au 6 septembre 2026

Trois missions enchaînées sur la branche
`agent/vertex-total-audit-ultimate-polish` (base `main` = `0b82eb2`). Aucun
merge, aucun force-push, aucune réécriture d'historique, aucun secret, aucune
donnée de compte ou d'ordre IBKR, aucune donnée inventée. Ce rapport ne
contient que des faits mesurés ; ce qui n'a pas pu être vérifié est dit tel
quel.

## 1. Résultat en une page

| Mission | État | Preuve |
|---|---|---|
| 1 — refonte coordonnée des dashboards (pilote Options) | terminée | `docs/ui-refonte-vertex.md` §1–§6 |
| 2 — audit total puis optimisation par lots (12 pages, 3 passes) | terminée | `docs/ui-refonte-vertex.md` §7 : rangées ≤ 28 % de vide aux trois viewports, 0 débordement horizontal, CSS 202 → 199 kB, Vitest 122 fichiers / 1 168 verts |
| 3 — alimentation complète et automatique | inventaire livré, deux chaînes livrées, le reste hiérarchisé | `VERTEX_DATA_COVERAGE.md`, `VERTEX_SOURCE_REGISTRY.md`, `VERTEX_RUNBOOK.md`, commits ci-dessous |

Ce que l'utilisateur voit ce matin sur la pile réelle : les douze pages
recomposées, le contexte de travail (instrument actif) visible dans le
bandeau, la file d'attention et les marchés nourris par IBKR toutes les 30
minutes, l'outbox qui ne republie plus une version par observation.

## 2. Mission 3 — ce qui a été livré

### 2.1 Inventaire (lecture seule, base réelle)

- 14 364 cotations quotidiennes, 57 instruments, un an de profondeur ;
  5 760 dépêches ; aucune chaîne d'options, aucun événement de calendrier,
  aucun filing SEC, aucune série macro sur la pile réelle.
- 14 360 versions de `markets_overview` pour 14 364 cotations : chaque
  observation déclenchait un recalcul et une publication.
- Douze chaînes manquantes hiérarchisées par valeur
  (`VERTEX_DATA_COVERAGE.md` §3).

### 2.2 Coalescence de l'outbox (livrée)

`enqueue_outbox_coalesced` (`vertex_persistence.repository.outbox`) : au plus
un message **en attente** par (sujet, clé) pour les sept sujets qui
recalculent toute la table. Un message déjà claimé n'absorbe jamais un
nouveau job (lecture `FOR UPDATE`, claim `SKIP LOCKED`) : aucune observation
ne peut rester sans recalcul. Le job de filing SEC, qui lit son message,
n'est pas coalescé. Cinq tests d'intégration PostgreSQL (rafale de 500 →
un job ; clés distinctes ; job en cours ; messages simples intacts ; forme
du payload) et neuf tests unitaires d'ingestion ; les sept tests de chaîne
qui figeaient « un job par observation » ont été mis à jour, la campagne de
chaos garde son scénario d'interruption avec un lot d'un message.

### 2.3 Collecteur réel de chaînes d'options (livré, inactif par défaut)

- `vertex_edge_ibkr.options.OptionChainCollector` + `tools/run_edge_options.py`
  (client 75) : définition via `reqSecDefOptParams`, qualification des
  contrats, instantané de cotation par contrat (ligne rendue aussitôt), type
  de données 1 ou 3 **jamais figé**, sélection bornée (N échéances au-delà
  d'un délai minimal, strikes dans une bande autour de la dernière clôture
  en base, plafond par échéance).
- Collision de schéma levée : la définition de chaîne porte désormais
  `ibkr.option-chain-definition/1`, la tranche cotée `ibkr.option-chain-slice/1`,
  seule admise par `vertex_worker.options`.
- Honnêteté : cotations verbatim (marché fermé → `bid`/`ask` `None`, publiés
  `MISSING` par le worker, jamais une clôture), spot étiqueté `daily_close`,
  taux et dividende **déclarés** (`assumptions_declared`), Greeks fournisseur
  conservés comme preuve, IV et Greeks calculés par `vertex_core`.
- Onze tests unitaires sur port factice (sélection pure, tranche complète,
  marché fermé, sans spot, sans définition, qualification refusée, erreur
  fournisseur par contrat, notice, arrêt, borne, univers).
- **Non lancé contre TWS** : samedi, aucune cotation d'option à observer ; et
  les hypothèses de taux et de dividende sont une décision de l'utilisateur.
  Activation : trois lignes dans `~/.vertex/vertex.env`
  (`VERTEX_OPTIONS_UNDERLYINGS`, `VERTEX_OPTIONS_RATE`,
  `VERTEX_OPTIONS_DIVIDEND_YIELD`), la boucle d'ingestion l'ajoute au
  prochain démarrage.

### 2.4 Non livré, et pourquoi

| Chaîne | Raison | Prochaine action |
|---|---|---|
| Indices et devises (Marchés, benchmark) | `con_id` exacts requis ; le consommateur Marchés n'a pas de bloc « indices » | relever les `con_id` avec la sonde, ajouter un bloc `indices` au snapshot Marchés (lot worker + API + page) |
| Calendrier réel | aucun producteur réel ; consommateur limité à `synthetic-calendar-event/` | dériver les expirations d'options de la chaîne réelle, puis les filings SEC |
| SEC automatisé | `VERTEX_SEC_USER_AGENT` exige un contact réel : décision de l'utilisateur | déclarer la variable, ajouter la table ticker → CIK officielle, boucler sur l'univers |
| Taux FRED / BCE / BNS | FRED exige un compte (interdit à l'agent) ; BCE/BNS sans producteur | clé FRED par l'utilisateur ; producteur BCE/BNS sur allowlist |
| Dépêches incrémentales | 456 appels / 30 min pour 7 176 doublons | borne `start` de `reqHistoricalNews` à la dernière dépêche connue par instrument |
| Rétention des anciennes versions de `snapshots` | suppression de données = décision par ADR | ADR de rétention (garder N versions par clé) |

## 3. Commits de la nuit (branche, aucun merge)

Mission 1 et 2 : voir `docs/ui-refonte-vertex.md` §7.3 (dix-neuf commits, de
`2f63931` à `e3d8157`).

Mission 3 : `97a66c4` docs(feed) inventaire et runbook, `466abc0`
docs(status) NOW, `63ea7b7` feat(outbox) coalescence, `2fa34a8`
feat(edge-ibkr) collecteur de chaînes, puis `chore(skills)` retrait du
launcher Impeccable et `docs(report)` — voir `git log 0b82eb2..HEAD`.

## 4. Preuves exécutées (poste local, base jetable `vertex_test`)

- Web : tsc 0 erreur, Biome 0 erreur (305 fichiers), Vitest 122 fichiers /
  1 168 verts, build Vite 3,9 s.
- Python (environnement de test propre, sans les variables de la pile
  réelle) : persistance + worker, unitaires et intégration PostgreSQL :
  695 verts ; API unitaires : 1 393 verts ; API intégration, edge-ibkr
  intégration, sources officielles, outils : 513 verts, 1 ignoré ; edge-ibkr
  unitaires : 408 verts ; ruff 0 erreur et mypy 0 erreur sur les fichiers
  modifiés (deux erreurs mypy préexistantes dans
  `tools/build_performance_report.py`, `os.sysconf` absent sous Windows).
- Portes du dépôt rejouées sur le checkout Git : secrets (1 120 fichiers
  suivis, aucun secret), frontière financière (`ok`, aucun finding), notices,
  politique — vertes après le retrait du launcher Impeccable (commit
  `chore(skills)`).
- Échecs restants, tous propres à ce poste Windows et à son rôle PostgreSQL,
  aucun lié aux changements : quatre tests de démarrage exigent le privilège
  `CREATE DATABASE` (le rôle `vertex` ne l'a pas) ; deux tests de câblage des
  suites comparent des chemins avec `\` contre `/` ; un test lance `bash`
  absent du PATH ; le premier passage avait aussi montré que charger
  `vertex.env` dans le processus de test (`VERTEX_AUTH_OPEN_LOCAL`) fait
  échouer les tests fail-closed — corrigé dans le lanceur, pas dans le code.
- Non exécutable ici : Playwright (aucun navigateur installé, `python3` et
  `service postgresql` supposés par `global.setup.ts`).

## 5. Interdits respectés

Aucun appel compte, positions, P&L, ordres, exécutions ; aucun bouton ni
route d'ordre ; portefeuille manuel intact ; aucune donnée synthétique sur la
pile réelle ; aucun mouvement simulé marché fermé ; aucun scraping ; aucune
clé ni secret dans Git, les rapports ou les journaux ; aucun compte créé ;
aucune exposition publique ; aucune modification hors du dépôt cible et de
`~/.vertex` (boucle d'ingestion locale).

## 6. Prochaine commande recommandée

Déclarer les trois variables d'options dans `~/.vertex/vertex.env`, relancer
`~/.vertex/ingest-loop.ps1` un jour de séance, puis lire
`docs/VERTEX_RUNBOOK.md` §3 pour vérifier la coalescence sur la base réelle.
