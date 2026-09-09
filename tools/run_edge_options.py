#!/usr/bin/env python3
"""Collecte de tranches de chaîne d'options IBKR — ce qui remplit la page Options.

CE QUE CETTE COMMANDE RÉSOUT. Mesuré le 2026-09-06 sur la base réelle : zéro
chaîne d'options publiée, la page Options ne servait que la population
SYNTHETIC. Le consommateur (`vertex_worker.options`) attend une TRANCHE cotée
— contrats avec `bid`/`ask`, spot, hypothèses — et l'adaptateur n'étiquetait
que la DÉFINITION d'une chaîne (échéances, strikes), rejetée `invalid_payload`.
`vertex_edge_ibkr.options` produit la tranche attendue ; cette commande la
fait tourner contre TWS et écrit dans le MÊME chemin de persistance que le
reste de Vertex (`ingest_envelope`, puis le worker publie).

SÉLECTION EXPLICITE. Chaque cotation d'option consomme une ligne de données
le temps d'un instantané. La commande refuse de deviner quoi coter : les
sous-jacents (`VERTEX_OPTIONS_UNDERLYINGS`, symboles de l'univers), le taux
et le dividende DÉCLARÉS (`VERTEX_OPTIONS_RATE`, `VERTEX_OPTIONS_DIVIDEND_YIELD`)
sont obligatoires. Le spot est la dernière clôture quotidienne en base : sans
clôture, le sous-jacent est sauté et compté.

JAMAIS DE DONNÉE FIGÉE. Le type de données est 1 (temps réel) ou 3 (retardé) ;
2 et 4 (figé) sont refusés par le collecteur : une cotation du vendredi datée
de dimanche passerait la porte de fraîcheur du worker.

CLIENT ID DISTINCT. Le défaut est **75** : 71 temps réel, 72 historique, 73
découverte, 79 dépêches. Deux clients API partageant un identifiant se
déconnectent mutuellement.

FAIL-CLOSED. DSN depuis l'environnement uniquement, valeur d'exemple refusée,
base de test refusée sans ``VERTEX_ALLOW_TEST_DB=1``, univers OBLIGATOIRE,
hôte ``127.0.0.1`` en dur.

FRONTIÈRE FINANCIÈRE. ``sec_def_opt_params``, ``qualify_contracts`` et
``market_data_snapshot`` sont les seuls appels utilisés. Aucune capacité
compte, position, P&L, ordre ou exécution.

USAGE ::

    export VERTEX_DATABASE_URL='postgresql+psycopg://vertex:…@127.0.0.1:5432/vertex'
    export VERTEX_IBKR_UNIVERSE="$HOME/.vertex/univers.json"
    export VERTEX_IBKR_PORT=7496
    export VERTEX_OPTIONS_UNDERLYINGS='AAPL,NVDA,MSFT'
    export VERTEX_OPTIONS_RATE='0.0400'
    export VERTEX_OPTIONS_DIVIDEND_YIELD='0.0000'
    .venv/bin/python tools/run_edge_options.py

Codes de sortie : ``0`` fin normale, ``2`` configuration invalide ou refus.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import signal
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import FrameType
from typing import Any, NoReturn

REPO_ROOT = Path(__file__).resolve().parents[1]

for _package in (
    "packages/python/vertex_core/src",
    "packages/python/vertex_persistence/src",
    "apps/edge-ibkr/src",
    "apps/worker/src",
):
    _path = str(REPO_ROOT / _package)
    if _path not in sys.path:
        sys.path.insert(0, _path)

from sqlalchemy import create_engine, select  # noqa: E402 - après l'amorçage du sys.path
from sqlalchemy.orm import Session  # noqa: E402

from vertex_core.contracts import DataEnvelope  # noqa: E402
from vertex_edge_ibkr.adapter import IbAsyncInformationAdapter  # noqa: E402
from vertex_edge_ibkr.normalize import DAILY_QUOTE_SCHEMA_VERSION  # noqa: E402
from vertex_edge_ibkr.options import (  # noqa: E402
    ChainSelection,
    DeclaredAssumptions,
    OptionChainCollector,
    UnderlyingSpot,
)
from vertex_edge_ibkr.port import ContractSpec  # noqa: E402
from vertex_edge_ibkr.state import ConnectionStateMachine  # noqa: E402
from vertex_edge_ibkr.universe import UniverseError, load_universe  # noqa: E402
from vertex_persistence.dsn import database_name  # noqa: E402
from vertex_persistence.models import Observation  # noqa: E402
from vertex_worker.ingest import ingest_envelope  # noqa: E402

__all__ = ["main"]

log = logging.getLogger("vertex_edge_options")

_EXAMPLE_MARKERS = ("CHANGE_ME", "change_me", "example", "placeholder")
_TEST_DATABASE_MARKERS = ("_test", "test_", "vertex_test", "vertex_e2e")

DEFAULT_CLIENT_ID = 75
DEFAULT_TWS_PORT = 7497
SPOT_BASIS_DAILY_CLOSE = "daily_close"


def _refuser(message: str) -> NoReturn:
    print(f"REFUS: {message}", file=sys.stderr)
    raise SystemExit(2)


class PostgresObservationSink:
    """Puits réel : une transaction par lot, le worker publie ensuite."""

    def __init__(self, engine: Any) -> None:
        self._engine = engine

    def __call__(self, envelopes: Sequence[DataEnvelope[Any]]) -> tuple[int, int]:
        inserees = 0
        doublons = 0
        with Session(self._engine) as session:
            for enveloppe in envelopes:
                resultat = ingest_envelope(session, enveloppe)
                if resultat.inserted:
                    inserees += 1
                else:
                    doublons += 1
            session.commit()
        return inserees, doublons


def _require_database_url() -> str:
    url = os.environ.get("VERTEX_DATABASE_URL", "").strip()
    if not url:
        _refuser("VERTEX_DATABASE_URL absent. La collecte ne devine aucune base.")
    if any(marker in url for marker in _EXAMPLE_MARKERS):
        _refuser("VERTEX_DATABASE_URL porte une valeur d'exemple. Refus de démarrer.")
    base = database_name(url)
    if (
        any(marker in base for marker in _TEST_DATABASE_MARKERS)
        and os.environ.get("VERTEX_ALLOW_TEST_DB") != "1"
    ):
        _refuser(
            f"La base « {base} » ressemble à une base de test. Pour l'utiliser "
            "volontairement, définir VERTEX_ALLOW_TEST_DB=1."
        )
    return url


def _require_universe_path() -> Path:
    brut = os.environ.get("VERTEX_IBKR_UNIVERSE", "").strip()
    if not brut:
        _refuser(
            "VERTEX_IBKR_UNIVERSE absent. La collecte n'invente AUCUN sous-jacent : "
            "fournir le fichier d'univers JSON (con_id exacts)."
        )
    return Path(brut).expanduser()


def _require_symbols() -> tuple[str, ...]:
    brut = os.environ.get("VERTEX_OPTIONS_UNDERLYINGS", "").strip()
    symboles = tuple(dict.fromkeys(s.strip().upper() for s in brut.split(",") if s.strip()))
    if not symboles:
        _refuser(
            "VERTEX_OPTIONS_UNDERLYINGS absent. Chaque cotation d'option consomme une "
            "ligne de données : les sous-jacents à coter sont déclarés, jamais devinés "
            "(liste de symboles de l'univers, séparés par des virgules)."
        )
    return symboles


def _require_decimal(name: str) -> Decimal:
    brut = os.environ.get(name, "").strip()
    if not brut:
        _refuser(
            f"{name} absent. Le worker exige cette hypothèse pour résoudre une IV ; "
            "elle est DÉCLARÉE (aucune source de taux n'est branchée), jamais devinée."
        )
    try:
        valeur = Decimal(brut)
    except InvalidOperation:
        _refuser(f"{name} doit être un décimal, reçu {brut!r}.")
    if not valeur.is_finite():
        _refuser(f"{name} doit être fini, reçu {brut!r}.")
    return valeur


def _positive_int(name: str, default: int) -> int:
    brut = os.environ.get(name, "").strip()
    if not brut:
        return default
    try:
        valeur = int(brut)
    except ValueError:
        _refuser(f"{name} doit être un entier, reçu {brut!r}.")
    if valeur <= 0:
        _refuser(f"{name} doit être strictement positif, reçu {valeur}.")
    return valeur


def _band(name: str, default: str) -> Decimal:
    brut = os.environ.get(name, "").strip() or default
    try:
        valeur = Decimal(brut)
    except InvalidOperation:
        _refuser(f"{name} doit être un décimal, reçu {brut!r}.")
    return valeur


def latest_daily_closes(session: Session, con_ids: Sequence[int]) -> dict[int, UnderlyingSpot]:
    """Dernière clôture quotidienne EN BASE par sous-jacent — aucune ligne consommée.

    Une clôture absente ou illisible ne devient jamais un spot : le
    sous-jacent est simplement absent du résultat, et le collecteur le saute
    en le comptant.
    """
    spots: dict[int, UnderlyingSpot] = {}
    refs = [str(con_id) for con_id in con_ids]
    rows = session.execute(
        select(Observation)
        .where(
            Observation.schema_version == DAILY_QUOTE_SCHEMA_VERSION,
            Observation.instrument_ref.in_(refs),
        )
        .order_by(Observation.instrument_ref, Observation.as_of.desc())
    ).scalars()
    for row in rows:
        ref = row.instrument_ref
        if ref is None or not ref.isdigit():
            continue
        con_id = int(ref)
        if con_id in spots:
            continue  # la plus récente d'abord, grâce au tri
        payload = row.payload if isinstance(row.payload, dict) else {}
        close_text = payload.get("close")
        if not isinstance(close_text, str):
            continue
        try:
            close = Decimal(close_text)
        except InvalidOperation:
            continue
        if not close.is_finite() or close <= 0:
            continue
        as_of = row.as_of if row.as_of.tzinfo is not None else row.as_of.replace(tzinfo=UTC)
        spots[con_id] = UnderlyingSpot(
            value=close,
            observed_at=as_of,
            basis=SPOT_BASIS_DAILY_CLOSE,
            source_event_id=row.event_id,
        )
    return spots


def _select_underlyings(
    universe: Sequence[ContractSpec], symbols: Sequence[str]
) -> tuple[ContractSpec, ...]:
    by_symbol = {spec.symbol: spec for spec in universe if spec.symbol}
    manquants = [s for s in symbols if s not in by_symbol]
    if manquants:
        _refuser(
            "VERTEX_OPTIONS_UNDERLYINGS nomme des symboles hors de l'univers : "
            f"{', '.join(manquants)}. Un sous-jacent hors univers n'a ni con_id ni page."
        )
    return tuple(by_symbol[s] for s in symbols)


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("VERTEX_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    url = _require_database_url()
    chemin_univers = _require_universe_path()
    symboles = _require_symbols()
    rate = _require_decimal("VERTEX_OPTIONS_RATE")
    dividend_yield = _require_decimal("VERTEX_OPTIONS_DIVIDEND_YIELD")
    port_tws = _positive_int("VERTEX_IBKR_PORT", DEFAULT_TWS_PORT)
    client_id = _positive_int("VERTEX_IBKR_OPTIONS_CLIENT_ID", DEFAULT_CLIENT_ID)
    try:
        selection = ChainSelection(
            expirations=_positive_int("VERTEX_OPTIONS_EXPIRATIONS", 1),
            min_days_to_expiry=_positive_int("VERTEX_OPTIONS_MIN_DAYS", 5),
            strike_band=_band("VERTEX_OPTIONS_STRIKE_BAND", "0.08"),
            max_strikes=_positive_int("VERTEX_OPTIONS_MAX_STRIKES", 12),
            preferred_exchange=os.environ.get("VERTEX_OPTIONS_EXCHANGE", "").strip() or "SMART",
            market_data_type=_positive_int("VERTEX_OPTIONS_MARKET_DATA_TYPE", 1),
        )
        assumptions = DeclaredAssumptions(rate=rate, dividend_yield=dividend_yield)
    except ValueError as erreur:
        _refuser(f"sélection refusée : {erreur}")

    try:
        univers = load_universe(chemin_univers)
    except UniverseError as erreur:
        _refuser(f"univers refusé : {erreur}")
    sous_jacents = _select_underlyings(univers, symboles)

    engine = create_engine(url, pool_pre_ping=True)
    with Session(engine) as session:
        spots = latest_daily_closes(
            session, [s.con_id for s in sous_jacents if s.con_id is not None]
        )
    sans_spot = [s.symbol for s in sous_jacents if s.con_id not in spots]
    if sans_spot:
        log.warning(
            "aucune clôture quotidienne en base pour %s : ces sous-jacents seront sautés "
            "(lancer d'abord tools/run_edge_history.py)",
            ", ".join(str(s) for s in sans_spot),
        )

    state = ConnectionStateMachine(rng=random.SystemRandom())
    adapter = IbAsyncInformationAdapter(port=port_tws, client_id=client_id, state=state)
    collector = OptionChainCollector(
        port=adapter,
        universe=sous_jacents,
        spots=spots,
        sink=PostgresObservationSink(engine),
        clock=lambda: datetime.now(UTC),
        sleep=asyncio.sleep,
        selection=selection,
        assumptions=assumptions,
    )

    def _demander_arret(signum: int, _frame: FrameType | None) -> None:
        log.info("signal %s reçu — arrêt après le contrat en cours", signal.Signals(signum).name)
        collector.request_stop()

    signal.signal(signal.SIGTERM, _demander_arret)
    signal.signal(signal.SIGINT, _demander_arret)

    contrats = len(sous_jacents) * selection.expirations * selection.max_strikes * 2
    log.info(
        "collecte de chaînes : 127.0.0.1:%d, client_id=%d, %d sous-jacent(s), "
        "%d échéance(s), bande ±%s, %d strikes max — au plus %d instantanés, "
        "type de données %d, taux déclaré %s, dividende déclaré %s",
        port_tws,
        client_id,
        len(sous_jacents),
        selection.expirations,
        selection.strike_band,
        selection.max_strikes,
        contrats,
        selection.market_data_type,
        rate,
        dividend_yield,
    )
    log.warning(
        "AUCUNE capacité compte, position, P&L, ordre ou exécution n'est utilisée. "
        "Chaque instantané rend sa ligne de données avant le suivant."
    )

    async def _session() -> Any:
        await adapter.connect()
        try:
            return await collector.run()
        finally:
            await adapter.disconnect()

    try:
        stats = asyncio.run(_session())
    finally:
        engine.dispose()

    log.info(
        "terminé — sous-jacents=%d tranches=%d contrats=%d cotés=%d non_cotés=%d "
        "insérées=%d doublons=%d erreurs_fournisseur=%d notices=%d transport=%d",
        stats.underlyings,
        stats.slices,
        stats.contracts_requested,
        stats.contracts_quoted,
        stats.contracts_unquoted,
        stats.ingested,
        stats.duplicates,
        stats.provider_errors,
        stats.notices,
        stats.transport_errors,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
