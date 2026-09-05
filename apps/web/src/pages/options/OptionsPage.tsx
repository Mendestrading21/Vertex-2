import { useRef, useState } from 'react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useWorkspace } from '../../app/workspace.tsx';

import type { OptionChainContract, OptionChainExpiration, OptionChainResponse } from '../../api/client.ts';
import { pageStateOf, useMarketsOverview, useOptionChain } from '../../api/hooks.ts';
import { AbsentModule } from '../../components/AbsentModule.tsx';
import { AuthRequiredNotice } from '../../components/AuthRequiredNotice.tsx';
import { DataStateBoundary } from '../../components/DataStateBoundary.tsx';
import type { DataState } from '../../components/DataStateBoundary.tsx';
import { ModuleStatus } from '../../components/ModuleStatus.tsx';
import { SyntheticBanner } from '../../components/SyntheticBanner.tsx';
import { moduleStateOf } from '../../components/moduleState.ts';
import { useDeclaredInstruments } from '../devUniverse.ts';
import { ChainSnapshotInspector } from './ChainSnapshotInspector.tsx';
import { OptionChainTable } from './OptionChainTable.tsx';
import { OptionInspector } from './OptionInspector.tsx';
import {
  DividendModule,
  IdentityStripModule,
  IvSmileModule,
  RateModule,
  SpotModule,
  UnderlyingModule,
  UnderlyingSeriesModule,
  VolStructureModule,
} from './OptionsModules.tsx';
import { OPTIONS_MODULES, optionsModule } from './optionsModules.ts';
import {
  chainStateOf,
  chainTransferBlockReasonOf,
  groupCoverageOf,
  groupKeyOf,
  groupLabelOf,
  rowBudgetOf,
  spotViewOf,
} from './optionsView.ts';
import { pageAccentAttrs } from '../../components/widgets/pageAccent.ts';
import { Widget } from '../../components/widgets/Widget.tsx';
import { ModuleCell as SharedModuleCell } from '../../components/widgets/ModuleCell.tsx';
import { MethodNote } from '../../components/widgets/MethodNote.tsx';
import { StatusChip } from '../../components/widgets/StatusChip.tsx';
import { TableSkeleton } from '../../components/widgets/Skeleton.tsx';

/**
 * Page Options (`TL / 05`) — question : « Quels contrats sont réellement
 * exploitables et quels risques portent-ils ? »
 *
 * LOT-A5 — LA PLANCHE §5 EN ENTIER. `pages-05-06-options-simulator.png`
 * (moitié gauche) compose quinze modules autour d'une dominante : la table
 * de chaîne Calls | Strike | Puts du groupe (expiration, trading_class)
 * sélectionné — les groupes ne sont JAMAIS fusionnés. Neuf modules sont
 * SERVIS : le sous-jacent (clôture et variation de Marchés, série du
 * dossier), le snapshot de chaîne (références, couverture, budget), le spot
 * observé, le taux et le dividende SUPPOSÉS par le calcul d'IV, le sourire
 * d'IV du groupe affiché et la structure par échéance (géométrie des IV
 * publiées, calls et puts, aucun point de référence choisi). Six n'ont ni
 * source ni contrat : mouvement attendu, IV de référence, rang d'IV,
 * métriques de stratégie ; le composeur et le profil de payoff vivent sur
 * Simulateur, joints par l'unique action de l'inspecteur.
 *
 * REFONTE UI 2026-09-05 — ORDRE DE LECTURE. La planche se lit désormais
 * résumé → dominante → détail : une bande de synthèse (snapshot, spot, deux
 * hypothèses), la chaîne, puis les figures, la série longue et les absences
 * regroupées. La composition vit dans `.vx-options-grid` (`global.css`) ; le
 * catalogue est inchangé et chaque cellule pose désormais `data-size` (lu par
 * le socle) et, pour les cartes d'une valeur, `data-density="compact"`.
 *
 * L'INSPECTEUR PORTE LE CONTRAT OUVERT (identité, quote, IV et Greeks
 * THÉORIQUES avec leur lignée — LOT-13), sinon la vérité du snapshot.
 * Aucun calcul financier ici : IV, Greeks et statuts arrivent calculés et
 * étiquetés par le worker.
 */

