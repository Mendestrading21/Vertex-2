"""Remplissage historique : respecter le pacing, ne rien perdre, ne rien mentir.

Aucun test ici n'ouvre de socket, ne touche une base ni n'attend le temps réel :
port, puits, pacer et sommeil sont tous injectés, et l'horloge est pilotée à la
main. Ce que chaque test protège est nommé dans sa docstring.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fakes import make_envelope

from vertex_edge_ibkr.history import HistoryBackfiller
from vertex_edge_ibkr.pacing import SlidingWindowPacer
from vertex_edge_ibkr.port import (
    BarObservation,
    BarsPayload,
    ContractSpec,
    EdgeIbkrError,
    ProviderError,
)

SPEC_A = ContractSpec(sec_type="STK", con_id=1001, symbol="AAA", exchange="SMART")
SPEC_B = ContractSpec(sec_type="STK", con_id=1002, symbol="BBB", exchange="SMART")
SPEC_C = ContractSpec(sec_type="STK", con_id=1003, symbol="CCC", exchange="SMART")


class Horloge:
    def __init__(self) -> None:
        self.maintenant = 0.0

    def __call__(self) -> float:
        return self.maintenant

    def avancer(self, secondes: float) -> None:
        self.maintenant += secondes


class FauxPort:
    """Barres scriptées par ``con_id`` ; une exception est levée telle quelle."""

    def __init__(self, barres: dict[int, Any] | None = None) -> None:
        self.barres = barres or {}
        self.appels: list[tuple[int, str, str]] = []

    async def historical_bars(
        self,
        spec: ContractSpec,
        *,
        end: Any = None,
        duration: str = "1 D",
        bar_size: str = "1 hour",
        what_to_show: str = "TRADES",
        use_rth: bool = True,
    ) -> Any:
        assert spec.con_id is not None
        self.appels.append((spec.con_id, duration, bar_size))
        comportement = self.barres.get(spec.con_id)
        if isinstance(comportement, BaseException):
            raise comportement
        if comportement is None:
            return make_envelope({"con_id": spec.con_id}, con_id=spec.con_id)
        return comportement


class PuitsEnregistreur:
    def __init__(self, *, duplicates: int = 0) -> None:
        self.lots: list[tuple[Any, ...]] = []
        self._duplicates = duplicates

    def __call__(self, envelopes: Any) -> tuple[int, int]:
        lot = tuple(envelopes)
        self.lots.append(lot)
        doublons = min(self._duplicates, len(lot))
        return len(lot) - doublons, doublons


class SommeilEnregistreur:
    """Sommeil instantané qui AVANCE l'horloge : l'attente devient observable."""

    def __init__(self, horloge: Horloge) -> None:
        self.horloge = horloge
        self.delais: list[float] = []

    async def __call__(self, delai: float) -> None:
        self.delais.append(delai)
        self.horloge.avancer(delai)


def monter(
    port: FauxPort,
    *,
    universe: tuple[ContractSpec, ...] = (SPEC_A,),
    max_requests: int | None = None,
    window_max: int = 60,
    window: float = 600.0,
    cooldown: float = 0.0,
) -> tuple[HistoryBackfiller, PuitsEnregistreur, SommeilEnregistreur, Horloge]:
    horloge = Horloge()
    sommeil = SommeilEnregistreur(horloge)
    puits = PuitsEnregistreur()
    backfiller = HistoryBackfiller(
        port=port,
        universe=universe,
        sink=puits,
        pacer=SlidingWindowPacer(
            max_requests=window_max,
            window_seconds=window,
            identical_cooldown_seconds=cooldown,
            clock=horloge,
        ),
        sleep=sommeil,
        duration="1 Y",
        bar_size="1 day",
        max_requests=max_requests,
    )
    return backfiller, puits, sommeil, horloge


# -- chemin nominal --------------------------------------------------------


def test_chaque_instrument_est_demande_et_ingere() -> None:
    port = FauxPort()
    b, puits, _, _ = monter(port, universe=(SPEC_A, SPEC_B, SPEC_C))
    stats = asyncio.run(b.run())
    assert [a[0] for a in port.appels] == [1001, 1002, 1003]
    assert stats.requested == 3
    assert stats.ingested == 3
    assert len(puits.lots) == 3


def test_les_parametres_de_barres_sont_transmis() -> None:
    port = FauxPort()
    b, _, _, _ = monter(port)
    asyncio.run(b.run())
    assert port.appels[0][1:] == ("1 Y", "1 day")


def test_un_doublon_n_est_pas_compte_comme_insere() -> None:
    """Relancer un remplissage interrompu ne doit rien dupliquer."""
    port = FauxPort()
    horloge = Horloge()
    b = HistoryBackfiller(
        port=port,
        universe=(SPEC_A,),
        sink=PuitsEnregistreur(duplicates=1),
        pacer=SlidingWindowPacer(clock=horloge),
        sleep=SommeilEnregistreur(horloge),
    )
    stats = asyncio.run(b.run())
    assert stats.ingested == 0
    assert stats.duplicates == 1


# -- pacing ----------------------------------------------------------------


def test_la_fenetre_pleine_declenche_une_attente_exacte() -> None:
    """Quand la fenêtre est saturée, on ATTEND — on ne force jamais le passage."""
    port = FauxPort()
    b, _, sommeil, _ = monter(
        port, universe=(SPEC_A, SPEC_B), window_max=1, window=100.0
    )
    stats = asyncio.run(b.run())
    assert stats.requested == 2
    assert stats.deferred == 1
    # Le premier a consommé le seul slot à t=0 ; le second attend 100 s.
    assert sommeil.delais == [pytest.approx(100.0)]
    assert stats.waited_seconds == pytest.approx(100.0)


def test_le_delai_entre_requetes_identiques_est_respecte() -> None:
    port = FauxPort()
    b, _, sommeil, _ = monter(
        port, universe=(SPEC_A, SPEC_A), window_max=60, cooldown=15.0
    )
    stats = asyncio.run(b.run())
    assert stats.requested == 2
    assert sommeil.delais == [pytest.approx(15.0)]


def test_la_cle_distingue_granularite_et_nature() -> None:
    """Deux barres différentes du même contrat ne sont pas identiques pour IBKR."""
    port = FauxPort()
    b, _, _, _ = monter(port)
    autre = HistoryBackfiller(
        port=port,
        universe=(SPEC_A,),
        sink=PuitsEnregistreur(),
        pacer=SlidingWindowPacer(clock=Horloge()),
        sleep=SommeilEnregistreur(Horloge()),
        bar_size="1 hour",
    )
    assert b.request_key(SPEC_A) != autre.request_key(SPEC_A)


# -- bornes et arrêt -------------------------------------------------------


def test_max_requests_borne_l_execution() -> None:
    port = FauxPort()
    b, _, _, _ = monter(port, universe=(SPEC_A, SPEC_B, SPEC_C), max_requests=2)
    stats = asyncio.run(b.run())
    assert stats.requested == 2
    assert len(port.appels) == 2


def test_request_stop_interrompt_avant_toute_requete() -> None:
    port = FauxPort()
    b, _, _, _ = monter(port, universe=(SPEC_A, SPEC_B))
    b.request_stop()
    stats = asyncio.run(b.run())
    assert stats.requested == 0
    assert port.appels == []


# -- erreurs : jamais converties en absence de donnée ----------------------


def test_une_erreur_fournisseur_saute_l_instrument_sans_mentir() -> None:
    port = FauxPort(barres={1001: ProviderError(162, "pacing violation")})
    b, puits, _, _ = monter(port, universe=(SPEC_A, SPEC_B))
    stats = asyncio.run(b.run())
    assert stats.provider_errors == 1
    assert stats.ingested == 1  # SPEC_B a bien été traité
    assert len(puits.lots) == 1


def test_une_NOTICE_fournisseur_n_est_pas_comptee_comme_une_erreur() -> None:
    """2104 « Market data farm connection is OK » n'est pas une panne."""
    port = FauxPort(barres={1001: ProviderError(2104, "market data farm OK")})
    b, _, _, _ = monter(port, universe=(SPEC_A,))
    stats = asyncio.run(b.run())
    assert stats.notices == 1
    assert stats.provider_errors == 0


