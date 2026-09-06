# Runbook — alimentation autonome de Vertex 1.0 Beta (poste local)

Ce runbook décrit ce qui tourne, comment le vérifier, comment le relancer et
quoi faire quand une chaîne s'arrête. Aucun secret : seuls des noms de
variables et des chemins. Compléments : `VERTEX_SOURCE_REGISTRY.md`
(producteurs, consommateurs, fraîcheur) et `VERTEX_DATA_COVERAGE.md`
(couverture page par page).

## 1. Pile locale

| Composant | Démarrage | Port / chemin | Vérification |
|---|---|---|---|
| PostgreSQL 18 | `~/.vertex/start-vertex.ps1` (`pg_ctl`, attend `pg_isready`) | 127.0.0.1:5432, base `vertex` | `pg_isready -h 127.0.0.1 -p 5432` |
| API FastAPI | idem | 127.0.0.1:8000 | `GET /api/v1/markets/overview` → `population = REAL` |
| Worker | idem | journal `~/.vertex/logs/worker-*.out.log` | `select topic, status, count(*) from outbox group by 1,2` |
| Web (Vite preview) | idem | 127.0.0.1:4173 | page Aujourd'hui, bandeau sans « Données synthétiques » |
| TWS | lancé par l'utilisateur, lecture seule, loopback | 127.0.0.1:7496 | sonde d'entitlements au démarrage (client 71) |
| Boucle d'ingestion | `~/.vertex/ingest-loop.ps1` | journal `~/.vertex/logs/ingest.log` | une ligne `->` ou `<-` datée de moins de 70 min (voir la cadence réelle §2) |

Arrêt : `~/.vertex/stop-vertex.ps1` (ou `Arreter-Vertex.cmd`). Le miroir de
travail `~/.vertex/app` est resynchronisé depuis `VERTEX_SRC` à chaque
démarrage (robocopy /MIR, hors `.git`, `node_modules`, `.venv`, `dist`).

### 1 bis. Mode DIRECT — regarder le travail en cours (2026-09-06)

Un seul fichier à ouvrir : **`Vertex.cmd` sur le Bureau**. Il démarre la pile
si elle dort, ajoute le mode direct, puis ouvre une **fenêtre d'application**
(Edge ou Chrome en `--app`, profil dédié `~/.vertex/app-profile`) : pas
d'onglet, pas de barre d'adresse.

| Vue | Port | Ce qu'elle montre |
|---|---|---|
| **Direct** | 127.0.0.1:5174 | le code EN COURS d'écriture ; la page se met à jour seule à chaque modification, sans rechargement |
| **Build livré** | 127.0.0.1:4173 | le paquet de production, ce qui serait livré |

Les deux lisent la MÊME base et la MÊME API (`/api` relayé vers 127.0.0.1:8000
par `apps/web/vite.config.ts`) : mêmes données, même fraîcheur, aucune donnée
de démonstration.

| Script | Rôle |
|---|---|
| `~/.vertex/live-vertex.ps1` | démarre la pile au besoin, le miroir vivant, le serveur à chaud, puis la fenêtre d'application (`-NoWindow` pour s'en passer, `-Page /markets` pour ouvrir ailleurs) |
| `~/.vertex/sync-loop.ps1` | recopie le dépôt vers le miroir toutes les 3 s (mêmes exclusions que le démarrage) ; journal `~/.vertex/logs/sync.log` |
| `~/.vertex/stop-live.ps1` | arrête le mode direct SEUL ; la pile et les données continuent |

PID du mode direct : `~/.vertex/run/live.json`. Vérification de bout en bout
faite le 2026-09-06 : une chaîne modifiée dans le dépôt apparaît à l'écran en
moins de 5 s, sans rechargement (miroir synchronisé en 3 s, HMR immédiat).

## 2. Chaînes d'alimentation et cadence

