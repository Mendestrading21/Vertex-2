import { Link } from 'react-router-dom';

import type { OptionChainExpiration, OptionChainResponse } from '../../api/client.ts';
import { pageStateOf, useAnalysis, useMarketsOverview } from '../../api/hooks.ts';
import { Card } from '../../components/Card.tsx';
import { FreshnessBadge, policyProps } from '../../components/FreshnessBadge.tsx';
import { Metric } from '../../components/Metric.tsx';
import { ModuleStatus } from '../../components/ModuleStatus.tsx';
import { Sparkline } from '../../components/markets/Sparkline.tsx';
import { flattenTickers, frDecimal } from '../../components/markets/marketsView.ts';
import { moduleShowsContent, moduleStateOf } from '../../components/moduleState.ts';
import { IvSmile } from '../../components/options/IvSmile.tsx';
import { InstrumentTile } from '../../components/widgets/InstrumentTile.tsx';
import { StatusChip } from '../../components/widgets/StatusChip.tsx';
import { analysisStateOf, barsViewOf } from '../analysis/analysisView.ts';
import { optionsModule } from './optionsModules.ts';
import { groupLabelOf, rowBudgetOf, sourceEventIdsOf, spotViewOf } from './optionsView.ts';

/**
 * Les modules SERVIS de la planche §5, hors la dominante (la chaîne). Le
 * snapshot de chaîne est déjà validé par la page (`data`) ; le sous-jacent
 * lit Marchés (variation 1 j) et son dossier d'analyse (série) par les hooks
 * des pages propriétaires, chacun avec son état. Aucun calcul : chaînes
 * serveur, comptes publiés, géométrie des points publiés.
 *
 * REFONTE UI 2026-09-05 — CE QUI A CHANGÉ, ET POURQUOI.
 *
 *   - Le snapshot de chaîne devient une BANDE de synthèse en tête de planche :
 *     six faits lisibles d'un regard (état, âge contre budget, population et
 *     nature, groupes, couverture, budget de lignes), les références et la
 *     version en pied. Mesuré avant : une carte de 547 px, liste verticale de
 *     sept faits, copie de l'inspecteur ; la dominante n'arrivait qu'après.
 *   - Spot, taux et dividende perdent leur « triple étiquette » (kicker +
 *     titre + libellé pour le même mot) : le titre est le libellé, le libellé
 *     reste accessible. Leur pied tient en une ligne.
 *   - Les pieds de figure ne portent plus de doctrine (« jamais fusionnés »,
 *     « aucun point de référence choisi ») : elle vit dans la note de méthode
 *     de la dominante. Le pied dit ce qui qualifie la valeur, rien d'autre.
 */

const SERIES_WINDOW = 60;
const VOLUME_WINDOW = 20;