def test_une_erreur_de_transport_est_comptee_a_part() -> None:
    port = FauxPort(barres={1001: EdgeIbkrError("EOF")})
    b, _, _, _ = monter(port, universe=(SPEC_A,))
    stats = asyncio.run(b.run())
    assert stats.transport_errors == 1
    assert stats.ingested == 0


# -- refus de configuration ------------------------------------------------


@pytest.mark.parametrize(
    ("kwargs", "motif"),
    [
        ({"universe": ()}, "univers vide"),
        ({"duration": ""}, "duration"),
        ({"bar_size": ""}, "bar_size"),
        ({"max_requests": 0}, "max_requests"),
    ],
)
def test_configuration_invalide_est_refusee(kwargs: dict[str, Any], motif: str) -> None:
    horloge = Horloge()
    base: dict[str, Any] = {
        "port": FauxPort(),
        "universe": (SPEC_A,),
        "sink": PuitsEnregistreur(),
        "pacer": SlidingWindowPacer(clock=horloge),
        "sleep": SommeilEnregistreur(horloge),
    }
    base.update(kwargs)
    with pytest.raises(ValueError, match=motif):
        HistoryBackfiller(**base)


# -- l'ordre de grandeur annoncé -------------------------------------------


def test_mille_titres_prennent_bien_environ_deux_heures_cinquante() -> None:
    """Le chiffre annoncé à l'utilisateur doit être celui que le code produit."""
    port = FauxPort()
    univers = tuple(
        ContractSpec(sec_type="STK", con_id=2000 + i, symbol=f"S{i}", exchange="SMART")
        for i in range(1000)
    )
    horloge = Horloge()
    sommeil = SommeilEnregistreur(horloge)
    b = HistoryBackfiller(
        port=port,
        universe=univers,
        sink=PuitsEnregistreur(),
        pacer=SlidingWindowPacer(max_requests=60, window_seconds=600.0, clock=horloge),
        sleep=sommeil,
    )
    stats = asyncio.run(b.run())
    assert stats.requested == 1000
    heures = horloge.maintenant / 3600.0
    # 60 immédiates, puis 6/min : ~2 h 37 simulées. On vérifie l'ordre de
    # grandeur annoncé, pas une valeur au centième.
    assert 2.4 <= heures <= 3.0, f"{heures:.2f} h"


