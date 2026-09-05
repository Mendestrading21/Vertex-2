"""Tranche de chaîne d'options RÉELLE — ce que la page Options attend d'IBKR.

CE QUE CE MODULE RÉSOUT. Le consommateur ``vertex_worker.options`` lit des
TRANCHES cotées : un sous-jacent, une échéance, une classe de négociation,
des contrats portant ``bid``/``ask``, un spot et des hypothèses de taux et de
dividende. Or l'adaptateur n'étiquetait sous ``ibkr.option-chain/1`` que la
DÉFINITION d'une chaîne (``reqSecDefOptParams`` : échéances et strikes, sans
aucune cotation), rejetée en ``invalid_payload`` par le worker. Mesuré le
2026-09-06 sur la base réelle : zéro chaîne publiée, la page Options ne
servait que la population SYNTHETIC. Ce module produit la tranche attendue,
sous un schéma distinct (``ibkr.option-chain-slice/1``) ; la définition garde
le sien (``ibkr.option-chain-definition/1``).

CE QU'IL NE FAIT PAS. Il ne calcule ni IV, ni Greek, ni verdict : la
volatilité implicite est celle de ``vertex_core`` (calcul serveur), les
Greeks fournisseur sont conservés comme observation, jamais substitués. Il
n'invente aucune cotation : marché fermé, une ligne sans ``bid``/``ask`` reste
``None`` et le worker la publie ``MISSING``. Il ne demande jamais un type de
données « figé » (2 ou 4) : une cotation figée du vendredi datée de dimanche
passerait la porte de fraîcheur du worker, qui ne lit pas ``delay_status``.
Il n'appelle aucune capacité compte, position, P&L, ordre ou exécution.

SÉLECTION DÉCLARÉE, BORNÉE. Chaque cotation d'option consomme une ligne de
données le temps d'un instantané ; une chaîne complète en compte des
milliers. La tranche est donc bornée par une sélection EXPLICITE : les N
échéances les plus proches au-delà d'un délai minimal, les strikes dans une
bande autour du spot, un maximum de strikes par échéance. Le spot vient de
la dernière clôture quotidienne déjà en base (aucune ligne consommée), et
la tranche le dit (``underlying_spot_basis``).

HYPOTHÈSES DÉCLARÉES. Le worker exige ``rate`` et ``dividend_yield`` pour
résoudre une IV. Aucune source de taux n'est branchée (FRED exige une clé) :
les deux valeurs sont DÉCLARÉES par la configuration, portées telles quelles
dans la tranche et étiquetées ``assumptions_declared``. La page Options les
affiche déjà comme « hypothèse ».
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from vertex_core.contracts import (
    DataEnvelope,
    DelayStatus,
    EnvelopeQuality,
    canonical_json_hash,
)
from vertex_edge_ibkr.port import (
    ContractQualificationError,
    ContractSpec,
    EdgeIbkrError,
    IbkrInformationPort,
    OptionChainDefinition,
    ProviderError,
)
from vertex_edge_ibkr.probe import is_informational_code

__all__ = [
    "DEFAULT_SLICE_STALE_SECONDS",
    "OPEN_INTEREST_NOT_REQUESTED",
    "OPTION_CHAIN_SLICE_SCHEMA_VERSION",
    "OPTION_CHAIN_SLICE_TYPE",
    "ChainCollectionStats",
    "ChainSelection",
    "DeclaredAssumptions",
    "ObservationSink",
    "OptionChainCollector",
    "UnderlyingSpot",
    "select_definition",
    "select_expirations",
    "select_strikes",
    "slice_event_id",
]

log = logging.getLogger("vertex_edge_ibkr.options")

#: Schéma de la TRANCHE cotée — admis par `vertex_worker.options.OPTION_CHAIN_SCHEMA_PREFIXES`.
OPTION_CHAIN_SLICE_SCHEMA_VERSION = "ibkr.option-chain-slice/1"
OPTION_CHAIN_SLICE_TYPE = "option_chain_slice"
#: Statut d'open interest : la sélection ne demande pas le tick générique 101.
OPEN_INTEREST_NOT_REQUESTED = "NOT_REQUESTED"
#: Budget de fraîcheur d'une tranche : `selected_option_quote` en séance fermée (900 s).
DEFAULT_SLICE_STALE_SECONDS = 900.0
#: Types de données ADMIS : 1 (temps réel) et 3 (retardé). Jamais figé (2, 4).
_ALLOWED_MARKET_DATA_TYPES = (1, 3)
_RIGHT_LABELS: Mapping[str, str] = {"C": "CALL", "P": "PUT"}
_SOURCE = "ibkr"

ObservationSink = Callable[[Sequence[DataEnvelope[Any]]], tuple[int, int]]

_COUNTER_NAMES = (
    "underlyings",
    "skipped_no_spot",
    "skipped_no_definition",
    "skipped_identity",
    "slices",
    "contracts_requested",
    "contracts_quoted",
    "contracts_unquoted",
    "qualification_failures",
    "provider_errors",
    "notices",
    "transport_errors",
    "ingested",
    "duplicates",
)


@dataclass(frozen=True)
class UnderlyingSpot:
    """Spot DÉJÀ OBSERVÉ du sous-jacent, avec sa provenance.

    ``basis`` nomme la nature de la valeur (``daily_close`` pour la dernière
    clôture en base) : la tranche la publie, la page la lit.
    """

    value: Decimal
    observed_at: datetime
    basis: str
    source_event_id: str

    def __post_init__(self) -> None:
        if self.value <= 0:
            raise ValueError("spot must be strictly positive")
        if self.observed_at.tzinfo is None:
            raise ValueError("spot observed_at must be timezone-aware")
        if not self.basis or not self.source_event_id:
            raise ValueError("spot basis and source_event_id are required")


@dataclass(frozen=True)
class ChainSelection:
    """Sélection déclarée d'une tranche : ce qui borne les lignes consommées."""

    expirations: int = 1
    min_days_to_expiry: int = 5
    strike_band: Decimal = Decimal("0.08")
    max_strikes: int = 12
    preferred_exchange: str = "SMART"
    market_data_type: int = 1

    def __post_init__(self) -> None:
        if self.expirations < 1:
            raise ValueError("expirations must be >= 1")
        if self.min_days_to_expiry < 0:
            raise ValueError("min_days_to_expiry must be >= 0")
        if self.strike_band <= 0 or self.strike_band >= 1:
            raise ValueError("strike_band must be in ]0, 1[")
        if self.max_strikes < 1:
            raise ValueError("max_strikes must be >= 1")
        if not self.preferred_exchange:
            raise ValueError("preferred_exchange is required")
        if self.market_data_type not in _ALLOWED_MARKET_DATA_TYPES:
            raise ValueError(
                "market_data_type must be 1 (live) or 3 (delayed); frozen data "
                "(2, 4) is refused: a Friday quote dated Sunday would pass the "
                "worker freshness gate"
            )


