import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { pageStateOf, queryKeyForResource } from '../../api/hooks.ts';
import { usePortfolio } from '../../api/portfolioApi.ts';
import type { PageDataState } from '../../api/hooks.ts';
import type { PortfolioResponse } from '../../api/client.ts';
import { AiExplanationPanel } from '../../components/ai/AiExplanationPanel.tsx';
import type { AiDossier } from '../../components/ai/AiExplanationPanel.tsx';
import { AuthRequiredNotice } from '../../components/AuthRequiredNotice.tsx';
import { Card } from '../../components/Card.tsx';
import { DataStateBoundary } from '../../components/DataStateBoundary.tsx';
import type { DataState } from '../../components/DataStateBoundary.tsx';
import type { ModuleState } from '../../components/moduleState.ts';
import { SyntheticBanner } from '../../components/SyntheticBanner.tsx';
import { ModuleCell as SharedModuleCell } from '../../components/widgets/ModuleCell.tsx';
import type { ModuleDensity } from '../../components/widgets/ModuleCell.tsx';
import { StatusChip } from '../../components/widgets/StatusChip.tsx';
import { Widget } from '../../components/widgets/Widget.tsx';
import { ConcentrationPanel } from './ConcentrationPanel.tsx';
import { CsvImportPanel } from './CsvImportPanel.tsx';
import { LedgerPanel } from './LedgerPanel.tsx';
import { PositionInspector, ValuationInspector } from './PortfolioInspector.tsx';
import {
  AbsentPortfolioModule,
  CurrencyExposureModule,
  DividendsModule,
  PositionsModule,
  TotalPerformanceModule,
  ValuationAbsence,
} from './PortfolioModules.tsx';
import { PortfolioSummary } from './PortfolioSummary.tsx';
import { PerformanceSection } from './performance/PerformanceSection.tsx';
import { TransactionForm } from './TransactionForm.tsx';
import { portfolioModule } from './portfolioModules.ts';
import { valuationContentOf } from './portfolioView.ts';
import type { ExcludedLotRow, ValuationContentView } from './portfolioView.ts';

/**
 * Page Portefeuille (`TL / 07`) — question : « Quelles expositions et
 * concentrations résultent de mon ledger manuel ? »
 *
 * Le journal manuel est la SEULE source de positions — aucun compte courtier,
 * jamais. La valorisation affichée est le snapshot publié par le worker,
 * relayé verbatim : marques SYNTHÉTIQUES étiquetées, lots exclus listés à
 * part avec raison, totaux serveur uniquement. L'interface enregistre des
 * FAITS PASSÉS et n'émet aucune instruction.
 *
 * LOT-A6 — LA PLANCHE §7 EN ENTIER. `pages-07-08-portfolio-charts.png`
 * (moitié gauche) compose dix-huit modules. Dix sont SERVIS : la valorisation
 * publiée, la performance totale (TWR, XIRR), le module Performance entier
 * (absorbé au LOT-08, inchangé), la concentration par ticker en DOMINANTE
 * (elle répond à la question de la page — `REFONTE_TITANIUM_LEDGER.md` §4),
 * l'exposition par devise, les lots valorisés et exclus, les dividendes
 * déclarés au journal, le journal, la déclaration d'un fait passé et l'import
 * CSV contrôlé. Huit n'ont ni source ni contrat : performance du jour,
 * espèces, benchmark, allocation, expositions par secteur et par pays,
 * alertes de concentration, attribution — ils tiennent leur place avec le
 * motif mesuré de leur absence. Rien n'est sommé ni converti côté client.
 *
 * REFONTE UI 2026-09-05 — ORDRE DE LECTURE (même motif qu'Options). La
 * planche se lit SIGNAL (valorisation, performance totale, devises) →
 * CONCENTRATION (la dominante, à côté des dividendes) → LOTS → PERFORMANCE
 * → JOURNAL / SAISIE → absences regroupées. Le DOM suit cet ordre ; la
 * composition vit dans `.vx-pf-grid` (`widgets.css`). Chaque cellule nue
 * passe par `ModuleCell` et pose `data-size` depuis le catalogue ; les cartes
 * d'une valeur et les absences portent `data-density="compact"`. Les pieds ne
 * répètent plus la nature des marques : elle vient du bandeau et de
 * l'inspecteur, une seule fois chacun. Catalogue, titres et testids inchangés.
 *
 * L'INSPECTEUR MONTRE LE LOT OUVERT depuis la table — provenance manuelle,
 * poids publié, faits du journal et corrections, catalyseurs — sinon la
 * vérité du snapshot de valorisation.
 */

/** La cellule d'un module de CETTE planche : la taille vient du catalogue. */
function ModuleCell({
  id,
  density,
  children,
}: {
  readonly id: string;
  readonly density?: ModuleDensity;
  readonly children: ReactNode;
}) {
  return (
    <SharedModuleCell id={id} size={portfolioModule(id).size} {...(density === undefined ? {} : { density })}>
      {children}
    </SharedModuleCell>
  );
}

