# Couverture des données — Vertex 1.0 Beta (mission 3, 2026-09-06)

État mesuré, pas promis. Base réelle `vertex` (PostgreSQL 18, poste local),
lue en lecture seule le 2026-09-06 à 03:10 UTC ; catalogues de modules
`apps/web/src/pages/*/​*Modules.ts` ; préfixes de schéma admis par le worker.
Aucune donnée de compte, position, P&L, ordre ou exécution IBKR n'existe ni
ne peut exister dans cette chaîne : le port IBKR ne les expose pas et
`tools/check_financial_boundary.py` le vérifie.

## 1. Ce que la base réelle contient

| Famille (`schema_version`) | Source | Lignes | Instruments | Fenêtre observée |
|---|---|---|---|---|
| `ibkr.daily-quote/1` | IBKR historique (`run_edge_history.py`, client 72) | 14 364 | 57 | 2025-09-05 → 2026-09-04 |
| `ibkr.daily-bars/1` | dérivé du même collecteur (une série par instrument) | 57 | 57 | clôture 2026-09-04 |
| `ibkr.bars/1` | lot brut du collecteur (non consommé par une page) | 342 | 57 | 2026-09-04 |
| `ibkr.news-headline/1` | IBKR dépêches (`run_edge_news.py`, client 79) | 5 760 | 57 | — (dépêches datées par le fournisseur) |
| `source-capability/1.0` | sonde d'entitlements (`probe_entitlements.py`, client 71) | 1 | — | 2026-09-05 |

Absents de la base réelle : chaîne d'options, événements de calendrier,
filings SEC, séries macro (FRED / BCE / BNS), scanners, WSH, ticks
instantanés. Les seules populations qui les servent aujourd'hui sont
SYNTHETIC (base `vertex_e2e`, `apps/web/e2e/seed_synthetic.py`).

Instantanés publiés (`snapshots`) : `markets_overview` 14 360 versions,
`attention` 20 517, `review_queue` 20 517, `analysis` 3 015,
`opportunities` 56, `capabilities` 1. Une version par observation ingérée :
la file `outbox` republie sans coalescence (voir `VERTEX_SOURCE_REGISTRY.md`
§5 et le lot « coalescence » de cette mission).

## 2. Statut par page et par module

Légende — **RÉEL** : servi depuis la base réelle ; **SYN** : servi seulement
par la population synthétique (aucun producteur réel) ; **MANUEL** : saisi
par l'utilisateur (registre, thèses) ; **ABSENT** : déclaré absent, motif du
catalogue (`NO_SOURCE` = aucune source autorisée ne le publie,
`SERVER_CONTRACT_MISSING` = contrat serveur à écrire, `DECISION_PENDING` =
décision produit). « Chaîne » = ce qui alimenterait le module.

### Aujourd'hui (`/today`)

| Module | Statut | Chaîne |
|---|---|---|
| Santé des sources | RÉEL | sonde d'entitlements → `capabilities` |
| Prochain catalyseur | SYN | calendrier : aucun producteur réel (chaîne 4) |
| Portefeuille manuel | MANUEL | registre local |
| Opportunités | RÉEL (56 candidats) | `opportunities` ← barres + dépêches |
| File d'attention | RÉEL (dépêches) | `attention` ← `ibkr.news-headline/` |
| Marché global, carte sectorielle | RÉEL | `markets_overview` ← `ibkr.daily-quote/` |
| Instruments suivis | RÉEL | `analysis` par instrument |
| Agenda | SYN | chaîne 4 |
| Régime, volatilité, risques actifs | ABSENT `NO_SOURCE` | indices (chaîne 3) puis calcul serveur |

### Opportunités (`/opportunities`)

| Module | Statut | Chaîne |
|---|---|---|
| Candidats évalués, classement, répartition, statuts, profil, exclusions, provenance des catalyseurs, limites | RÉEL | `opportunities` ← `ibkr.daily-bars/` + rail de preuves (`ibkr.news-headline/`, calendrier) |
| Score moyen, biais global, rendement attendu, score/rendement, facteurs | ABSENT `NO_SOURCE` | aucun moteur de score publié ; refus doctrinal d'une probabilité non calibrée |
| Activité récente | ABSENT `SERVER_CONTRACT_MISSING` | journal des versions de `opportunities` |

### Analyse (`/analysis/:instrument`)