/**
 * Le sélecteur de sous-jacent.
 *
 * DEUX CHOSES QU'IL DIT MAINTENANT ET NE DISAIT PAS.
 *
 *   1. Une panne n'est pas une couverture vide. Quand la vue Marchés est en
 *      chargement, hors ligne ou en erreur, la liste est vide — et le sélecteur
 *      écrivait « la page Marchés n'en couvre encore aucun », une phrase de
 *      COUVERTURE pour un défaut de RÉSEAU. Il rend maintenant l'état du module
 *      (`ModuleStatus`), et ne réserve la phrase de couverture qu'au vide réel.
 *   2. Il se plie. Mesuré : ~24 pilules sur quatre lignes avant la dominante,
 *      la plupart menant à une chaîne vide (aucune route ne publie quels
 *      sous-jacents portent une chaîne — LOT 7). Quand un sous-jacent est
 *      ouvert, la liste passe derrière un `<details>` natif dont le résumé
 *      nomme le courant et le nombre d'autres ; sans sous-jacent, elle reste
 *      dépliée. Rien n'est retiré du document.
 */
function UnderlyingPicker({ current }: { readonly current: string | null }) {
  const instruments = useDeclaredInstruments();
  const overview = useMarketsOverview();
  const state = moduleStateOf(pageStateOf(overview), overview.data);
  const liste = (
    <nav className="vx-underlying-picker" aria-label="Sous-jacents disponibles">
      <span className="vx-underlying-picker-label">Sous-jacent :</span>
      {instruments.length === 0 ? (
        state === 'ready' || state === 'refreshing' ? (
          <span className="vx-underlying-empty">
            Aucun sous-jacent publié — la page Marchés n&apos;en couvre encore aucun.
          </span>
        ) : (
          <ModuleStatus state={state} raw={overview.data?.reason} />
        )
      ) : (
        instruments.map((candidate) => (
          <Link
            key={candidate}
            to={`/options/${candidate}`}
            className="vx-underlying-link"
            aria-current={candidate === current ? 'page' : undefined}
          >
            {candidate}
          </Link>
        ))
      )}
    </nav>
  );
  if (current === null) {
    return liste;
  }
  const autres = instruments.filter((candidate) => candidate !== current).length;
  return (
    <details className="vx-underlying-fold">
      <summary>
        Sous-jacent : <code>{current}</code>
        <span className="vx-underlying-fold-count">
          {autres === 0 ? '· aucun autre publié' : `· ${autres} autre(s) publié(s)`}
        </span>
      </summary>
      {liste}
    </details>
  );
}

/** La cellule d'un module de CETTE planche : la taille vient du catalogue. */
function ModuleCell({
  id,
  density,
  children,
}: {
  readonly id: string;
  readonly density?: 'compact';
  readonly children: ReactNode;
}) {
  return (
    <SharedModuleCell id={id} size={optionsModule(id).size} {...(density === undefined ? {} : { density })}>
      {children}
    </SharedModuleCell>
  );
}

function AbsentOptionsModule({ id }: { readonly id: string }) {
  const module = optionsModule(id);
  if (module.status.kind !== 'absent') {
    throw new Error(`Module ${id} is served, not absent`);
  }
  return (
    // LOT P3b — la taille vient du catalogue : sans elle, une absence prend la
    // taille par défaut et déplace ses voisines dans la planche.
    <ModuleCell id={id} density="compact">
      <AbsentModule title={module.title} question={module.question} reason={module.status.reason} note={module.status.note} />
    </ModuleCell>
  );
}

