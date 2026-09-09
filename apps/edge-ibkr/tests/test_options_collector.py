"""Collecteur de tranches de chaîne : sélection bornée, cotations verbatim, rien d'inventé.

Aucun test n'ouvre de socket ni n'attend le temps réel : port, puits, horloge
et sommeil sont injectés. Toutes les données sont SYNTHETIC.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fakes import make_envelope

from vertex_core.contracts import DelayStatus, EnvelopeQuality
from vertex_edge_ibkr.options import (
    OPEN_INTEREST_NOT_REQUESTED,
    OPTION_CHAIN_SLICE_SCHEMA_VERSION,
    ChainSelection,
    DeclaredAssumptions,
    OptionChainCollector,
    UnderlyingSpot,
    select_definition,
    select_expirations,
    select_strikes,
    slice_event_id,
)
from vertex_edge_ibkr.port import (
    CancellationOutcome,
    ContractQualificationError,
    ContractSpec,
    MarketDataSnapshotResult,
    OperationToken,
    OptionChainDefinition,
    ProviderError,
    QuoteObservation,
)

NOW = datetime(2026, 9, 8, 14, 30, 0, tzinfo=UTC)  # a Tuesday, session open
TODAY = NOW.date()
UNDERLYING = ContractSpec(
    sec_type="STK", con_id=1001, symbol="SYNA", exchange="SMART", currency="USD"
)
SPOT = UnderlyingSpot(
    value=Decimal("100.00"),
    observed_at=NOW - timedelta(days=1),
    basis="daily_close",
    source_event_id="ibkr:daily-quote:1001:2026-09-04",
)
DEFINITION = OptionChainDefinition(
    exchange="SMART",
    underlying_con_id=1001,
    trading_class="SYNA",
    multiplier="100",
    expirations=("20260905", "20260912", "20260919", "20261017"),
    strikes=tuple(Decimal(s) for s in ("80", "90", "95", "100", "105", "110", "120")),
)
SELECTION = ChainSelection(
    expirations=1, min_days_to_expiry=5, strike_band=Decimal("0.08"), max_strikes=4
)
ASSUMPTIONS = DeclaredAssumptions(rate=Decimal("0.0400"), dividend_yield=Decimal("0.0050"))


def _clock() -> datetime:
    return NOW


async def _no_sleep(_seconds: float) -> None:
    await asyncio.sleep(0)


def _snapshot(
    spec: ContractSpec, *, bid: str | None, ask: str | None, observed: bool = True
) -> MarketDataSnapshotResult:
    quote = QuoteObservation(
        con_id=spec.con_id,
        symbol=spec.symbol,
        bid=Decimal(bid) if bid is not None else None,
        ask=Decimal(ask) if ask is not None else None,
        bid_size=Decimal("3") if bid is not None else None,
        ask_size=Decimal("5") if ask is not None else None,
        volume=Decimal("12"),
        market_data_type=1,
    )
    envelope = make_envelope(
        quote,
        con_id=spec.con_id,
        observed_at=NOW - timedelta(seconds=2) if observed else None,
        received_at=NOW,
        quality=EnvelopeQuality.VALID if bid is not None else EnvelopeQuality.PARTIAL,
    )
    return MarketDataSnapshotResult(
        envelopes=(envelope,),
        provider_errors=(),
        requested_market_data_type=1,
        reported_market_data_type=1,
        generic_ticks=(),
        subscription_id="sub",
        operation=OperationToken(
            journal_id="journal",
            connection_epoch_at_start=1,
            provider_sequence_at_start=0,
            market_update_sequence_at_start=0,
        ),
        market_update_sequence_at_end=1,
        cancellation_outcome=CancellationOutcome.CANCELLED,
    )


class FakePort:
    """Port scripté : définitions, qualification et instantanés déterministes."""

    def __init__(
        self,
        *,
        definitions: tuple[OptionChainDefinition, ...] = (DEFINITION,),
        quotes: dict[tuple[str, str], tuple[str | None, str | None]] | None = None,
        qualification_error: bool = False,
        snapshot_errors: dict[tuple[str, str], BaseException] | None = None,
    ) -> None:
        self.definitions = definitions
        self.quotes = quotes if quotes is not None else {}
        self.qualification_error = qualification_error
        self.snapshot_errors = snapshot_errors or {}
        self.snapshot_calls: list[tuple[int, int]] = []
        self.qualified_batches: list[int] = []

    async def sec_def_opt_params(
        self, underlying: ContractSpec
    ) -> tuple[OptionChainDefinition, ...]:
        assert underlying.con_id == 1001
        return self.definitions

    async def qualify_contracts(self, *specs: ContractSpec) -> tuple[ContractSpec, ...]:
        if self.qualification_error:
            raise ContractQualificationError("unqualified contract indexes: [0]")
        self.qualified_batches.append(len(specs))
        return tuple(
            ContractSpec(
                sec_type=spec.sec_type,
                con_id=5000 + index,
                symbol=spec.symbol,
                exchange=spec.exchange,
                currency=spec.currency,
                last_trade_date=spec.last_trade_date,
                strike=spec.strike,
                right=spec.right,
                trading_class=spec.trading_class,
                multiplier=spec.multiplier,
            )
            for index, spec in enumerate(specs)
        )

    async def market_data_snapshot(
        self,
        spec: ContractSpec,
        *,
        generic_ticks: tuple[int, ...] = (),
        market_data_type: int = 1,
        timeout_seconds: float | None = None,
    ) -> MarketDataSnapshotResult:
        assert spec.con_id is not None and spec.strike is not None and spec.right is not None
        self.snapshot_calls.append((spec.con_id, market_data_type))
        key = (format(spec.strike, "f"), spec.right)
        error = self.snapshot_errors.get(key)
        if error is not None:
            raise error
        bid, ask = self.quotes.get(key, (None, None))
        return _snapshot(spec, bid=bid, ask=ask)


class RecordingSink:
    def __init__(self) -> None:
        self.batches: list[tuple[Any, ...]] = []

    def __call__(self, envelopes: Any) -> tuple[int, int]:
        batch = tuple(envelopes)
        self.batches.append(batch)
        return len(batch), 0


def _collector(port: FakePort, sink: RecordingSink, **overrides: Any) -> OptionChainCollector:
    kwargs: dict[str, Any] = {
        "port": port,
        "universe": (UNDERLYING,),
        "spots": {1001: SPOT},
        "sink": sink,
        "clock": _clock,
        "sleep": _no_sleep,
        "selection": SELECTION,
        "assumptions": ASSUMPTIONS,
        "pause_seconds": 0.0,
    }
    kwargs.update(overrides)
    return OptionChainCollector(**kwargs)


# ── sélection pure ───────────────────────────────────────────────────────────


def test_definition_prefers_the_standard_trading_class_on_the_preferred_exchange() -> None:
    mini = OptionChainDefinition(
        exchange="SMART",
        underlying_con_id=1001,
        trading_class="SYNA7",
        multiplier="10",
        expirations=("20260919",),
        strikes=(Decimal("100"),),
    )
    cboe = OptionChainDefinition(
        exchange="CBOE",
        underlying_con_id=1001,
        trading_class="SYNA",
        multiplier="100",
        expirations=("20260919",),
        strikes=(Decimal("100"),),
    )
    assert (
        select_definition((cboe, mini, DEFINITION), symbol="SYNA", preferred_exchange="SMART")
        is DEFINITION
    )
    assert select_definition((cboe,), symbol="SYNA", preferred_exchange="SMART") is None
    assert select_definition((mini,), symbol="SYNA", preferred_exchange="SMART") is mini


def test_expirations_skip_the_minimum_delay_and_are_bounded() -> None:
    # 20260905 is 3 days away (< 5), 20260912 is 4 days away (< 5): both skipped.
    assert select_expirations(DEFINITION, today=TODAY, selection=SELECTION) == (date(2026, 9, 19),)
    two = ChainSelection(
        expirations=2, min_days_to_expiry=5, strike_band=Decimal("0.08"), max_strikes=4
    )
    assert select_expirations(DEFINITION, today=TODAY, selection=two) == (
        date(2026, 9, 19),
        date(2026, 10, 17),
    )
    malformed = OptionChainDefinition(
        exchange="SMART",
        underlying_con_id=1,
        trading_class="X",
        multiplier="100",
        expirations=("2026-09-19", "abcdefgh"),
        strikes=(Decimal("1"),),
    )
    assert select_expirations(malformed, today=TODAY, selection=SELECTION) == ()


def test_strikes_stay_in_the_band_closest_first_and_bounded() -> None:
    # Band ±8 % of 100 → [92, 108]: 95, 100, 105 (90/110 are outside).
    assert select_strikes(DEFINITION, spot=Decimal("100"), selection=SELECTION) == (
        Decimal("95"),
        Decimal("100"),
        Decimal("105"),
    )
    # Closest first (100, then the 95/105 tie broken by the lower strike), then re-sorted.
    wide = ChainSelection(
        expirations=1, min_days_to_expiry=5, strike_band=Decimal("0.25"), max_strikes=2
    )
    assert select_strikes(DEFINITION, spot=Decimal("100"), selection=wide) == (
        Decimal("95"),
        Decimal("100"),
    )


def test_frozen_market_data_types_are_refused() -> None:
    with pytest.raises(ValueError, match="frozen"):
        ChainSelection(market_data_type=2)
    with pytest.raises(ValueError, match="frozen"):
        ChainSelection(market_data_type=4)


def test_slice_event_id_is_stable_per_second() -> None:
    a = slice_event_id(1001, date(2026, 9, 19), "SYNA", NOW)
    b = slice_event_id(1001, date(2026, 9, 19), "SYNA", NOW + timedelta(microseconds=500))
    assert a == b == "ibkr:option-chain-slice:1001:2026-09-19:SYNA:20260908T143000Z"


# ── collecte ─────────────────────────────────────────────────────────────────


def test_one_slice_with_quotes_verbatim_and_declared_assumptions() -> None:
    port = FakePort(
        quotes={
            ("95", "C"): ("6.10", "6.30"),
            ("95", "P"): ("1.00", "1.10"),
            ("100", "C"): ("2.50", "2.60"),
            ("100", "P"): ("2.40", "2.55"),
            ("105", "C"): ("0.80", "0.90"),
            ("105", "P"): ("5.90", "6.20"),
        }
    )
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink).run())

    assert stats.underlyings == 1 and stats.slices == 1
    assert stats.contracts_requested == 6 and stats.contracts_quoted == 6
    assert port.qualified_batches == [6]
    assert all(kind == 1 for _, kind in port.snapshot_calls)
    assert len(sink.batches) == 1 and len(sink.batches[0]) == 1
    envelope = sink.batches[0][0]
    assert envelope.schema_version == OPTION_CHAIN_SLICE_SCHEMA_VERSION
    assert envelope.source == "ibkr" and envelope.instrument_id == "1001"
    assert envelope.quality_status is EnvelopeQuality.VALID
    assert envelope.delay_status is DelayStatus.LIVE
    assert envelope.rights == "SYNTHETIC_TEST"  # inherited from the snapshot envelope
    assert envelope.observed_at == NOW - timedelta(seconds=2)
    payload = envelope.payload
    assert payload["type"] == "option_chain_slice" and payload["synthetic"] is False
    assert payload["underlying"] == "SYNA" and payload["underlying_con_id"] == 1001
    assert (
        payload["underlying_spot"] == "100.00" and payload["underlying_spot_basis"] == "daily_close"
    )
    assert payload["expiration"] == "2026-09-19" and payload["trading_class"] == "SYNA"
    assert payload["multiplier"] == 100 and payload["currency"] == "USD"
    assert payload["rate"] == "0.0400" and payload["dividend_yield"] == "0.0050"
    assert payload["assumptions_declared"] is True
    assert payload["style"] == "AMERICAN" and payload["settlement"] == "PHYSICAL"
    rows = payload["contracts"]
    assert [(r["strike"], r["right"]) for r in rows] == [
        ("95", "CALL"),
        ("95", "PUT"),
        ("100", "CALL"),
        ("100", "PUT"),
        ("105", "CALL"),
        ("105", "PUT"),
    ]
    first = rows[0]
    assert first == {
        "con_id": 5000,
        "strike": "95",
        "right": "CALL",
        "bid": "6.10",
        "ask": "6.30",
        "bid_size": 3,
        "ask_size": 5,
        "volume": 12,
        "open_interest": None,
        "open_interest_status": OPEN_INTEREST_NOT_REQUESTED,
        "observed_at": (NOW - timedelta(seconds=2)).isoformat(),
        "market_data_type": 1,
        "delay_status": "LIVE",
        "provider_errors": [],
    }


def test_closed_market_keeps_rows_without_quotes_and_marks_partial() -> None:
    """Aucune cotation : les lignes restent, bid/ask None, jamais un zéro ni une clôture."""
    port = FakePort(quotes={("100", "C"): ("2.50", "2.60")})
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink).run())

    assert stats.contracts_quoted == 1 and stats.contracts_unquoted == 5
    envelope = sink.batches[0][0]
    assert envelope.quality_status is EnvelopeQuality.PARTIAL
    unquoted = [r for r in envelope.payload["contracts"] if r["bid"] is None]
    assert len(unquoted) == 5
    assert all(r["ask"] is None and r["bid_size"] is None for r in unquoted)


def test_underlying_without_spot_is_skipped_never_guessed() -> None:
    port = FakePort()
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink, spots={}).run())
    assert stats.skipped_no_spot == 1 and stats.slices == 0
    assert sink.batches == [] and port.snapshot_calls == []


def test_no_definition_on_preferred_exchange_is_skipped() -> None:
    other = OptionChainDefinition(
        exchange="CBOE",
        underlying_con_id=1001,
        trading_class="SYNA",
        multiplier="100",
        expirations=("20260919",),
        strikes=(Decimal("100"),),
    )
    port = FakePort(definitions=(other,))
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink).run())
    assert stats.skipped_no_definition == 1 and sink.batches == []


def test_qualification_failure_skips_the_slice() -> None:
    port = FakePort(qualification_error=True)
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink).run())
    assert stats.qualification_failures == 1 and stats.slices == 0 and sink.batches == []


def test_provider_error_on_one_contract_drops_only_that_row() -> None:
    port = FakePort(
        quotes={("95", "C"): ("6.10", "6.30")},
        snapshot_errors={("100", "P"): ProviderError(200, "No security definition")},
    )
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink).run())
    assert stats.provider_errors == 1
    rows = sink.batches[0][0].payload["contracts"]
    assert len(rows) == 5
    assert ("100", "PUT") not in [(r["strike"], r["right"]) for r in rows]


def test_informational_notice_is_counted_as_notice_not_error() -> None:
    port = FakePort(
        snapshot_errors={("95", "C"): ProviderError(2104, "Market data farm connection is OK")}
    )
    sink = RecordingSink()
    stats = asyncio.run(_collector(port, sink).run())
    assert stats.notices == 1 and stats.provider_errors == 0


def test_stop_request_ends_after_the_current_contract() -> None:
    port = FakePort()
    sink = RecordingSink()
    collector = _collector(port, sink)

    async def _run() -> Any:
        task = asyncio.ensure_future(collector.run())
        await asyncio.sleep(0)
        collector.request_stop()
        return await task

    stats = asyncio.run(_run())
    assert stats.contracts_requested <= 6


def test_max_underlyings_bounds_the_run() -> None:
    second = ContractSpec(
        sec_type="STK", con_id=1002, symbol="SYNB", exchange="SMART", currency="USD"
    )
    port = FakePort()
    sink = RecordingSink()
    stats = asyncio.run(
        _collector(port, sink, universe=(UNDERLYING, second), max_underlyings=1).run()
    )
    assert stats.underlyings == 1


def test_universe_entries_need_a_con_id() -> None:
    with pytest.raises(ValueError, match="con_id"):
        _collector(
            FakePort(), RecordingSink(), universe=(ContractSpec(sec_type="STK", symbol="X"),)
        )