@dataclass(frozen=True)
class DeclaredAssumptions:
    """Hypothèses DÉCLARÉES portées par la tranche (jamais observées ici)."""

    rate: Decimal
    dividend_yield: Decimal
    style: str = "AMERICAN"
    settlement: str = "PHYSICAL"

    def __post_init__(self) -> None:
        if not self.rate.is_finite() or not self.dividend_yield.is_finite():
            raise ValueError("rate and dividend_yield must be finite decimals")
        if self.dividend_yield < 0:
            raise ValueError("dividend_yield must be >= 0")
        if not self.style or not self.settlement:
            raise ValueError("style and settlement are required")


@dataclass(frozen=True)
class ChainCollectionStats:
    """Compteurs observables d'une collecte."""

    underlyings: int = 0
    skipped_no_spot: int = 0
    skipped_no_definition: int = 0
    skipped_identity: int = 0
    slices: int = 0
    contracts_requested: int = 0
    contracts_quoted: int = 0
    contracts_unquoted: int = 0
    qualification_failures: int = 0
    provider_errors: int = 0
    notices: int = 0
    transport_errors: int = 0
    ingested: int = 0
    duplicates: int = 0


# --------------------------------------------------------------------------
# Sélection (fonctions pures, testées sans port)
# --------------------------------------------------------------------------