/**
 * LOT P3b — LA PLANCHE §5 SANS SOUS-JACENT CHOISI.
 *
 * CE QUE LA PAGE FAISAIT. Elle rendait le sélecteur, une seule carte
 * « Aucune donnée », et laissait les deux tiers de l'écran vides. Un lecteur
 * ne pouvait pas savoir ce que cette destination sait faire : la planche
 * n'existait qu'une fois un instrument ouvert.
 *
 * CE QU'ELLE FAIT MAINTENANT. La planche entière tient sa place. Les six
 * modules SANS SOURCE gardent le motif exact de leur absence — inchangé. Les
 * neuf modules SERVIS déclarent l'état `empty` avec sa cause : aucun
 * sous-jacent n'est sélectionné.
 *
 * CE QU'ELLE N'INVENTE PAS. Aucune valeur, aucun exemple, aucun instrument par
 * défaut. `empty` est un état DÉCLARÉ de `ModuleState`, et `Widget` ne rend
 * aucun enfant dans cet état : il n'y a rien à remplir, donc rien n'est
 * rempli.
 *
 * POURQUOI LA PHRASE VIT DANS LE PIED, ET NON DANS `stateDetail`. La capture
 * l'a montré : `stateDetail` est rendu en `<code>` par `ModuleStatus`, parce
 * que c'est le canal des CAUSES SERVEUR — un `reason_code`, un diagnostic
 * verbatim. Y écrire une phrase française la faisait passer en chasse fixe et
 * la faisait lire comme un code du serveur. La prose va au pied ; le canal du
 * serveur reste au serveur.
 */
const SANS_SELECTION = 'Aucun sous-jacent sélectionné — en choisir un ci-dessus.';

function NoUnderlyingBoard() {
  return (
    <div className="vx-options-grid vx-board" data-testid="options-grid">
      {OPTIONS_MODULES.map((module) =>
        module.status.kind === 'absent' ? (
          <AbsentOptionsModule key={module.id} id={module.id} />
        ) : (
          <Widget
            key={module.id}
            id={module.id}
            size={module.size}
            title={module.title}
            state="empty"
            footer={SANS_SELECTION}
          >
            {null}
          </Widget>
        ),
      )}
    </div>
  );
}

interface InspectedContractSelection {
  readonly contract: OptionChainContract;
  readonly groupKey: string;
  readonly snapshot: OptionChainResponse;
}

/** Un compte publié, ou la phrase d'absence accordée à ce qu'il compte. */
function compte(value: number | null, absent: string): string {
  return value === null ? absent : String(value);
}

