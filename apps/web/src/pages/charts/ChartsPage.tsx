import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { AnalysisResponse } from '../../api/client.ts';
import { pageStateOf, useAnalysis } from '../../api/hooks.ts';
import { AbsentModule } from '../../components/AbsentModule.tsx';
import { AuthRequiredNotice } from '../../components/AuthRequiredNotice.tsx';
import { DataStateBoundary } from '../../components/DataStateBoundary.tsx';
import type { DataState } from '../../components/DataStateBoundary.tsx';
import { SyntheticBanner } from '../../components/SyntheticBanner.tsx';
import { InspectorPanel } from '../../shell/inspector.tsx';
import { IndicatorsPanel, OhlcvTable } from '../analysis/AnalysisPage.tsx';
import { CandleChart } from '../analysis/CandleChart.tsx';
import type { BarsView } from '../analysis/analysisView.ts';
import { analysisStateOf, barsViewOf } from '../analysis/analysisView.ts';
import { PeriodTabs } from '../../components/widgets/PeriodTabs.tsx';
import type { PeriodOption } from '../../components/widgets/PeriodTabs.tsx';
import { ModuleCell } from '../../components/widgets/ModuleCell.tsx';
import { Widget } from '../../components/widgets/Widget.tsx';
import {
  ComparisonModule,
  MacdModule,
  OverlaysModule,
  RsiModule,
  VolumeModule,
} from './ChartsModules.tsx';
import { useDeclaredInstruments } from '../devUniverse.ts';
import { absentModules, chartsModule, comparisonViewOf } from './chartsView.ts';
import { pageAccentAttrs } from '../../components/widgets/pageAccent.ts';
import { MethodNote } from '../../components/widgets/MethodNote.tsx';
import type { ModuleState } from '../../components/moduleState.ts';
import { publishedOr } from '../../components/inspector/SnapshotFacts.tsx';

/**
 * Page Graphiques (`TL / 08`) — question : « Quelles relations puis-je
 * explorer sans perdre méthode et contexte ? » (`references/pages.md` §8).
 *
 * LOT-A2, 2026-09-02. La planche `pages-07-08-portfolio-charts.png` (moitié
 * droite) montre douze modules. Trois sont SERVIS par le contrat Analyse
 * (`GET /api/v1/analysis/{instrument}`) : l'espace graphique, son volume et
 * les indicateurs publiés par le moteur serveur. Les neuf autres n'ont AUCUNE
 * source dans ce dépôt ; ils sont rendus à leur place, à leur géométrie, avec
 * le motif exact de leur absence (`AbsentModule`, vocabulaire fermé) — jamais
 * une valeur, jamais un rectangle muet, jamais une promesse (article 17).
 *
 * UN SEUL PROPRIÉTAIRE DE DONNÉE. Cette page lit le MÊME DTO, par le MÊME
 * client, et le rend par le MÊME composant (`CandleChart`) que `/analysis`.
 * Le propriétaire est le contrat ; la page ne recalcule rien : aucun overlay,
 * aucun indicateur, aucun rebasage, aucune comparaison côté navigateur
 * (`.claude/rules/frontend.md`). LOT-S2 : la comparaison base 100 est
 * désormais SERVIE — le worker rebase les deux séries et intersecte leurs
 * calendriers, la page affiche ce qu'il publie. Ce que `/analysis` porte en
 * propre — verdict,
 * gates, preuves, scénarios, explication — n'est PAS repris ici : ce n'est pas
 * la question de cette page.
 */

function ChartsInstrumentPicker({ current }: { readonly current: string | null }) {
  const instruments = useDeclaredInstruments();
  if (instruments.length === 0) {
    return (
      <nav className="vx-underlying-picker" aria-label="Instruments disponibles">
        <span className="vx-underlying-picker-label">Instrument :</span>
        <span className="vx-underlying-empty">
          Aucun instrument publié — la page Marchés n&apos;en couvre encore aucun.
        </span>
      </nav>
    );
  }
  return (
    <nav className="vx-underlying-picker" aria-label="Instruments disponibles">
      <span className="vx-underlying-picker-label">Instrument :</span>
      {instruments.map((candidate) => (
        <Link
          key={candidate}
          to={`/charts/${candidate}`}
          className="vx-underlying-link"
          aria-current={candidate === current ? 'page' : undefined}
        >
          {candidate}
        </Link>
      ))}
    </nav>
  );
}