# -- identite des enveloppes brutes ----------------------------------------


def _barres_de(con_id: int, *jours: str) -> BarsPayload:
    """Charge de barres SYNTHETIQUE : aucune observation de marche reelle."""
    return BarsPayload(
        con_id=con_id,
        bar_size="1 day",
        what_to_show="TRADES",
        use_rth=True,
        bars=tuple(
            BarObservation(
                time=datetime.fromisoformat(jour).replace(tzinfo=UTC),
                open=Decimal("100.10"),
                high=Decimal("103.40"),
                low=Decimal("99.80"),
                close=Decimal("102.25"),
                volume=Decimal("12000.0"),
                average=Decimal("101.875"),
                bar_count=240,
            )
            for jour in jours
        ),
    )


def test_deux_passes_ecrivent_la_meme_identite_brute() -> None:
    """La MEME fenetre relue ne s'ecrit qu'une fois.

    Mesure du 2026-09-06 sur la base reelle : 969 lignes `ibkr.bars/1` pour
    59 contenus distincts. Le puits est idempotent SUR `event_id`, et
    l'adaptateur tirait un `uuid4` par enveloppe : chaque passe reecrivait le
    meme historique sous une identite neuve. Les deux enveloppes DERIVEES
    avaient deja une identite stable ; celle-ci l'a maintenant aussi.
    """
    charge = _barres_de(1001, "2025-08-28", "2025-08-29")
    port = FauxPort({1001: make_envelope(charge, con_id=1001)})

    b1, puits1, _, _ = monter(port)
    asyncio.run(b1.run())
    b2, puits2, _, _ = monter(port)
    asyncio.run(b2.run())

    brute1 = puits1.lots[0][0]
    brute2 = puits2.lots[0][0]
    assert brute1.event_id == brute2.event_id
    assert brute1.event_id == "ibkr:bars:1001:1 day:TRADES:rth:2025-08-28:2025-08-29"


def test_une_fenetre_differente_reste_une_observation_differente() -> None:
    """Deux demandes distinctes ne se confondent jamais."""
    port_a = FauxPort({1001: make_envelope(_barres_de(1001, "2025-08-28"), con_id=1001)})
    port_b = FauxPort({1001: make_envelope(_barres_de(1001, "2025-08-29"), con_id=1001)})
    b1, puits1, _, _ = monter(port_a)
    asyncio.run(b1.run())
    b2, puits2, _, _ = monter(port_b)
    asyncio.run(b2.run())
    assert puits1.lots[0][0].event_id != puits2.lots[0][0].event_id


def test_une_reponse_vide_garde_son_identite_ponctuelle() -> None:
    """Ne rien recevoir EST une observation datee : deux silences different.

    Sans barre, aucune fenetre n'existe — fabriquer une identite stable
    ferait passer deux tentatives distinctes pour la meme observation.
    """
    vide = _barres_de(1001)
    port = FauxPort({1001: make_envelope(vide, con_id=1001)})
    b1, puits1, _, _ = monter(port)
    asyncio.run(b1.run())
    assert not puits1.lots[0][0].event_id.startswith("ibkr:bars:")
