# Registre des sources — Vertex 1.0 Beta (mission 3, 2026-09-06)

Un producteur par famille de schéma, un consommateur par préfixe, une
politique de fraîcheur par nature. Ce registre décrit ce qui existe dans le
dépôt et ce qui tourne sur le poste ; il ne contient aucun secret (les noms de
variables d'environnement seulement).

## 1. Producteurs

| Producteur | Commande / module | Client IBKR | Appels autorisés | Familles produites | Cadence sur le poste |
|---|---|---|---|---|---|
| Historique IBKR | `tools/run_edge_history.py` → `vertex_edge_ibkr.history` | 72 | `reqHistoricalData` (60 req / 10 min, aucune ligne de données) | `ibkr.bars/1` (brut), `ibkr.daily-bars/1`, `ibkr.daily-quote/1` (dérivés par `normalize.py`) | toutes les 30 min (`~/.vertex/ingest-loop.ps1`, `VERTEX_REFRESH_MINUTES`) |
| Dépêches IBKR | `tools/run_edge_news.py` → `vertex_edge_ibkr.news` | 79 | `reqNewsProviders`, `reqHistoricalNews` (un fournisseur à la fois) | `ibkr.news-headline/1` | toutes les 30 min ; dernière passe : 456 appels, 7 176 dépêches, 7 176 doublons, 563 s |
| Sonde d'entitlements | `tools/probe_entitlements.py` → `vertex_edge_ibkr.probe` | 71 | contrats, cotations de test, historique, options, scanner, news, WSH | `source-capability/1.0` | au démarrage de la pile |
| Découverte scanner | `tools/run_edge_discovery.py` → `vertex_edge_ibkr.discovery` | 73 | `reqScannerData` (10 scans, 50 lignes) | `ibkr.scanner/1` | non planifié |
| Temps réel IBKR | `tools/run_edge_ibkr.py` → `vertex_edge_ibkr.runner` | 71 | `reqMktData` (≈100 lignes) | `ibkr.quote/1`, `ibkr.option-computation/1`, `ibkr.option-chain-definition/1` | **non lancé** : aucune page ne consomme `ibkr.quote/` |
| Chaînes d'options IBKR | `tools/run_edge_options.py` → `vertex_edge_ibkr.options` | 75 | `reqSecDefOptParams`, `qualifyContracts`, `reqMktData` instantané par contrat (ligne rendue aussitôt), type 1 ou 3 | `ibkr.option-chain-slice/1` | dans la boucle de 30 min dès que `VERTEX_OPTIONS_UNDERLYINGS`, `VERTEX_OPTIONS_RATE`, `VERTEX_OPTIONS_DIVIDEND_YIELD` sont déclarés ; inactif sinon |
| SEC EDGAR | `tools/run_sec_edgar.py` → `vertex_edge_official.SecEdgarClient` + `vertex_worker.sec_fundamentals` | — | `submissions`, `companyfacts` (User-Agent de contact obligatoire) | `sec.edgar.filing/1`, `sec.edgar.fundamental-fact/1` | manuel, un CIK par commande |
| FRED / ALFRED | `vertex_edge_official.FredClient` | — | `series/observations` (clé `VERTEX_FRED_API_KEY`) | aucune (pas de producteur) | — |
| BCE Data API | `vertex_edge_official.EcbDataClient` | — | `service/data/{flow}/{key}` (sans clé, allowlist) | aucune | — |
| BNS Data Portal | `vertex_edge_official.SnbDataClient` | — | `api/cube/{cube}/data/csv` (sans clé, allowlist) | aucune | — |
| OpenFIGI | `vertex_edge_official.OpenFigiClient` | — | `v3/mapping` (clé optionnelle) | aucune | — |
| TradingView | `apps/ingress-tradingview` (Cloudflare) | — | webhook d'alerte (aucune signature personnalisée supposée) | — | **non déployé** |
| Synthétique | `vertex_core.synthetic` via `apps/web/e2e/seed_synthetic.py` | — | — | `synthetic-*` (cotations, barres, chaîne, calendrier, news) | base `vertex_e2e` uniquement ; jamais en production |

Frontière : aucun producteur n'appelle compte, positions, P&L, ordres,
exécutions ; la denylist est dans `docs/04-integrations/IBKR.md` et
`manifests/forbidden-capabilities.yaml`, vérifiée par
`tools/check_financial_boundary.py`.

## 2. Consommateurs (préfixes admis, deny by default)

| Consommateur (worker) | Sujet outbox | Préfixes admis | Instantané publié |
|---|---|---|---|
| `markets.MarketsOverviewHandler` | `quotes.ingested` | `synthetic-daily-quote/`, `ibkr.daily-quote/` | `markets_overview/global` |
| `analysis.AnalysisHandler` | `analysis.ingested` | `synthetic-daily-bars/`, `ibkr.daily-bars/` (+ chaînes, + rail de preuves) | `analysis/{instrument}` |
| `handlers.AttentionFusionHandler`, file de revue | `observation.ingested` | `synthetic-news/`, `ibkr.news-headline/` | `attention/global`, `review_queue/global` |
| `opportunities.OpportunitiesHandler` | `opportunities.refresh` | barres + rail de preuves | `opportunities/global` |
| `options.OptionChainsHandler` | `option_chains.ingested` | `synthetic-option-chain/`, `ibkr.option-chain-slice/` | `option_chain/{underlying}` |
| `calendar.CalendarHandler` | `calendar.ingested` | `synthetic-calendar-event/` **seulement** | `calendar/global` |
| `sec_fundamentals` | `sec_fundamentals.ingested` | `sec.edgar.filing/`, `sec.edgar.fundamental-fact/` | `sec_fundamentals/{instrument}` |
| `portfolio`, `performance`, `risk` | sujets dédiés | marques `ibkr.daily-quote/` + registre local | `portfolio`, `performance`, `risk` |
| `handlers.CapabilitiesSnapshotHandler` | `capabilities.refresh` | `source-capability/` | `capabilities/global` |

Collision levée dans cette mission : l'adaptateur étiquetait une
**définition** de chaîne (`OptionChainDefinition`, sortie de
`reqSecDefOptParams`) avec `ibkr.option-chain/1`, préfixe que le consommateur
lisait comme une **tranche cotée** et rejetait `invalid_payload`. Désormais la
définition porte `ibkr.option-chain-definition/1` (jamais routée vers le
handler de chaîne) et le consommateur admet `ibkr.option-chain-slice/1`,
produit par `vertex_edge_ibkr.options.OptionChainCollector`
(`tools/run_edge_options.py`, client 75) : contrats avec `bid`/`ask` verbatim,
`underlying_spot` = dernière clôture en base (`underlying_spot_basis`),
`rate` et `dividend_yield` **déclarés** (`assumptions_declared`), Greeks
fournisseur conservés comme preuve, jamais substitués aux calculs `vertex_core`.

## 3. Politiques de fraîcheur (`vertex_core.data.freshness`)

| Famille | TTL séance ouverte | TTL séance fermée |
|---|---|---|
| `intraday_quote` | 5 s | 900 s |
| `selected_option_quote` | 10 s | 900 s |
| `option_surface` | 300 s | 3 600 s |
| `daily_bar` | 86 400 s | 259 200 s |
| `news_attention` | 900 s | 3 600 s |
| `corporate_event` | 86 400 s | 86 400 s |
| `fundamental_filing` | — | 604 800 s |
| `portfolio_mark` | 300 s | 86 400 s |

L'API publie `age_seconds`, `budget_seconds`, `policy kind@version` ; le
frontend affiche l'âge face au budget et ne juge rien lui-même.

## 4. Diffusion sans rechargement

`GET /api/v1/events` (`apps/api/src/vertex_api/events.py`) : flux SSE
`text/event-stream` d'événements `snapshot {"resource": "<kind>/<key>",
"version": n}`, obtenu par sondage des têtes de `snapshot_heads`. Le
frontend (`src/api/events.ts`) invalide la requête react-query de la
ressource : les cartes se rafraîchissent sans rechargement, sans jamais lire
une cotation dans le flux (signal-only).

## 5. Ce qui tourne sur le poste (sans secret)

- `~/.vertex/start-vertex.ps1` : PostgreSQL 18 (2 Go de `shared_buffers`),
  API 8000, web 4173, worker, sonde d'entitlements.
- `~/.vertex/ingest-loop.ps1` : historique puis dépêches, toutes les 30 min,
  journal `~/.vertex/logs/ingest.log`.
- Variables lues : `VERTEX_DATABASE_URL`, `VERTEX_IBKR_PORT`,
  `VERTEX_IBKR_UNIVERSE`, `VERTEX_FUSION_PROFILE`, `VERTEX_REFRESH_MINUTES`,
  `VERTEX_SRC`, `VERTEX_AUTH_OPEN_LOCAL` ; non définies : `VERTEX_SEC_USER_AGENT`,
  `VERTEX_FRED_API_KEY`, `VERTEX_OPENFIGI_API_KEY`.
- Mesure d'amplification (base réelle) : 14 364 cotations → 14 360 versions
  de `markets_overview` ; 20 517 observations → 20 517 versions d'`attention`
  et de `review_queue`. Chaque observation remet un message en file, chaque
  message recalcule et republie. Lot de cette mission : au plus un message
  **en attente** par (sujet, clé de coalescence) — voir
  `VERTEX_RUNBOOK.md`.
- Onze messages `IN_PROGRESS` au moment de la lecture : baux en cours ou
  expirés à moissonner (`reap_expired_leases`), à surveiller dans le runbook.

## 6. Accès à obtenir par l'utilisateur (jamais par l'agent)

- FRED : clé d'API gratuite (compte requis) → `VERTEX_FRED_API_KEY` dans
  `~/.vertex/vertex.env`.
- SEC : aucun compte, mais un User-Agent de contact réel →
  `VERTEX_SEC_USER_AGENT='Vertex research <adresse>'`.
- IBKR WSH (calendrier société) et fournisseurs de news supplémentaires :
  abonnements de données à activer dans la gestion du compte, puis sonde.
- TradingView : déploiement de l'ingress Cloudflare (secret de route) hors
  périmètre de cette nuit.
