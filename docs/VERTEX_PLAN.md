# Plan de mise en place — alimentation complète de Vertex 1.0 Beta

Établi le 2026-09-06 après la nuit du 5 au 6 septembre (rapport :
`VERTEX_FINAL_REPORT.md`). Un lot = une branche `lot/NN-slug`, une PR, un
squash après relecture humaine. Aucun lot n'est démarré automatiquement : la
règle du dépôt (`CLAUDE.md`, protocole de commande) reste `EXÉCUTE LOT NN`.
Les lots sont ordonnés par valeur pour l'utilisateur et par dépendance.

## 0. Fusionner ce qui est prêt

| Étape | Qui | Détail |
|---|---|---|
| Relire la PR de la branche `agent/vertex-total-audit-ultimate-polish` | humain | 28 commits, CI déclenchée par la PR (tests, portes) ; points de relecture listés dans la PR |
| Rejouer Playwright | humain ou poste équipé | quatre projets (1280, 1440, 1600, 1024) ; portes de mise en page, axe |
| Squash-merge vers `main` | humain | jamais par l'agent |
| Redémarrer la pile locale sur `main` | humain (`Lancer-Vertex.cmd`) ou `~/.vertex/restart-worker.ps1` pour le seul worker | active la coalescence de l'outbox sur la base réelle |

## 1. Autonomie du poste (sans Claude ouvert)

- **État** : les services tournent comme processus détachés lancés par
  `start-vertex.ps1` ; ils ont survécu à des heures de session, mais rien ne
  les relance après un redémarrage de Windows ou une fermeture de session.
  Une tâche planifiée `\VertexAutoStart` existe mais pointe sur un ancien
  chemin du projet donneur (`IBKT-DASHBORD\_vertex_autostart.cmd`).