/** État du CADRE de valorisation (les modules dérivés du snapshot). */
export function valuationFrameStateOf(
  queryState: PageDataState,
  data: PortfolioResponse | undefined,
): { readonly state: DataState | 'auth-required'; readonly view: ValuationContentView | null } {
  if (queryState !== 'ready' && queryState !== 'refreshing') {
    return { state: queryState, view: null };
  }
  if (data === undefined) {
    return { state: 'error', view: null };
  }
  if (data.valuation.state === 'empty') {
    return { state: 'empty', view: null };
  }
  const view = valuationContentOf(data.valuation);
  if (view === null) {
    return { state: 'error', view: null };
  }
  // Le relais publie l'âge de l'instantané et bascule en `stale` au-delà
  // du budget de fraîcheur du registre. Le contenu reste VISIBLE sous un
  // bandeau « Données périmées » : ce qui était interdit, c'est de le
  // servir sans dire son âge, pas de le servir. Testé AVANT `partial` :
  // un instantané périmé l'est en entier, la partialité de son contenu
  // est la moins forte des deux affirmations.
  if (data.valuation.state === 'stale') {
    return { state: 'stale', view };
  }
  // Dégradation honnête signalée PAR LE SERVEUR : marques absentes ou lots
  // exclus → cadre « partiel » (le contenu daté reste visible sous bandeau).
  if (view.marks.status !== 'OK' || view.excludedLots.length > 0 || view.coverage.invalidPositions.length > 0) {
    return { state: 'partial', view };
  }
  return { state: queryState, view };
}

function ConcentrationModule({
  view,
  state,
  reason,
}: {
  readonly view: ValuationContentView | null;
  readonly state: ModuleState;
  readonly reason: string | null;
}) {
  const module = portfolioModule('concentration');
  return (
    <Widget
      id="concentration"
      size={module.size}
      rank="dominant"
      className="vx-pf-concentration"
      kicker="Calculé"
      title={module.title}
      titleId="vx-pf-concentration-title"
      state={state}
      {...(reason === null ? {} : { stateDetail: reason })}
      action={view === null ? undefined : <StatusChip label={`${view.blocks.length} devise(s) publiée(s)`} tone="neutral" />}
      footer={<>poids et Herfindahl publiés par le worker</>}
    >
      {view === null ? <ValuationAbsence state={state} reason={reason} /> : <ConcentrationPanel blocks={view.blocks} />}
    </Widget>
  );
}

function PortfolioBoard({
  data,
  frame,
  onWrite,
}: {
  readonly data: PortfolioResponse;
  readonly frame: ReturnType<typeof valuationFrameStateOf>;
  readonly onWrite: () => void;
}) {
  const [selectedLot, setSelectedLot] = useState<string | null>(null);
  const view = frame.view;
  const moduleState: ModuleState = frame.state;
  const reason = data.valuation.reason;
  const excludedRows: readonly ExcludedLotRow[] = useMemo(
    () => (view === null ? [] : [...view.excludedLots, ...view.coverage.invalidPositions]),
    [view],
  );
  const lot = useMemo(
    () => (view === null || selectedLot === null ? null : (view.valuedLots.find((candidate) => candidate.lotId === selectedLot) ?? null)),
    [view, selectedLot],
  );

  const portfolioKey = String(data.portfolio.id);
  const dossiersExplicables: readonly AiDossier[] = [
    { kind: 'portfolio_valuation', key: portfolioKey },
    { kind: 'performance', key: portfolioKey },
  ];

  return (
    <>
      {frame.state === 'stale' || frame.state === 'partial' ? (
        <DataStateBoundary
          state={frame.state}
          {...(frame.state === 'partial'
            ? {
                detail:
                  'Couverture incomplète signalée par le serveur : lots exclus ou marques indisponibles — voir « Lots ouverts valorisés ».',
              }
            : {})}
          {...(view?.asOf !== null && view?.asOf !== undefined ? { asOfLabel: view.asOf } : {})}
        />
      ) : null}

      <div className="vx-pf-grid vx-board" data-testid="portfolio-grid">
        {/* Rangée de SIGNAL : la valorisation, la performance totale et les
            devises — ce que vaut le registre, avant comment il est réparti. */}
        <ModuleCell id="value">
          {view === null ? (
            <Card rank="quiet" kicker="Publié" title={portfolioModule('value').title} titleId="vx-pf-summary-title" className="vx-pf-value">
              <ValuationAbsence state={moduleState} reason={reason} withReason />
            </Card>
          ) : (
            <PortfolioSummary valuation={view} />
          )}
        </ModuleCell>
        <ModuleCell id="total-performance" density="compact">
          <TotalPerformanceModule portfolioId={data.portfolio.id} />
        </ModuleCell>
        <ModuleCell id="currency-exposure" density="compact">
          <CurrencyExposureModule view={view} state={moduleState} reason={reason} />
        </ModuleCell>

        {/* La DOMINANTE, à côté des dividendes déclarés (module rendu par
            `Widget` : il pose lui-même sa cellule et sa densité). */}
        <ConcentrationModule view={view} state={moduleState} reason={reason} />
        <DividendsModule transactions={data.transactions} />

        {/* Les LOTS, puis la PERFORMANCE, chacun sur sa rangée. */}
        <ModuleCell id="positions">
          <PositionsModule
            view={view}
            state={moduleState}
            reason={reason}
            excluded={excludedRows}
            selected={selectedLot}
            onInspect={(lotId) => {
              setSelectedLot((previous) => (previous === lotId ? null : lotId));
            }}
          />
        </ModuleCell>
        <ModuleCell id="performance">
          <PerformanceSection />
        </ModuleCell>

        {/* JOURNAL et SAISIE : les faits déclarés, puis les deux façons d'en
            déclarer un nouveau. */}
        <ModuleCell id="ledger">
          <LedgerPanel transactions={data.transactions} onCompensated={onWrite} />
        </ModuleCell>
        <ModuleCell id="record-transaction">
          <TransactionForm onRecorded={onWrite} />
        </ModuleCell>
        <ModuleCell id="csv-import">
          <CsvImportPanel onImported={onWrite} />
        </ModuleCell>

        {/* Les absences, regroupées : leur régularité est le message. */}
        <AbsentPortfolioModule id="day-performance" />
        <AbsentPortfolioModule id="cash" />
        <AbsentPortfolioModule id="benchmark" />
        <AbsentPortfolioModule id="allocation" />
        <AbsentPortfolioModule id="sector-exposure" />
        <AbsentPortfolioModule id="country-exposure" />
        <AbsentPortfolioModule id="concentration-alerts" />
        <AbsentPortfolioModule id="attribution" />
      </div>

      {/*
        LOT-12 : l'explication IA vit dans l'inspecteur et porte sur le
        dossier OUVERT. Cette page en affiche deux — la valorisation et la
        performance du même registre manuel — donc elle en propose deux, et
        rien d'autre.
      */}
      <AiExplanationPanel dossiers={dossiersExplicables} />

      {lot === null || view === null ? (
        <ValuationInspector data={data} view={view} />
      ) : (
        <PositionInspector
          lot={lot}
          view={view}
          transactions={data.transactions}
          onClose={() => {
            setSelectedLot(null);
          }}
        />
      )}
    </>
  );
}