| Module | Statut | Chaîne |
|---|---|---|
| Instrument, identité, chandeliers, indicateurs, oscillateurs, verdict, scénarios, risques déclarés, pairs, preuves | RÉEL | `analysis` ← `ibkr.daily-bars/` + `markets_overview` + dépêches |
| Faits officiels (SEC) | contrat servi, base vide | `sec.edgar.*` ← `run_sec_edgar.py` manuel par CIK (chaîne 5) |
| Catalyseurs à venir | SYN | chaîne 4 |
| Régime, qualité fondamentale, valorisation, confiance du modèle, révisions d'analystes | ABSENT `NO_SOURCE` | SEC (qualité, valorisation partielle) ; estimations = source payante non retenue |
| Niveaux clés, contradictions | ABSENT `SERVER_CONTRACT_MISSING` | calcul `vertex_core` à spécifier |

### Options (`/options/:underlying`)

| Module | Statut | Chaîne |
|---|---|---|
| Sous-jacent, spot, série du sous-jacent | RÉEL | `analysis` / `markets_overview` |
| Chaîne, sourire d'IV, structure par échéance, dividende, taux | SYN aujourd'hui ; producteur réel **construit** (chaîne 1), inactif tant que les hypothèses de taux et de dividende ne sont pas déclarées | `ibkr.option-chain-slice/1` ← `tools/run_edge_options.py` |
| Mouvement attendu, IV de référence | ABSENT `SERVER_CONTRACT_MISSING` | dérivés de la chaîne réelle |
| Rang d'IV | ABSENT `NO_SOURCE` | historique d'IV (365 j de chaînes) |
| Composeur, payoff | ABSENT `DECISION_PENDING` | Simulateur |
| Métriques de stratégie | ABSENT `NO_SOURCE` | — |

### Simulateur (`/simulator`)

| Module | Statut | Chaîne |
|---|---|---|
| Structure, hypothèses, payoff, résultats certifiés, scénarios, écho, méthode, provenance | RÉEL (calcul serveur à la demande) | `POST /simulations/preview` → `vertex_core` |
| Catalyseurs du sous-jacent | SYN | chaîne 4 |
| Monte-Carlo, probabilité de profit, chocs | ABSENT `NO_SOURCE` | refus doctrinal (probabilité non calibrée) |
| Sensibilités, impact portefeuille | ABSENT `SERVER_CONTRACT_MISSING` | Greeks `vertex_core` + registre |

### Calendrier (`/calendar`) et Catalyseurs (`/catalysts`)

| Module | Statut | Chaîne |
|---|---|---|
| Agenda, exposition, densité, prochain événement, compteurs, règle, provenance, révisions, conflits ; chronologie, répartition, exposition du registre, orphelines, revue | SYN | le worker n'admet que `synthetic-calendar-event/` (`calendar.py:178`) — chaîne 4 : expirations d'options (dérivées), filings SEC (8-K, 10-Q/10-K), WSH si droit |
| Rappels, changements depuis la visite, alertes d'événement | ABSENT `SERVER_CONTRACT_MISSING` | état utilisateur local |
| Impact moyen, confiance, surprises, consensus, historique des surprises | ABSENT `NO_SOURCE` | estimations : source payante non retenue |

### Marchés (`/markets`)

| Module | Statut | Chaîne |
|---|---|---|
| Largeur, santé, carte, secteurs, instruments suivis, écartés | RÉEL (57/57 couverts) | `markets_overview` ← `ibkr.daily-quote/` |
| Sessions mondiales, indices, devises, volatilité (indice), structure de volatilité | ABSENT `NO_SOURCE` | chaîne 3 : indices (`sec_type` IND) et devises (`CASH`) dans l'univers, même collecteur d'historique |
| Courbe des taux | ABSENT `SERVER_CONTRACT_MISSING` | chaîne 6 : FRED (clé locale requise) / BCE / BNS |
| Corrélation | ABSENT `SERVER_CONTRACT_MISSING` | matrice de Risques publiée pour le marché |

### Graphiques (`/charts/:instrument`)

| Module | Statut | Chaîne |
|---|---|---|
| Chandeliers, volume, superpositions, indicateurs servis, RSI, MACD | RÉEL | `analysis` ← `ibkr.daily-bars/` |
| Comparaison base 100 | RÉEL si indice de référence déclaré | chaîne 3 (benchmark) |
| Synchronisation, objet sélectionné, alertes liées, dispositions, études | ABSENT | état local / TradingView non déployé |

### Portefeuille (`/portfolio`) et Risques (`/risks`)