- **Action humaine** (réglage système, hors périmètre de l'agent) : refaire
  pointer `\VertexAutoStart` sur `C:\Users\elio_\.vertex\Lancer-Vertex.cmd`
  (déclencheur « à l'ouverture de session »), après avoir ouvert TWS.
- **Lot 1** : `stop-vertex.ps1` / `start-vertex.ps1` deviennent idempotents
  (relance des seuls services morts), contrôle de santé unique
  (`GET /api/v1/system/health` + âge du dernier passage d'ingestion), journal
  borné (rotation par taille), reprise : le collecteur d'historique récupère
  les séances manquées (déjà idempotent par `event_id`).
- **Observation** : TWS refuse les connexions depuis 01:50 le 2026-09-06
  (redémarrage nocturne de TWS) ; la boucle réessaie toutes les 30 min sans
  marteler ; elle reprend seule quand TWS est réouvert. Le journal doit le
  dire en une ligne lisible (lot 1).

## 2. Chaîne d'options réelle (livrée, à activer)

- **Action humaine** : déclarer dans `~/.vertex/vertex.env`
  `VERTEX_OPTIONS_UNDERLYINGS` (symboles de l'univers),
  `VERTEX_OPTIONS_RATE`, `VERTEX_OPTIONS_DIVIDEND_YIELD` (hypothèses affichées
  comme telles) ; relancer la boucle un jour de séance.
- **Lot 2** : première observation réelle en séance ; vérifier `option_chain/{underlying}`
  publié, statuts `OK`/`STALE`/`MISSING`, page Options sur la pile réelle ;
  ajuster la sélection (échéances, bande de strikes) selon les lignes
  consommées mesurées. Puis « mouvement attendu » et « IV de référence »
  (contrats serveur dérivés de la tranche).

## 3. Indices, devises, benchmark

- **Lot 3** : relever les `con_id` (SPX, NDX, VIX, SMI, DAX, ESTX50 ;
  EURUSD, USDCHF, EURCHF) avec la sonde ; les ajouter à l'univers avec
  `sec_type` IND/CASH ; le collecteur d'historique les couvre sans ligne de
  données. Côté worker : bloc `indices` et `fx` dans `markets_overview`
  (contrat versionné), benchmark déclaré pour Portefeuille et Graphiques.
  Débloque : Marchés (4 modules), Aujourd'hui (régime, volatilité),
  Graphiques (comparaison base 100), Portefeuille (benchmark).

## 4. Calendrier réel

- **Lot 4** : producteur d'événements à partir (a) des expirations de la
  chaîne d'options réelle, (b) des filings SEC (8-K, 10-Q, 10-K) une fois le
  lot 5 en place, (c) de WSH si le droit est confirmé par la sonde ;
  consommateur ouvert au-delà de `synthetic-calendar-event/`. Débloque :
  Calendrier, Catalyseurs, Aujourd'hui (prochain catalyseur), Analyse,
  Simulateur.

## 5. SEC EDGAR automatisé

- **Action humaine** : `VERTEX_SEC_USER_AGENT` avec un contact réel.
- **Lot 5** : table ticker → CIK depuis `company_tickers.json` (SEC),
  boucle sur l'univers dans la cadence d'ingestion (respect de la politique
  SEC : 10 requêtes/s max, User-Agent), fraîcheur `fundamental_filing`.
  Débloque : Analyse (faits officiels), puis qualité fondamentale, secteur
  par SIC (Portefeuille, Risques).

## 6. Macro et taux

- **Action humaine** : clé FRED (compte gratuit).
- **Lot 6** : producteurs FRED (taux directeurs, courbe), BCE (EXR, taux),
  BNS (cubes déclarés) sur allowlist versionnée ; le taux servi remplace le
  taux déclaré des options ; courbe des taux sur Marchés.

## 7. Actualités : efficacité et couverture Suisse/Europe

- **Lot 7a** : borne `start` de `reqHistoricalNews` à la dernière dépêche
  connue par instrument (aujourd'hui 456 appels par passage pour zéro
  nouveauté hors séance).
- **Lot 7b** : connecteur RSS/Atom sur allowlist (relations investisseurs
  des sociétés suivies, SIX, communiqués officiels), déduplication par
  identifiant et hash, provenance et lien conservés, contenu traité comme
  donnée non fiable. Dépendance candidate : `feedparser` (ADR requis par
  `.claude/rules/architecture.md`).

## 8. Interface : matrice au niveau champ et mises à jour

- **Lot 8** : descendre `VERTEX_DATA_COVERAGE.md` au niveau champ
  (définition, unité, période, source, fraîcheur, absence) ; test e2e « une
  publication SSE rafraîchit la carte sans rechargement » sur Marchés et
  Options ; préservation des filtres et de l'instrument sélectionné mesurée.

## 9. Outils candidats — décision

| Candidat | Décision | Motif |
|---|---|---|
| `ib_async` | conservé (version verrouillée) | déjà encapsulé ; `_NO_STARTUP_FETCH = StartupFetch(0)` et denylist testée (`tools/check_financial_boundary.py`, `manifests/forbidden-capabilities.yaml`) |
| `feedparser` | candidat lot 7b | RSS/Atom standard, pur Python ; ADR à écrire |
| `trafilatura`, `firecrawl`, `changedetection.io`, `playwright-mcp` | non retenus maintenant | aucune page HTML à extraire tant que les API/RSS couvrent le besoin ; navigation Web = dernier recours, jamais avec les identifiants broker |
| `OpenBB` | non retenu | agrégateur multi-sources avec ses propres clés et licences ; ferait une seconde autorité de données |
| `prefect`, `n8n` | non retenus | l'outbox PostgreSQL et la boucle locale suffisent ; pas de second orchestrateur sans ADR |
| `opentelemetry-python` | plus tard | utile pour le lot 1 (santé) si les logs structurés ne suffisent pas |
| `lightweight-charts` skill | à lire lors du lot 8 | la bibliothèque est déjà en place et paresseuse |
| `playwright-cli`, `webapp-testing`, `superpowers`, `skill-creator` | non installés | la suite Playwright du dépôt existe déjà ; il manque un poste pour l'exécuter, pas un skill |

## 10. Ce que l'agent ne fera jamais dans ce plan

Merge vers `main`, force-push, ordre ou lecture de compte IBKR, création de
compte ou de clé chez un fournisseur, modification d'une tâche planifiée ou
d'un réglage système, exposition publique de l'API.