/**
 * FENÊTRES D'AFFICHAGE de la série servie — un choix de VUE, jamais un
 * fenêtrage de calcul.
 *
 * Chaque fenêtre découpe les barres DÉJÀ publiées ; une fenêtre plus large que
 * la série servie est DÉSACTIVÉE avec son motif visible, jamais masquée et
 * jamais complétée. Le compte de référence est `bars.count` SERVI, pas la
 * longueur du tableau que la page a reçu.
 */
const WINDOWS: readonly { readonly key: string; readonly label: string; readonly sessions: number | null }[] = [
  { key: 'w20', label: '20 séances', sessions: 20 },
  { key: 'w60', label: '60 séances', sessions: 60 },
  { key: 'w120', label: '120 séances', sessions: 120 },
  { key: 'all', label: 'Tout le servi', sessions: null },
];

function windowOptions(count: number): readonly PeriodOption[] {
  return WINDOWS.map((fenetre): PeriodOption => {
    if (fenetre.sessions === null || fenetre.sessions <= count) {
      return { key: fenetre.key, label: fenetre.label, available: true };
    }
    return {
      key: fenetre.key,
      label: fenetre.label,
      available: false,
      reason: `${count} barres servies seulement`,
    };
  });
}


function ChartsFrame({
  data,
  bars,
  state,
  instrument,
  window: fenetre,
  onWindow,
}: {
  readonly data: AnalysisResponse;
  readonly bars: BarsView | null;
  readonly state: DataState;
  readonly instrument: string;
  readonly window: string;
  readonly onWindow: (key: string) => void;
}) {
  const currency = bars?.currency ?? 'devise non publiée';
  const asOf = data.as_of ?? null;
  const mainModule = chartsModule('main-chart');
  const detail =
    state === 'stale'
      ? /*
           NE PAS IMPUTER AU RELAIS CE QUE LE WORKER A DÉCLARÉ. Cette page
           écrivait « périmé par le relais » dans TOUS les cas de péremption,
           avec l'âge du DOSSIER. Or le cas courant est l'autre : le worker
           publie la série comme non fraîche (`fresh = false`) alors que le
           dossier, lui, est frais. Mesuré le 2026-09-06 : dossier 4 h, série
           2 j 11 h. Analyse distingue déjà les deux ; Graphiques le fait
           maintenant aussi, en nommant le propriétaire de chaque nombre.
        */
        data.state === 'stale'
        ? `Snapshot publié périmé par le relais (âge publié ${publishedOr(data.age_seconds)} s) : la série reste affichée, mais ne décrit pas le marché à cet instant.`
        : `Le worker a publié la série comme non fraîche (fresh = false) ; âge publié de la série ${publishedOr(bars?.ageSeconds ?? null)} s (âge du dossier ${publishedOr(data.age_seconds)} s).`
      : state === 'partial'
        ? 'Série publiée avec des barres écartées par le worker : la couverture ci-dessus dit lesquelles.'
        : state === 'delayed'
          ? 'Population DELAYED publiée par le worker : la série est conservée, mais ne décrit pas le marché à cet instant.'
          : undefined;

  // DÉCOUPE DE VUE. `slice` ne produit aucune valeur : elle choisit combien de
  // barres SERVIES sont dessinées. La description dit toujours le compte
  // publié ET le compte affiché — sans quoi la figure prétendrait montrer
  // toute la série.
  const sessions = WINDOWS.find((option) => option.key === fenetre)?.sessions ?? null;
  const toutes = bars === null ? [] : bars.bars;
  const affichees = sessions === null ? toutes : toutes.slice(-sessions);

  const description =
    bars !== null && bars.status === 'OK'
      ? `${publishedOr(bars.count ?? bars.bars.length)} barres journalières publiées de ${publishedOr(bars.firstTradingDay)} à ${publishedOr(bars.lastTradingDay)}, dont ${affichees.length} affichées ; dernière clôture ${publishedOr(bars.lastClose)} ${currency}.`
      : 'Aucune série de barres exploitable publiée.';

  return (
    <section
      className="vx-chartframe"
      data-rank="dominant"
      data-module="main-chart"
      /*
        REFONTE UI 2026-09-05 — la section EST la cellule du module (même
        motif que `MarketsFrame` et `ChainFrame`) : elle porte le span du
        catalogue, sans quoi `align-self: stretch` (réservé aux porteurs de
        `data-size`) ne s'appliquait jamais à la dominante. Aucun parent de
        plus : les tests lisent `data-module` SUR l'élément dominant.
      */
      data-size={mainModule.size}
      aria-labelledby="vx-charts-title"
    >
      <header className="vx-chartframe-head">
        <p className="vx-chartframe-question">
          Quelles relations puis-je explorer sans perdre méthode et contexte ?
        </p>
        <h2 id="vx-charts-title">Graphiques — {instrument}</h2>
      </header>

      <dl className="vx-chartframe-meta">
        <div>
          <dt>Unité</dt>
          <dd>prix OHLC en {currency} ; volume en titres (entiers serveur)</dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>UTC (stockage) — jours de bourse affichés tels que publiés</dd>
        </div>
        <div>
          <dt>as_of</dt>
          <dd>{asOf === null ? 'non publié' : <time dateTime={asOf}>{asOf}</time>}</dd>
        </div>
        <div>
          <dt>Couverture</dt>
          {/*
            REFONTE UI 2026-09-05 — la méta du cadre dit ce que la figure
            couvre (compte et bornes). Exclusions et base d'ajustement sont
            la DÉFINITION de la série : elles appartiennent à l'inspecteur,
            qui les portait déjà — les répéter ici faisait deux vérités.
          */}
          <dd>
            {bars === null
              ? 'aucune série publiée'
              : `${publishedOr(bars.count)} barre(s) valides, de ${publishedOr(bars.firstTradingDay)} à ${publishedOr(bars.lastTradingDay)}`}
          </dd>
        </div>
      </dl>

      <SyntheticBanner population={data.population} />

      <PeriodTabs
        options={windowOptions(bars?.count ?? toutes.length)}
        value={fenetre}
        onChange={onWindow}
        legend="Fenêtre d’affichage de la série servie — aucun calcul n’est refait"
      />

      <DataStateBoundary
        state={state}
        {...(detail !== undefined ? { detail } : {})}
        {...(asOf !== null ? { asOfLabel: `as_of ${asOf}` } : {})}
      >
        {bars !== null && affichees.length > 0 ? (
          <>
            <CandleChart bars={affichees} description={description} />
            <OhlcvTable bars={bars} currency={currency} />
          </>
        ) : (
          <p role="status">Aucune barre exploitable à dessiner — rien n&apos;est inventé à la place.</p>
        )}
      </DataStateBoundary>

      <MethodNote
        methode={
          <>
            barres OHLCV validées barre à barre par le worker (une barre invalide est écartée avec
            sa raison, jamais réparée), relayées telles quelles.
          </>
        }
        attribution={
          <>
            Rendu : Lightweight Charts™ —{' '}
            <a href="https://www.tradingview.com/" rel="noopener noreferrer" target="_blank">
              TradingView
            </a>{' '}
            (Apache-2.0, version épinglée), chargé uniquement sur cette route.
          </>
        }
        limites={
          <>
            population <code>{publishedOr(data.population)}</code> déclarée par le worker ; rien
            n&apos;est recalculé dans le navigateur, ce qui n&apos;est pas publié est déclaré absent.
          </>
        }
      />
    </section>
  );
}