def select_definition(
    definitions: Sequence[OptionChainDefinition],
    *,
    symbol: str | None,
    preferred_exchange: str,
) -> OptionChainDefinition | None:
    """La définition retenue : place préférée, classe standard d'abord.

    Plusieurs classes de négociation peuvent partager une place (mini-options,
    ajustements post-scission) : la classe portant le symbole du sous-jacent
    est la standard. Sans place préférée, rien n'est deviné : ``None``.
    """
    candidates = [d for d in definitions if d.exchange == preferred_exchange]
    if not candidates:
        return None
    if symbol is not None:
        for definition in candidates:
            if definition.trading_class == symbol:
                return definition
    return candidates[0]


def _parse_expiration(raw: str) -> date | None:
    if len(raw) != 8 or not raw.isdigit():
        return None
    try:
        return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
    except ValueError:
        return None


def select_expirations(
    definition: OptionChainDefinition, *, today: date, selection: ChainSelection
) -> tuple[date, ...]:
    """Les N échéances les plus proches au-delà du délai minimal déclaré."""
    floor = today + timedelta(days=selection.min_days_to_expiry)
    parsed = sorted(
        expiry
        for expiry in (_parse_expiration(raw) for raw in definition.expirations)
        if expiry is not None and expiry >= floor
    )
    return tuple(parsed[: selection.expirations])


def select_strikes(
    definition: OptionChainDefinition, *, spot: Decimal, selection: ChainSelection
) -> tuple[Decimal, ...]:
    """Les strikes dans la bande autour du spot, les plus proches d'abord, bornés."""
    low = spot * (Decimal(1) - selection.strike_band)
    high = spot * (Decimal(1) + selection.strike_band)
    in_band = [s for s in definition.strikes if low <= s <= high and s > 0]
    closest = sorted(in_band, key=lambda s: (abs(s - spot), s))[: selection.max_strikes]
    return tuple(sorted(closest))


def slice_event_id(
    underlying_con_id: int, expiration: date, trading_class: str, as_of: datetime
) -> str:
    """Identité d'une tranche : sous-jacent, échéance, classe, instant (UTC, seconde)."""
    stamp = as_of.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    return (
        f"ibkr:option-chain-slice:{underlying_con_id}:{expiration.isoformat()}:"
        f"{trading_class}:{stamp}"
    )