function ChainFrame({
  data,
  state,
  underlying,
  groups,
  selected,
  onSelectGroup,
  onInspect,
  selectedConId,
}: {
  readonly data: OptionChainResponse;
  readonly state: DataState;
  readonly underlying: string;
  readonly groups: readonly OptionChainExpiration[];
  readonly selected: OptionChainExpiration | null;
  readonly onSelectGroup: (key: string) => void;
  readonly onInspect: (contract: OptionChainContract, trigger: HTMLElement | null) => void;
  /** Contrat inspecté, pour que sa ligne se distingue dans la chaîne. */
  readonly selectedConId: number | null;
}) {
  const budget = rowBudgetOf(data);
  const asOf = data.as_of;
  const degradedGroups = groups.filter((group) => group.quality !== 'VALID');
  const detail =
    state === 'partial'
      ? [
          degradedGroups.length > 0
            ? `${degradedGroups.length} groupe(s) publié(s) avec qualité dégradée (${degradedGroups
                .map((group) => `${groupLabelOf(group)} : ${group.quality}`)
                .join(' ; ')}).`
            : null,
          budget !== null && budget.truncatedRows !== null && budget.truncatedRows > 0
            ? `${budget.truncatedRows} ligne(s) tronquée(s) par le budget publié.`
            : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' ')
      : state === 'stale'
        ? (data.reason ?? 'Le relais a publié ce snapshot comme périmé.')
        : state === 'delayed'
          ? 'La population publiée est DELAYED : ces observations ne décrivent pas le marché à cet instant.'
          : undefined;
  const pendingTrigger = useRef<HTMLElement | null>(null);
  const selectedCoverage = selected === null ? null : groupCoverageOf(selected);

  return (
    <section
      className="vx-chartframe"
      data-rank="dominant"
      data-module="chain"
      data-size="XL"
      aria-labelledby="vx-chain-title"
    >
      {/* La question de la page est déjà en tête de page : la dominante ne la
          répète pas, elle nomme ce qu'elle montre et ce qu'elle garantit. */}
      <header className="vx-chartframe-head vx-chain-head">
        <div className="vx-chain-head-text">
          <h2 id="vx-chain-title">Chaîne d'options — {underlying}</h2>
          <p className="vx-chain-head-note">
            {groups.length} groupe(s) publié(s) · quotes verbatim · IV et Greeks THÉORIQUES du worker ·
            valeur exacte au survol et dans « Détail »
          </p>
        </div>
      </header>

      <SyntheticBanner population={data.population} />

      <DataStateBoundary
        state={state}
        {...(detail !== undefined ? { detail } : {})}
        {...(asOf !== null ? { asOfLabel: `as_of ${asOf}` } : {})}
      >
        <fieldset className="vx-chain-groups">
          <legend>Groupe publié — expiration · trading class (exchange)</legend>
          <div className="vx-chain-group-list" role="group" aria-label="Groupes publiés">
            {groups.map((group) => {
              const key = groupKeyOf(group);
              const coverage = groupCoverageOf(group);
              const active = selected !== null && groupKeyOf(selected) === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  className="vx-chain-group"
                  data-testid="chain-group"
                  onClick={() => {
                    onSelectGroup(key);
                  }}
                >
                  <span className="vx-chain-group-name">{groupLabelOf(group)}</span>
                  {/* Le bouton dit ce qui distingue un groupe d'un autre — sa
                      qualité et ce qu'il livre — et rien de plus ; les autres
                      comptes vont dans la ligne de faits du groupe affiché. */}
                  <span className="vx-chain-group-meta">
                    <StatusChip label={group.quality} tone={group.quality === 'VALID' ? 'neutral' : 'warning'} />
                    <span>
                      {compte(coverage.expected, 'nombre non publié de')} contrats attendus ·{' '}
                      {compte(coverage.ivResolved, 'nombre non publié d’')} IV résolues
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {selected !== null && selectedCoverage !== null ? (
          <>
            <dl className="vx-chartframe-meta vx-chain-group-facts" aria-label="Groupe affiché">
              <div>
                <dt>Groupe affiché</dt>
                <dd>
                  <strong>{groupLabelOf(selected)}</strong>
                </dd>
              </div>
              <div>
                <dt>Style</dt>
                <dd>{selected.style}</dd>
              </div>
              <div>
                <dt>Règlement</dt>
                <dd>{selected.settlement}</dd>
              </div>
              <div>
                <dt>Multiplicateur</dt>
                <dd>
                  <code className="vx-num">{selected.multiplier}</code>
                </dd>
              </div>
              <div>
                <dt>Maturité</dt>
                <dd>
                  <code className="vx-num">{selected.maturity_years}</code> an(s)
                </dd>
              </div>
              <div>
                <dt>Quotes saines</dt>
                <dd>
                  {compte(selectedCoverage.quotesValid, 'nombre non publié')} sur{' '}
                  {compte(selectedCoverage.quotesReceived, 'nombre non publié de')} reçues
                </dd>
              </div>
              <div>
                <dt>Écartés du calcul</dt>
                <dd>{compte(selectedCoverage.discardedCount, 'nombre non publié')}</dd>
              </div>
            </dl>
            <div
              onClickCapture={(event) => {
                // Mémorise le déclencheur pour restituer le focus à la fermeture.
                const target = event.target;
                if (target instanceof HTMLElement && target.closest('.vx-chain-inspect') !== null) {
                  pendingTrigger.current = target;
                }
              }}
            >
              <OptionChainTable
                group={selected}
                selectedConId={selectedConId}
                spotValue={spotViewOf(data)?.value ?? null}
                spotObservedAt={spotViewOf(data)?.observedAt ?? null}
                onInspect={(contract) => {
                  onInspect(contract, pendingTrigger.current);
                }}
              />
            </div>
          </>
        ) : (
          <p role="status">Aucun groupe publié dans ce snapshot.</p>
        )}
      </DataStateBoundary>

      <MethodNote
        limitesTestId="chain-population-limit"
        methode={
          <>
            quotes relayées verbatim avec leur statut (<code>OK</code>, <code>CROSSED</code>,{' '}
            <code>STALE</code>, <code>MISSING</code>) ; IV Vertex{' '}
            <code>options.implied_volatility</code> et Greeks <code>options.greeks</code> calculés
            par le worker sur le MID d'une quote saine uniquement (lignée{' '}
            <code>CalculationRecord</code> conservée, nature THÉORIQUE). Rendu direct de la table,
            plafond servi de {budget === null || budget.maxRows === null ? 'un nombre non publié de' : budget.maxRows}{' '}
            lignes — décision documentée, aucune virtualisation externe.
          </>
        }
        limites={
          <>
            population publiée <code>{data.population ?? 'NON_PUBLIÉE'}</code> ; expiration et trading
            class ne sont jamais fusionnées (deux classes d'une même date sont deux groupes) ; une IV
            absente est dite avec sa raison, jamais 0 ; une quote croisée, périmée ou absente n'a jamais
            d'IV ; le statut d'open interest est relayé contrat par contrat lorsqu'il est publié.
          </>
        }
      />
    </section>
  );
}

function OptionsBoard({
  data,
  state,
  queryRefreshing,
  underlying,
}: {
  readonly data: OptionChainResponse;
  readonly state: DataState;
  readonly queryRefreshing: boolean;
  readonly underlying: string;
}) {
  const groups = data.expirations;
  const [selectedKey, setSelectedKey] = useState<string>(() =>
    groups.length > 0 && groups[0] !== undefined ? groupKeyOf(groups[0]) : '',
  );
  const [inspected, setInspected] = useState<InspectedContractSelection | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const selected = groups.find((group) => groupKeyOf(group) === selectedKey) ?? groups[0] ?? null;
  // Un contrat inspecté n'est valable que dans le snapshot et le groupe qui
  // l'ont publié. Un refetch SSE peut remplacer sa quote ou retirer le groupe :
  // l'ancien objet ne doit alors jamais redevenir transférable avec le nouvel
  // état global. La comparaison de référence est immédiate au rendu.
  const currentInspected =
    inspected !== null && inspected.snapshot === data && selected !== null && inspected.groupKey === groupKeyOf(selected)
      ? inspected.contract
      : null;
  const spot = spotViewOf(data);
  const transferBlockReason = chainTransferBlockReasonOf(state, data, selected?.quality ?? null, queryRefreshing);

  function closeInspector(): void {
    setInspected(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  }

  return (
    <>
      <div className="vx-options-grid vx-board" data-testid="options-grid">
        {/* Rangée de SYNTHÈSE : le snapshot et ses trois valeurs compactes. */}
        <ModuleCell id="identity-strip" density="compact">
          <IdentityStripModule data={data} />
        </ModuleCell>
        <ModuleCell id="spot" density="compact">
          <SpotModule data={data} />
        </ModuleCell>
        <ModuleCell id="rate" density="compact">
          <RateModule data={data} />
        </ModuleCell>
        <ModuleCell id="dividend" density="compact">
          <DividendModule data={data} />
        </ModuleCell>

        {/* La DOMINANTE, en deuxième rangée. */}
        <ChainFrame
          data={data}
          state={state}
          underlying={underlying}
          groups={groups}
          selected={selected}
          onSelectGroup={(key) => {
            // L'inspecteur porte un contrat du groupe courant. Le conserver
            // après une bascule ferait juger cet ancien contrat avec la qualité
            // du nouveau groupe. Fermer le panneau maintient cette identité.
            if (key !== selectedKey) {
              setInspected(null);
              triggerRef.current = null;
            }
            setSelectedKey(key);
          }}
          selectedConId={currentInspected?.con_id ?? null}
          onInspect={(contract, trigger) => {
            triggerRef.current = trigger;
            if (selected !== null) {
              setInspected({ contract, groupKey: groupKeyOf(selected), snapshot: data });
            }
          }}
        />

        {/* Trois figures de hauteur voisine. */}
        <ModuleCell id="underlying">
          <UnderlyingModule underlying={underlying} />
        </ModuleCell>
        <ModuleCell id="iv-smile">
          <IvSmileModule group={selected} />
        </ModuleCell>
        <ModuleCell id="vol-structure">
          <VolStructureModule groups={groups} />
        </ModuleCell>

        {/* La série longue, en bande. */}
        <ModuleCell id="underlying-series" density="compact">
          <UnderlyingSeriesModule underlying={underlying} />
        </ModuleCell>

        {/* Les absences, regroupées : leur régularité est le message. */}
        <AbsentOptionsModule id="expected-move" />
        <AbsentOptionsModule id="iv-reference" />
        <AbsentOptionsModule id="iv-rank" />
        <AbsentOptionsModule id="strategy-builder" />
        <AbsentOptionsModule id="payoff-profile" />
        <AbsentOptionsModule id="strategy-metrics" />
      </div>

      {currentInspected !== null ? (
        <OptionInspector
          contract={currentInspected}
          underlying={underlying}
          spot={spot}
          population={data.population}
          transferBlockReason={transferBlockReason}
          onClose={closeInspector}
        />
      ) : (
        <ChainSnapshotInspector data={data} />
      )}
    </>
  );
}

function ChainRoute({ underlying }: { readonly underlying: string }) {
  const chain = useOptionChain(underlying);
  const queryState = pageStateOf(chain);
  const data = chain.data;
  const state = chainStateOf(queryState, data);

  return (
    <>
      <UnderlyingPicker current={underlying} />
      {state === 'auth-required' ? (
        <AuthRequiredNotice />
      ) : state === 'empty' ? (
        <DataStateBoundary
          state="empty"
          detail={`Aucun snapshot de chaîne publié pour « ${underlying} » — raison serveur : ${
            data?.reason ?? 'non fournie'
          }. Rien n'est inventé à la place.`}
        />
      ) : state === 'loading' || state === 'offline' || state === 'error' ? (
        <DataStateBoundary
          state={state}
          {...(state === 'offline'
            ? { detail: "L'API locale est injoignable — la chaîne ne peut pas être affichée." }
            : state === 'error'
              ? { detail: "Réponse invalide ou inattendue de l'API — aucune chaîne affichée." }
              : {
                  // Le squelette a la FORME de ce qui vient — une table — pour
                  // que la page ne saute pas de 16 px à 3 000 quand la chaîne
                  // arrive.
                  skeleton: <TableSkeleton label="Chaîne d'options en cours de chargement" rows={8} columns={9} />,
                })}
        />
      ) : data !== undefined ? (
        <OptionsBoard
          key={underlying}
          data={data}
          state={state}
          queryRefreshing={queryState === 'refreshing'}
          underlying={underlying}
        />
      ) : null}
    </>
  );
}

export function OptionsPage() {
  const { underlying } = useParams<{ underlying?: string }>();
  // Même règle que sur Analyse : le contexte SUIT l'adresse.
  const { adopter, activeInstrument } = useWorkspace();
  useEffect(() => {
    adopter(underlying ?? null);
  }, [adopter, underlying]);

  return (
    <article className="vx-page" {...pageAccentAttrs('options')} aria-labelledby="vx-page-title-options">
      <div className="vx-page-header">
        <h1 id="vx-page-title-options">Options</h1>
        <p className="vx-page-question">
          Quels contrats sont réellement exploitables et quels risques portent-ils ?
        </p>
      </div>

      {underlying === undefined || underlying === '' ? (
        <>
          {/* Le contexte de travail est un fil, pas un défaut : sans
              sous-jacent dans l'adresse, la page PROPOSE l'instrument regardé
              ailleurs, elle ne l'ouvre pas à la place de l'utilisateur. */}
          {activeInstrument === null ? null : (
            <p className="vx-underlying-shortcut" data-testid="options-active-instrument">
              Instrument du contexte :{' '}
              <Link to={`/options/${encodeURIComponent(activeInstrument)}`}>
                ouvrir la chaîne de <code>{activeInstrument}</code>
              </Link>
            </p>
          )}
          <UnderlyingPicker current={null} />
          <NoUnderlyingBoard />
        </>
      ) : (
        <ChainRoute underlying={underlying} />
      )}
    </article>
  );
}