/**
 * Inspecteur — la DÉFINITION de la série servie : instrument, unités, source,
 * fraîcheur, version et exclusions (`references/pages.md` §8). Rien d'autre :
 * thèse, verdict et explication appartiennent à `/analysis`.
 */
function SeriesInspector({
  data,
  bars,
  instrument,
}: {
  readonly data: AnalysisResponse;
  readonly bars: BarsView | null;
  readonly instrument: string;
}) {
  return (
    <InspectorPanel subject={instrument}>
      <dl className="vx-inspector-facts" data-testid="charts-series-definition">
        <div>
          <dt>Série</dt>
          <dd>clôtures journalières OHLCV de {instrument}</dd>
        </div>
        <div>
          <dt>Devise</dt>
          <dd>{publishedOr(bars?.currency)}</dd>
        </div>
        <div>
          <dt>Base d&apos;ajustement</dt>
          <dd>{publishedOr(bars?.adjustmentBasis)}</dd>
        </div>
        <div>
          <dt>Qualité publiée</dt>
          <dd>{publishedOr(bars?.quality)}</dd>
        </div>
        <div>
          <dt>Fraîcheur</dt>
          <dd>
            as_of {publishedOr(data.as_of)} · âge publié {publishedOr(data.age_seconds)} s · fresh{' '}
            {bars?.fresh === null || bars?.fresh === undefined ? 'non publié' : String(bars.fresh)}
          </dd>
        </div>
        <div>
          <dt>Référence d&apos;observation</dt>
          <dd>
            <code>{publishedOr(bars?.sourceEventId)}</code>
          </dd>
        </div>
        <div>
          <dt>Snapshot · moteur</dt>
          <dd>
            v{publishedOr(data.snapshot_version)} · <code>{publishedOr(data.engine_version)}</code>
          </dd>
        </div>
        <div>
          <dt>Exclusions</dt>
          <dd>
            {bars === null
              ? 'aucune série publiée'
              : `${bars.discardedCount} barre(s) écartée(s) par le worker, avec raison`}
          </dd>
        </div>
      </dl>
    </InspectorPanel>
  );
}