export function PortfolioPage() {
  const query = usePortfolio();
  const queryClient = useQueryClient();
  const queryState = pageStateOf(query);
  const data = query.data;
  const frame = valuationFrameStateOf(queryState, data);

  // Refetch explicite après une écriture acceptée : le signal SSE couvre la
  // valorisation (publication du worker), l'invalidation locale couvre le
  // journal immédiatement (la réponse GET porte les deux).
  function refetchPortfolio(): void {
    void queryClient.invalidateQueries({ queryKey: queryKeyForResource('portfolio_valuation/any') });
  }

  return (
    <article className="vx-page" aria-labelledby="vx-page-title-portfolio">
      <div className="vx-page-header">
        <h1 id="vx-page-title-portfolio">Portefeuille</h1>
        <p className="vx-page-question">
          Quelles expositions et concentrations résultent de mon ledger manuel ?
        </p>
      </div>

      <p className="vx-pf-scope" role="note">
        Journal manuel uniquement : les positions dérivent des faits que VOUS avez déclarés après
        coup. Aucun compte, position ou P&amp;L de courtier n'est lu — cette capacité n'existe pas.
      </p>

      {queryState === 'auth-required' ? (
        <AuthRequiredNotice />
      ) : queryState === 'loading' || queryState === 'offline' || queryState === 'error' ? (
        <DataStateBoundary
          state={queryState}
          {...(queryState === 'offline'
            ? { detail: "L'API locale est injoignable — aucun journal ni valorisation affiché." }
            : queryState === 'error'
              ? { detail: "Réponse invalide ou inattendue de l'API — rien n'est affiché à la place." }
              : {})}
        />
      ) : data === undefined ? (
        <DataStateBoundary state="error" detail="Réponse absente — rien n'est affiché à la place." />
      ) : (
        <>
          {/*
            LE BANDEAU NE PARLE QUE S'IL A QUELQUE CHOSE À DIRE. Avec un
            portefeuille vide, `markPopulation` est absent : on passait `null`,
            et `SyntheticBanner` criait « NATURE NON DÉCLARÉE » en rouge — une
            alerte sur une valorisation qui n'existe pas, alors que chaque
            carte dit déjà proprement son absence. Les quatre autres pages qui
            traitent ce cas ne rendent le bandeau que sur une vue présente.
          */}
          {frame.view?.markPopulation == null ? null : (
            <SyntheticBanner population={frame.view.markPopulation} />
          )}
          <PortfolioBoard data={data} frame={frame} onWrite={refetchPortfolio} />
        </>
      )}
    </article>
  );
}