def _decimal_text(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")


def _int_or_none(value: Decimal | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, InvalidOperation):
        return None


# --------------------------------------------------------------------------
# Collecteur
# --------------------------------------------------------------------------


class OptionChainCollector:
    """Parcourt des sous-jacents et publie une tranche cotée par échéance.

    Tout est injecté — port, spots, puits, horloge, sommeil — donc aucun test
    n'ouvre de socket ni n'attend le temps réel. ``max_underlyings`` borne
    l'exécution ; ``None`` traite tout l'univers fourni.
    """

    def __init__(
        self,
        *,
        port: IbkrInformationPort,
        universe: Sequence[ContractSpec],
        spots: Mapping[int, UnderlyingSpot],
        sink: ObservationSink,
        clock: Callable[[], datetime],
        sleep: Callable[[float], Awaitable[None]],
        selection: ChainSelection,
        assumptions: DeclaredAssumptions,
        rights: str = "IBKR_MARKET_DATA_DISPLAY_ONLY",
        pause_seconds: float = 0.2,
        stale_seconds: float = DEFAULT_SLICE_STALE_SECONDS,
        max_underlyings: int | None = None,
    ) -> None:
        if not universe:
            raise ValueError("univers vide : la collecte ne devine aucun sous-jacent")
        if pause_seconds < 0 or stale_seconds <= 0:
            raise ValueError("pause_seconds must be >= 0 and stale_seconds > 0")
        if max_underlyings is not None and max_underlyings < 1:
            raise ValueError("max_underlyings doit être >= 1 quand il est fourni")
        for spec in universe:
            if spec.con_id is None:
                raise ValueError("chaque sous-jacent doit porter un con_id exact")
        self._port = port
        self._universe = tuple(universe)
        self._spots = dict(spots)
        self._sink = sink
        self._clock = clock
        self._sleep = sleep
        self._selection = selection
        self._assumptions = assumptions
        self._rights = rights
        self._pause = pause_seconds
        self._stale_seconds = stale_seconds
        self._max_underlyings = max_underlyings
        self._stop_requested = False
        self._c: dict[str, int] = dict.fromkeys(_COUNTER_NAMES, 0)

    def request_stop(self) -> None:
        """Arrêt demandé : le contrat en cours se termine, puis la boucle sort."""
        self._stop_requested = True

    def stats(self) -> ChainCollectionStats:
        return ChainCollectionStats(**self._c)

    async def run(self) -> ChainCollectionStats:
        for spec in self._universe:
            if self._stop_requested:
                break
            if (
                self._max_underlyings is not None
                and self._c["underlyings"] >= self._max_underlyings
            ):
                break
            self._c["underlyings"] += 1
            envelopes = await self._collect_underlying(spec)
            if envelopes:
                inserted, duplicates = self._sink(envelopes)
                self._c["ingested"] += inserted
                self._c["duplicates"] += duplicates
        log.info(
            "collecte de chaînes terminée — sous-jacents=%d tranches=%d contrats=%d "
            "cotés=%d non_cotés=%d sans_spot=%d sans_définition=%d identité=%d "
            "qualification=%d erreurs_fournisseur=%d notices=%d transport=%d "
            "insérées=%d doublons=%d",
            self._c["underlyings"],
            self._c["slices"],
            self._c["contracts_requested"],
            self._c["contracts_quoted"],
            self._c["contracts_unquoted"],
            self._c["skipped_no_spot"],
            self._c["skipped_no_definition"],
            self._c["skipped_identity"],
            self._c["qualification_failures"],
            self._c["provider_errors"],
            self._c["notices"],
            self._c["transport_errors"],
            self._c["ingested"],
            self._c["duplicates"],
        )
        return self.stats()

    # -- un sous-jacent ----------------------------------------------------

    async def _collect_underlying(self, spec: ContractSpec) -> list[DataEnvelope[Any]]:
        assert spec.con_id is not None  # noqa: S101 (garde réelle dans __init__)
        spot = self._spots.get(spec.con_id)
        if spot is None:
            self._c["skipped_no_spot"] += 1
            log.info("con_id %s sans spot observé en base : sous-jacent sauté", spec.con_id)
            return []
        try:
            definitions = await self._port.sec_def_opt_params(spec)
        except ProviderError as error:
            self._count_provider_error(error, spec.con_id)
            return []
        except (EdgeIbkrError, OSError, TimeoutError) as error:
            self._c["transport_errors"] += 1
            log.warning("transport (%s) sur con_id %s", type(error).__name__, spec.con_id)
            return []
        definition = select_definition(
            definitions,
            symbol=spec.symbol,
            preferred_exchange=self._selection.preferred_exchange,
        )
        if definition is None:
            self._c["skipped_no_definition"] += 1
            log.info(
                "con_id %s : aucune définition de chaîne sur %s",
                spec.con_id,
                self._selection.preferred_exchange,
            )
            return []
        try:
            multiplier = int(definition.multiplier)
        except ValueError:
            multiplier = 0
        if spec.symbol is None or spec.currency is None or multiplier <= 0:
            self._c["skipped_identity"] += 1
            log.info(
                "con_id %s : identité incomplète (symbole, devise ou multiplicateur)", spec.con_id
            )
            return []
        today = self._clock().astimezone(UTC).date()
        expirations = select_expirations(definition, today=today, selection=self._selection)
        strikes = select_strikes(definition, spot=spot.value, selection=self._selection)
        if not expirations or not strikes:
            self._c["skipped_no_definition"] += 1
            log.info("con_id %s : aucune échéance ou aucun strike dans la sélection", spec.con_id)
            return []
        envelopes: list[DataEnvelope[Any]] = []
        for expiration in expirations:
            if self._stop_requested:
                break
            envelope = await self._collect_slice(
                spec,
                spot=spot,
                definition=definition,
                expiration=expiration,
                strikes=strikes,
                multiplier=multiplier,
            )
            if envelope is not None:
                envelopes.append(envelope)
        return envelopes

    # -- une tranche -------------------------------------------------------

    async def _collect_slice(
        self,
        spec: ContractSpec,
        *,
        spot: UnderlyingSpot,
        definition: OptionChainDefinition,
        expiration: date,
        strikes: Sequence[Decimal],
        multiplier: int,
    ) -> DataEnvelope[Any] | None:
        assert spec.con_id is not None and spec.symbol is not None  # noqa: S101
        requested = [
            ContractSpec(
                sec_type="OPT",
                symbol=spec.symbol,
                exchange=definition.exchange,
                currency=spec.currency,
                last_trade_date=expiration.strftime("%Y%m%d"),
                strike=strike,
                right=right,
                trading_class=definition.trading_class,
                multiplier=definition.multiplier,
            )
            for strike in strikes
            for right in ("C", "P")
        ]
        try:
            qualified = await self._port.qualify_contracts(*requested)
        except ContractQualificationError:
            self._c["qualification_failures"] += 1
            log.info(
                "con_id %s échéance %s : qualification refusée pour au moins un "
                "contrat, tranche sautée",
                spec.con_id,
                expiration.isoformat(),
            )
            return None
        except ProviderError as error:
            self._count_provider_error(error, spec.con_id)
            return None
        except (EdgeIbkrError, OSError, TimeoutError) as error:
            self._c["transport_errors"] += 1
            log.warning("transport (%s) sur con_id %s", type(error).__name__, spec.con_id)
            return None

        contracts: list[dict[str, Any]] = []
        observed: list[datetime] = []
        delays: set[DelayStatus] = set()
        rights: str | None = None
        epoch: int | None = None
        for contract in qualified:
            if self._stop_requested:
                break
            entry = await self._snapshot_contract(contract)
            if entry is None:
                continue
            row, envelope = entry
            contracts.append(row)
            if envelope is not None:
                if envelope.observed_at is not None:
                    observed.append(envelope.observed_at)
                delays.add(envelope.delay_status)
                rights = rights or envelope.rights
                epoch = epoch if epoch is not None else envelope.connection_epoch
            if self._pause > 0:
                await self._sleep(self._pause)
        if not contracts:
            return None

        received_at = self._clock()
        observed_at = max(observed) if observed else None
        quoted = sum(1 for c in contracts if c["bid"] is not None and c["ask"] is not None)
        quality = EnvelopeQuality.VALID if quoted == len(contracts) else EnvelopeQuality.PARTIAL
        delay = next(iter(delays)) if len(delays) == 1 else DelayStatus.UNKNOWN
        payload: dict[str, Any] = {
            "type": OPTION_CHAIN_SLICE_TYPE,
            "synthetic": False,
            "underlying": spec.symbol,
            "underlying_con_id": spec.con_id,
            "underlying_spot": _decimal_text(spot.value),
            "underlying_spot_basis": spot.basis,
            "underlying_spot_observed_at": spot.observed_at.isoformat(),
            "underlying_spot_source_event_id": spot.source_event_id,
            "currency": spec.currency,
            "expiration": expiration.isoformat(),
            "trading_class": definition.trading_class,
            "exchange": definition.exchange,
            "style": self._assumptions.style,
            "settlement": self._assumptions.settlement,
            "multiplier": multiplier,
            "rate": _decimal_text(self._assumptions.rate),
            "dividend_yield": _decimal_text(self._assumptions.dividend_yield),
            "assumptions_declared": True,
            "selection": {
                "expirations": self._selection.expirations,
                "min_days_to_expiry": self._selection.min_days_to_expiry,
                "strike_band": _decimal_text(self._selection.strike_band),
                "max_strikes": self._selection.max_strikes,
                "market_data_type_requested": self._selection.market_data_type,
            },
            "contracts": contracts,
            "note": (
                "IBKR option chain slice: quotes verbatim, IV and Greeks are computed "
                "by vertex_core; rate and dividend_yield are DECLARED assumptions."
            ),
        }
        as_of = observed_at if observed_at is not None else received_at
        self._c["slices"] += 1
        return DataEnvelope(
            event_id=slice_event_id(spec.con_id, expiration, definition.trading_class, as_of),
            schema_version=OPTION_CHAIN_SLICE_SCHEMA_VERSION,
            source=_SOURCE,
            instrument_id=str(spec.con_id),
            observed_at=observed_at,
            received_at=received_at,
            as_of=as_of,
            stale_after=received_at + timedelta(seconds=self._stale_seconds),
            quality_status=quality,
            delay_status=delay,
            connection_epoch=epoch,
            rights=rights if rights is not None else self._rights,
            payload_hash=canonical_json_hash(payload),
            payload=payload,
        )

    # -- un contrat --------------------------------------------------------

    async def _snapshot_contract(
        self, contract: ContractSpec
    ) -> tuple[dict[str, Any], DataEnvelope[Any] | None] | None:
        if contract.con_id is None or contract.strike is None or contract.right is None:
            self._c["skipped_identity"] += 1
            return None
        self._c["contracts_requested"] += 1
        try:
            result = await self._port.market_data_snapshot(
                contract, market_data_type=self._selection.market_data_type
            )
        except ProviderError as error:
            self._count_provider_error(error, contract.con_id)
            return None
        except (EdgeIbkrError, OSError, TimeoutError) as error:
            self._c["transport_errors"] += 1
            log.warning("transport (%s) sur con_id %s", type(error).__name__, contract.con_id)
            return None
        quote = result.quote()
        envelope = (
            next((e for e in result.envelopes if e.payload is quote), None)
            if quote is not None
            else None
        )
        bid = quote.bid if quote is not None else None
        ask = quote.ask if quote is not None else None
        if bid is not None and ask is not None:
            self._c["contracts_quoted"] += 1
        else:
            self._c["contracts_unquoted"] += 1
        greeks: dict[str, dict[str, str | None]] = {}
        for observation in result.greeks():
            greeks[observation.basis] = {
                "implied_volatility": _decimal_text(observation.implied_volatility),
                "delta": _decimal_text(observation.delta),
                "gamma": _decimal_text(observation.gamma),
                "vega": _decimal_text(observation.vega),
                "theta": _decimal_text(observation.theta),
            }
        entry: dict[str, Any] = {
            "con_id": contract.con_id,
            "strike": _decimal_text(contract.strike),
            "right": _RIGHT_LABELS[contract.right],
            "bid": _decimal_text(bid),
            "ask": _decimal_text(ask),
            "bid_size": _int_or_none(quote.bid_size) if quote is not None else None,
            "ask_size": _int_or_none(quote.ask_size) if quote is not None else None,
            "volume": _int_or_none(quote.volume) if quote is not None else None,
            "open_interest": None,
            "open_interest_status": OPEN_INTEREST_NOT_REQUESTED,
            "observed_at": (
                envelope.observed_at.isoformat()
                if envelope is not None and envelope.observed_at is not None
                else None
            ),
            "market_data_type": result.reported_market_data_type,
            "delay_status": envelope.delay_status.value if envelope is not None else None,
            "provider_errors": [
                {"code": error.code, "message": error.message} for error in result.provider_errors
            ],
        }
        if greeks:
            # Observation FOURNISSEUR, conservée comme preuve ; jamais un Greek Vertex.
            entry["provider_greeks"] = greeks
        return entry, envelope

    def _count_provider_error(self, error: ProviderError, con_id: int | None) -> None:
        if is_informational_code(error.code):
            self._c["notices"] += 1
            log.info("notice fournisseur %d sur con_id %s", error.code, con_id)
            return
        self._c["provider_errors"] += 1
        log.warning("erreur fournisseur %d sur con_id %s", error.code, con_id)