| Module | Statut | Chaîne |
|---|---|---|
| Valorisation, performance totale, performance, concentration, devises, lots, dividendes, journal, saisie, import CSV | MANUEL + RÉEL (marques `ibkr.daily-quote/`) | registre local valorisé par le worker ; **jamais** lu depuis IBKR |
| Drawdown, concentration du registre, corrélations, extrêmes, alignement, couverture, écartés | RÉEL (calcul serveur sur barres réelles) | `risk` ← `ibkr.daily-bars/` |
| Performance du jour, benchmark, exposition pays, attribution, score, VaR, liquidité, chocs, facteurs, budget, radar, journal d'alertes | ABSENT `NO_SOURCE` | benchmark = chaîne 3 ; secteurs/pays = chaîne 8 (SIC via SEC) ; le reste = calcul à spécifier |
| Espèces, allocation, exposition secteur, volatilité, rotation, registre des risques | ABSENT `SERVER_CONTRACT_MISSING` | registre + calcul serveur |

### Sources & Rapports (`/sources-reports`)

| Module | Statut |
|---|---|
| Statuts testés, fraîcheur, dernière synchronisation, registre des sources, santé des composants, versions, exports, sondes inconnues | RÉEL |
| Neuf modules d'exploitation (santé globale, couverture des champs, taux d'erreur, incidents, lignée, qualité, audit, rapports, sauvegardes) | ABSENT `SERVER_CONTRACT_MISSING` |

## 3. Chaînes manquantes, par valeur

| # | Chaîne | Pages débloquées | Source autorisée | Effort | Décision |
|---|---|---|---|---|---|
| 1 | Tranche de chaîne d'options réelle (`apps/edge-ibkr/src/vertex_edge_ibkr/options.py`, `tools/run_edge_options.py`) | Options (5 modules), Simulateur, Analyse (scénarios) | IBKR `reqSecDefOptParams`, `qualifyContracts`, instantanés de cotation (type 1 ou 3, jamais figé) | élevé | **construit dans cette mission** : schéma `ibkr.option-chain-slice/1` admis par le worker, définition renommée `ibkr.option-chain-definition/1` (collision levée). Activation locale : déclarer `VERTEX_OPTIONS_UNDERLYINGS`, `VERTEX_OPTIONS_RATE`, `VERTEX_OPTIONS_DIVIDEND_YIELD` dans `~/.vertex/vertex.env` (la boucle d'ingestion l'ajoute alors, client 75). Non lancé contre TWS cette nuit : marché fermé, aucune cotation d'option à observer |
| 2 | Coalescence de l'outbox | toutes (autonomie, disque) | — | faible | **fait dans cette mission** |
| 3 | Indices et devises dans l'univers (`sec_type` IND / CASH) | Marchés (4 modules), Aujourd'hui (régime, volatilité), Graphiques (comparaison), Portefeuille (benchmark) | IBKR historique, aucune ligne de données | faible | `con_id` exacts requis : `universe.py` refuse toute résolution réseau ; à relever avec la sonde puis ajouter à `~/.vertex/univers.json` |
| 4 | Calendrier réel | Calendrier, Catalyseurs, Aujourd'hui, Analyse, Simulateur | expirations d'options (dérivées de 1), filings SEC (5), WSH (droit à sonder) | moyen | consommateur à ouvrir (`CALENDAR_EVENT_SCHEMA_PREFIXES`) après un producteur réel |
| 5 | SEC EDGAR automatisé | Analyse (faits officiels), Calendrier (filings) | SEC (User-Agent de contact obligatoire, `VERTEX_SEC_USER_AGENT`) | moyen | table ticker → CIK (`company_tickers.json` officiel) + boucle sur l'univers |
| 6 | Taux (FRED / BCE / BNS) | Marchés (courbe), Options (taux servi au lieu de déclaré) | clés/allowlists locales ; FRED exige un compte gratuit — **création de compte interdite à l'agent**, à faire par l'utilisateur | faible après clé | ingestion à écrire (clients livrés, aucun producteur) |
| 7 | Secteur/pays par SIC | Portefeuille, Risques | SEC | faible | après 5 |
| 8 | Ticks instantanés (`run_edge_ibkr.py`, `ibkr.quote/1`) | aucune page (aucun consommateur) | IBKR, ~100 lignes | — | ne pas lancer sans consommateur : pollue la fenêtre Marchés (mesuré 2026-09-03) |

## 4. Règles d'honnêteté appliquées

- Une page servie par SYNTHETIC porte la bannière « Données synthétiques »
  et la population dans chaque en-tête servi ; rien n'est présenté comme réel.
- Une absence reste une absence : ni zéro, ni tiret, ni valeur d'un autre
  instrument. Les portes `no-ambiguous-dash` et `no-fabricated-values` sont
  vertes.
- Marché fermé (mesure du samedi 2026-09-06) : dernière clôture 2026-09-04,
  âge affiché face au budget `daily_bar` (259 200 s en séance fermée).
  Aucun mouvement n'est simulé.