function assumptionString(data: OptionChainResponse, key: string): string | null {
  const value = data.assumptions?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function assumptionInt(data: OptionChainResponse, key: string): number | null {
  const value = data.assumptions?.[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function nombrePublie(value: number | null, absent: string): string {
  return value === null ? absent : String(value);
}

// ---------------------------------------------------------------------------

export function UnderlyingModule({ underlying }: { readonly underlying: string }) {
  const module = optionsModule('underlying');
  const overview = useMarketsOverview();
  const state = moduleStateOf(pageStateOf(overview), overview.data);
  const entry = flattenTickers(overview.data?.sectors ?? []).find((candidate) => candidate.ticker.ticker === underlying) ?? null;
  if (moduleShowsContent(state) && entry !== null) {
    return <InstrumentTile entry={entry} />;
  }
  return (
    <Card rank="quiet" kicker="Snapshot Marchés" title={module.title} titleId="vx-options-underlying-title">
      <ModuleStatus state={state} raw={state === 'closed' ? overview.data?.state : overview.data?.reason} />
      {moduleShowsContent(state) ? (
        <p className="vx-module-sentence" role="status">
          <code>{underlying}</code> n’est pas couvert par le snapshot Marchés : aucune clôture ni variation à afficher.{' '}
          <Link to={`/analysis/${encodeURIComponent(underlying)}`}>Ouvrir le dossier d’analyse</Link>
        </p>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function UnderlyingSeriesModule({ underlying }: { readonly underlying: string }) {
  const module = optionsModule('underlying-series');
  const query = useAnalysis(underlying);
  const state = analysisStateOf(pageStateOf(query), query.data);
  const data = query.data;
  const bars = data === undefined ? null : barsViewOf(data);
  const shows = state === 'ready' || state === 'refreshing' || state === 'stale' || state === 'delayed' || state === 'partial';
  const lineBars = bars === null ? [] : bars.bars.slice(-SERIES_WINDOW);
  const volumeBars = bars === null ? [] : bars.bars.slice(-VOLUME_WINDOW);
  return (
    <Card
      rank="quiet"
      kicker="Dossier d’analyse"
      title={module.title}
      titleId="vx-options-series-title"
      {...(shows && data !== undefined
        ? {
            aside: <FreshnessBadge
                ageSeconds={data.age_seconds}
                {...policyProps(data.freshness_policy)}
                sourceLabel="dossier"
              />,
            footer: (
              <>
                {lineBars.length} clôtures publiées
                {bars === null || bars.lastClose === null
                  ? ''
                  : ` · dernière ${bars.lastClose} ${bars.currency ?? 'devise non publiée'} (${bars.lastTradingDay ?? 'séance non publiée'})`}{' '}
                · <Link to={`/analysis/${encodeURIComponent(underlying)}`}>voir Analyse</Link>
              </>
            ),
          }
        : {})}
    >
      {shows && bars !== null && lineBars.length > 0 ? (
        <div className="vx-iw-chart vx-options-series-chart" data-testid="options-underlying-series">
          <Sparkline
            closes={lineBars.map((bar) => bar.close)}
            volumes={volumeBars.map((bar) => bar.volume)}
            sign="flat"
            label={`${lineBars.length} clôtures publiées de ${lineBars[0]?.tradingDay ?? ''} à ${lineBars[lineBars.length - 1]?.tradingDay ?? ''}`}
          />
        </div>
      ) : (
        <p className="vx-module-state" role="status" data-state={state === 'ready' || state === 'refreshing' ? 'empty' : state}>
          {state === 'loading'
            ? 'Chargement du dossier…'
            : state === 'empty'
              ? 'Aucun dossier d’analyse publié : aucune série à tracer.'
              : state === 'auth-required'
                ? 'Session requise pour lire le dossier.'
                : state === 'offline'
                  ? 'Dossier injoignable : aucune série à tracer.'
                  : state === 'error'
                    ? 'Réponse invalide : aucune série à tracer.'
                    : 'Dossier publié sans barre exploitable.'}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * LA BANDE DE SYNTHÈSE DU SNAPSHOT.
 *
 * Six faits côte à côte, chacun sous son micro-libellé ; la version, le moteur,
 * l'instant et les références d'observation en pied, en chasse fixe. Le budget
 * de lignes et les références gardent leurs accroches de test : ce sont les
 * deux faits que les parcours e2e lisent sur cette carte.
 */
export function IdentityStripModule({ data }: { readonly data: OptionChainResponse }) {
  const module = optionsModule('identity-strip');
  const budget = rowBudgetOf(data);
  const sourceEventIds = sourceEventIdsOf(data);
  const validGroups = data.expirations.filter((group) => group.quality === 'VALID').length;
  const population = data.population ?? '';
  const nature = data.value_nature ?? '';
  return (
    <Card
      rank="quiet"
      kicker="Snapshot publié"
      title={module.title}
      titleId="vx-options-identity-title"
      footer={
        <span className="vx-chain-snapshot-refs">
          version {data.snapshot_version ?? 'non publiée'} · moteur <code>{data.engine_version ?? 'non publié'}</code> ·
          as_of{' '}
          {data.as_of === null ? (
            <span className="vx-cell-absent">instant non publié</span>
          ) : (
            <time dateTime={data.as_of}>{data.as_of}</time>
          )}{' '}
          · références{' '}
          <span data-testid="chain-source-references">
            {sourceEventIds.length === 0 ? 'aucune référence publiée' : <code>{sourceEventIds.join(' · ')}</code>}
          </span>
        </span>
      }
    >
      <dl className="vx-chain-snapshot-facts vx-options-facts">
        <div>
          <dt>État servi</dt>
          <dd>
            <StatusChip label={data.state} tone={data.state === 'ok' ? 'neutral' : 'warning'} testId="chain-state-chip" />
          </dd>
        </div>
        <div>
          <dt>Âge publié</dt>
          <dd>
            <FreshnessBadge
              ageSeconds={data.age_seconds}
              {...policyProps(data.freshness_policy)}
              sourceLabel="serveur"
            />
          </dd>
        </div>
        <div>
          <dt>Population · nature</dt>
          <dd className="vx-chain-snapshot-chips">
            {population === '' ? (
              <StatusChip label="NATURE NON DÉCLARÉE" tone="warning" />
            ) : (
              <StatusChip label={population} tone="neutral" />
            )}
            {nature === 'THEORETICAL' ? (
              <StatusChip label="THÉORIQUE" tone="option" />
            ) : nature === '' ? (
              <StatusChip label="nature non publiée" tone="neutral" />
            ) : (
              <StatusChip label={nature} tone="neutral" />
            )}
          </dd>
        </div>
        <div>
          <dt>Groupes</dt>
          <dd>
            {data.expirations.length} publié(s) · {validGroups} VALID
          </dd>
        </div>
        <div>
          <dt>Couverture</dt>
          <dd>
            {data.coverage === null
              ? 'couverture non publiée'
              : `${String(data.coverage['groups_published'] ?? 'nombre non publié de')} groupe(s) sur ${String(
                  data.coverage['observations_considered'] ?? 'un nombre non publié d’',
                )} observation(s)`}
          </dd>
        </div>
        <div>
          <dt>Budget de lignes</dt>
          <dd data-testid="chain-row-budget">
            {budget === null
              ? 'budget de lignes non publié'
              : `${budget.publishedRows ?? 'nombre non publié de'} publiée(s) / ${
                  budget.totalRows ?? 'nombre non publié'
                } construite(s), plafond ${budget.maxRows ?? 'non publié'}, ${
                  budget.truncatedRows ?? 'nombre non publié de'
                } tronquée(s)`}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function SpotModule({ data }: { readonly data: OptionChainResponse }) {
  const module = optionsModule('spot');
  const spot = spotViewOf(data);
  return (
    <Card
      rank="quiet"
      title={module.title}
      titleId="vx-options-spot-title"
      footer={
        spot === null || spot.observedAt === null ? (
          'instant d’observation non publié'
        ) : (
          <>
            observé <time dateTime={spot.observedAt}>{spot.observedAt}</time>
          </>
        )
      }
    >
      <Metric
        label="Spot"
        labelHidden
        value={spot === null || spot.value === null ? null : frDecimal(spot.value)}
        {...(spot?.currency === null || spot?.currency === undefined ? {} : { unit: spot.currency })}
        absentLabel="Spot non publié"
        testId="options-spot"
      />
    </Card>
  );
}

export function RateModule({ data }: { readonly data: OptionChainResponse }) {
  const module = optionsModule('rate');
  const rate = assumptionString(data, 'rate');
  const side = assumptionString(data, 'quote_side_for_iv');
  const maxAge = assumptionInt(data, 'max_quote_age_seconds');
  return (
    <Card
      rank="quiet"
      title={module.title}
      titleId="vx-options-rate-title"
      footer={
        <>
          côté <code>{side ?? 'non publié'}</code> · âge admis{' '}
          {maxAge === null ? 'non publié' : `${maxAge} s`}
        </>
      }
    >
      <Metric
        label="Taux annualisé"
        labelHidden
        value={rate === null ? null : frDecimal(rate)}
        note="décimal annualisé"
        testId="options-rate"
      />
    </Card>
  );
}

export function DividendModule({ data }: { readonly data: OptionChainResponse }) {
  const module = optionsModule('dividend');
  const dividend = assumptionString(data, 'dividend_yield');
  return (
    <Card
      rank="quiet"
      title={module.title}
      titleId="vx-options-dividend-title"
      footer="aucun dividende observé n’est collecté"
    >
      <Metric
        label="Rendement de dividende"
        labelHidden
        value={dividend === null ? null : frDecimal(dividend)}
        note="décimal annualisé"
        testId="options-dividend"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function IvSmileModule({ group }: { readonly group: OptionChainExpiration | null }) {
  const module = optionsModule('iv-smile');
  return (
    <Card
      rank="quiet"
      kicker="IV publiées par contrat"
      title={module.title}
      titleId="vx-options-smile-title"
      footer={<>{group === null ? 'aucun groupe affiché' : `groupe ${groupLabelOf(group)}`} · IV théoriques par strike, aucune IV résumée</>}
    >
      {group === null ? (
        <p className="vx-module-sentence" role="status">
          Aucun groupe publié : rien à tracer.
        </p>
      ) : (
        <IvSmile group={group} label={`Sourire d’IV du groupe ${groupLabelOf(group)} : IV THÉORIQUES publiées par strike, calls et puts`} />
      )}
    </Card>
  );
}

export function VolStructureModule({ groups }: { readonly groups: readonly OptionChainExpiration[] }) {
  const module = optionsModule('vol-structure');
  return (
    <Card
      rank="quiet"
      kicker="Petits multiples"
      title={module.title}
      titleId="vx-options-volstructure-title"
      footer={<>{nombrePublie(groups.length, 'aucun')} groupe(s) publié(s) · un sourire par groupe, jamais fusionnés</>}
    >
      {groups.length === 0 ? (
        <p className="vx-module-sentence" role="status">
          Aucun groupe publié.
        </p>
      ) : (
        <ul className="vx-smile-multiples" aria-label="Sourires d’IV par groupe publié" data-testid="options-vol-structure">
          {groups.map((group) => (
            <li key={`${group.expiration}::${group.trading_class}`}>
              <p className="vx-smile-multiple-title">
                <code>{group.expiration}</code> · {group.trading_class} · qualité {group.quality}
              </p>
              <IvSmile compact group={group} label={`Sourire d’IV ${groupLabelOf(group)}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