| Chaîne | Commande | Client | Cadence | Signe de santé |
|---|---|---|---|---|
| Historique quotidien (Marchés, Analyse, Graphiques, Risques, Portefeuille) | `tools/run_edge_history.py` | 72 | pause 30 min (voir note) | `ibkr.daily-quote/1` daté de la dernière séance ; `markets_overview` republié |
| Dépêches (Aujourd'hui, preuves) | `tools/run_edge_news.py` | 79 | pause 30 min (voir note) | `insérées` > 0 les jours de séance ; `doublons` élevés hors séance sont normaux ; `muets` compte les appels rendus SANS dépêche |
| Entitlements (Sources & Rapports) | `tools/probe_entitlements.py` | 71 | au démarrage | `capabilities/global` daté du jour |

**La pause est fixe, la cadence ne l'est pas.** `Start-Sleep` intervient APRÈS
les collecteurs : la période réelle est « durée de la passe + pause ». Mesuré
le 2026-09-06, marché fermé : historique 36 s, dépêches environ 30 minutes
(délais côté fournisseur), pause 30 minutes, soit une passe toutes les
58 minutes environ. Un jour de séance, les dépêches répondent et la passe est
plus courte.

**`erreurs=0` ne veut pas dire « tout est arrivé ».** `reqHistoricalNewsAsync`
n'échoue pas quand le fournisseur ne répond pas : il rend une liste vide, donc
une enveloppe `INSUFFICIENT_DATA`. Le compteur `muets` du résumé mesure ces
appels silencieux (272 sur 456 lors d'un cycle du 2026-09-06). Il ne distingue
pas un délai dépassé d'un fournisseur réellement sans actualité : cette
information ne remonte pas jusqu'à nous.
| SEC EDGAR (Analyse › faits officiels) | `tools/run_sec_edgar.py --cik <CIK> --instrument <TICKER> --persist` | — | manuel | `sec_fundamentals/{instrument}` publié |
| Sources officielles macro | `tools/probe_official_sources.py --live --source fred|ecb|snb …` | — | manuel (aucune ingestion) | enveloppe sans erreur |

Règle de pacing IBKR : 60 requêtes historiques par fenêtre de 10 min ; les
collecteurs attendent, ils ne forcent jamais. Deux clients ne partagent
jamais un `client_id`.

## 3. Coalescence de l'outbox (lot de cette mission)

Avant : une observation ingérée = un message par sujet = un recalcul et une
version publiée. Mesuré : 14 360 versions de `markets_overview` pour un an de
cotations, 20 517 versions d'`attention` et de `review_queue`.

Après (`enqueue_outbox_coalesced`, `vertex_persistence.repository.outbox`) :
au plus **un message en attente** par (sujet, clé `global`) pour les sujets
qui recalculent toute la table (`observation.ingested`, `quotes.ingested`,
`analysis.ingested`, `option_chains.ingested`, `calendar.ingested`,
`opportunities.refresh`, `review_queue.refresh`). Un message déjà claimé ou
en attente de nouvelle tentative n'absorbe jamais un nouveau job : le
recalcul suivant voit toujours la dernière observation. Le job de filing SEC
n'est pas coalescé (son handler lit l'`event_id` du message).

Vérification après une passe d'historique de 57 instruments :

```sql
select topic, status, count(*) from outbox
where created_at > now() - interval '1 hour' group by 1,2 order by 1,2;
```

Attendu : quelques messages par sujet (un par rafale), pas cinquante-sept.
Les versions déjà publiées ne sont pas supprimées : la rétention des anciennes
versions de `snapshots` est une décision de données à prendre par ADR
(historique = preuve), hors de ce lot.

## 4. Diagnostic rapide

| Symptôme | Cause probable | Action |
|---|---|---|
| Bandeau « Données synthétiques » sur la pile réelle | `VERTEX_FUSION_PROFILE` absent du processus | vérifier `~/.vertex/vertex.env`, relancer `start-vertex.ps1` |
| Marchés couvre 0/57 | aucune `ibkr.daily-quote/1` récente | `ingest.log` : TWS injoignable (1100/1101), pacing, `client_id` dupliqué |
| Aujourd'hui sans dépêche | droits news non testés ou timeout d'un fournisseur | relancer `run_edge_news.py` ; un fournisseur à la fois (déjà le cas) |
| Messages `IN_PROGRESS` anciens | worker interrompu pendant un lot | `reap_expired_leases` est appelé par le worker au réveil ; sinon redémarrer le worker |
| Options sans chaîne sur la pile réelle | aucun producteur réel de tranche de chaîne | voir `VERTEX_DATA_COVERAGE.md` §3, chaîne 1 |
| Calendrier vide sur la pile réelle | consommateur limité à `synthetic-calendar-event/` | chaîne 4 : producteur réel puis ouverture du préfixe |
| PostgreSQL ne démarre pas (erreur 487) | `shared_buffers` trop grand pour Windows | `~/.vertex/pgdata/postgresql.conf` : 2 Go |

## 5. Tests à rejouer après une modification backend

```bash
# unitaires + intégration (PostgreSQL réel, base jetable vertex_test)
export VERTEX_TEST_DATABASE_URL='postgresql+psycopg://<user>:<pw>@127.0.0.1:5432/vertex_test'
uv run --no-sync pytest apps/worker/tests apps/worker/tests_integration \
  packages/python/vertex_persistence/tests packages/python/vertex_persistence/tests_integration \
  apps/api/tests apps/api/tests_integration apps/edge-ibkr/tests_integration -q
uv run --no-sync ruff check . && uv run --no-sync mypy
```

La base `vertex_test` est jetable : chaque test la vide (`DROP SCHEMA public
CASCADE`) puis rejoue les migrations Alembic. Ne jamais y pointer une base
réelle.

## 6. Ce que ce poste ne fait jamais

- Aucun appel compte, positions, P&L, ordres, exécutions IBKR ; aucun bouton,
  route ou outil d'ordre. Le portefeuille est saisi à la main.
- Aucune donnée synthétique sur la pile réelle ; aucune valeur inventée
  quand une source manque ; aucun mouvement simulé marché fermé.
- Aucune exposition publique : API et web sur loopback, TWS sur loopback.