/**
 * Les modules de la planche sans source : présents, à leur place, motivés.
 *
 * REFONTE UI 2026-09-05 — une absence pèse moins qu'une donnée : la cellule
 * est compacte (chrome resserré, place tenue, motif écrit — article 17).
 */
function AbsentChartsModules() {
  return (
    <>
      {absentModules().map((module) => (
        <ModuleCell key={module.id} id={module.id} size={module.size} density="compact">
          <AbsentModule
            title={module.title}
            question={module.question}
            reason={module.status.reason}
            note={module.status.note}
          />
        </ModuleCell>
      ))}
    </>
  );
}

/** La planche §8 hors instrument : les absences seules, à leur géométrie. */
function AbsentOnlyBoard() {
  return (
    <div className="vx-charts-grid vx-board" data-testid="charts-grid">
      <AbsentChartsModules />
    </div>
  );
}

function ChartsRoute({ instrument }: { readonly instrument: string }) {
  const analysis = useAnalysis(instrument);
  const queryState = pageStateOf(analysis);
  const data = analysis.data;
  /*
    L'ÉTAT SERVI, CALCULÉ UNE FOIS ET PROPAGÉ. Les modules annonçaient
    `state="ready"` en dur : un instantané périmé, différé ou partiel s'y
    affichait comme frais, et seul le bandeau de page disait la vérité — or un
    lecteur qui regarde une carte ne regarde pas le bandeau.
  */
  const state = analysisStateOf(queryState, data);
  /*
    ET IL DOIT PORTER LA FRAÎCHEUR DE LA SÉRIE, PAS SEULEMENT CELLE DE
    L'ENVELOPPE. `moduleStateOf('ready', data)` ne lisait que l'état du relais :
    quand le worker publie la série non fraîche (`bars.fresh === false`) alors
    que le dossier est frais — le cas courant hors séance — les six cartes de
    cette page s'affichaient en « prêt ». `analysisStateOf` lit les deux, et
    c'est déjà lui qui décide de la page. Une seule vérité pour la page et pour
    ses cartes.
  */
  const etatServi: ModuleState = state;
  const bars = useMemo(() => (data === undefined ? null : barsViewOf(data)), [data]);
  const [fenetre, setFenetre] = useState<string>('all');

  return (
    <>
      <ChartsInstrumentPicker current={instrument} />

      {state === 'auth-required' ? (
        <AuthRequiredNotice />
      ) : state === 'empty' ? (
        <DataStateBoundary
          state="empty"
          detail={`Aucun dossier publié pour « ${instrument} » — raison serveur : ${
            data?.reason ?? 'non fournie'
          }. Rien n'est inventé à la place.`}
        />
      ) : state === 'loading' || state === 'offline' || state === 'error' ? (
        <DataStateBoundary
          state={state}
          {...(state === 'offline'
            ? { detail: "L'API locale est injoignable — la série ne peut pas être affichée." }
            : state === 'error'
              ? { detail: "Réponse invalide ou inattendue de l'API — aucune série affichée." }
              : {})}
        />
      ) : data !== undefined ? (
        <>
          {/*
            REFONTE UI 2026-09-05 — ORDRE DE LECTURE (même motif que
            `.vx-options-grid`). Pas de bande de signal : la dominante ouvre
            la page. Le DOM suit les aires de `widgets.css` : cadre → volume,
            overlays, indicateurs → RSI, MACD, comparaison → absences.
          */}
          <div className="vx-charts-grid vx-board" data-testid="charts-grid">
            <ChartsFrame
              key={instrument}
              data={data}
              bars={bars}
              state={state}
              instrument={instrument}
              window={fenetre}
              onWindow={setFenetre}
            />

            <VolumeModule bars={bars} servedState={etatServi} />

            <OverlaysModule indicators={data.indicators} servedState={etatServi} />

            {/* Des mesures ponctuelles, pas une figure : carte compacte. */}
            <Widget
              id="served-indicators"
              size={chartsModule('served-indicators').size}
              kicker="Calculé"
              title={chartsModule('served-indicators').title}
              titleId="vx-charts-indicators-title"
              state={etatServi}
              density="compact"
              footer={<>mesures ponctuelles publiées par le worker, relayées verbatim</>}
            >
              {data.indicators === null || data.indicators === undefined ? (
                <p className="vx-w2-absent" role="status">
                  Aucun indicateur publié par le moteur serveur pour cette série.
                </p>
              ) : (
                <IndicatorsPanel
                  indicators={data.indicators}
                  currency={typeof data.bars?.currency === 'string' ? data.bars.currency : ''}
                />
              )}
            </Widget>

            <RsiModule indicators={data.indicators} servedState={etatServi} />
            <MacdModule indicators={data.indicators} servedState={etatServi} />

            <ComparisonModule
              servedState={etatServi}
              comparison={comparisonViewOf(data.indicators)}
              instrument={instrument}
            />

            <AbsentChartsModules />
          </div>

          <SeriesInspector data={data} bars={bars} instrument={instrument} />
        </>
      ) : null}
    </>
  );
}

export function ChartsPage() {
  const { instrument } = useParams<{ instrument?: string }>();

  return (
    <article className="vx-page" {...pageAccentAttrs('charts')} aria-labelledby="vx-page-title-charts">
      <div className="vx-page-header">
        <h1 id="vx-page-title-charts">Graphiques</h1>
        <p className="vx-page-question">
          Quelles relations puis-je explorer sans perdre méthode et contexte ?
        </p>
      </div>

      {instrument === undefined || instrument === '' ? (
        <>
          <ChartsInstrumentPicker current={null} />
          <DataStateBoundary
            state="empty"
            detail="Aucun instrument sélectionné — en choisir un ci-dessus. Aucun instrument n'est ouvert par défaut."
          />
          <AbsentOnlyBoard />
        </>
      ) : (
        <ChartsRoute instrument={instrument} />
      )}
    </article>
  );
}
