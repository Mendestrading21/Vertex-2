import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

import type { SystemCapabilities, SystemHealth } from '../../api/client.ts';
import { sseStateStore } from '../../api/events.ts';
import type { SseConnectionState } from '../../api/events.ts';
import { AbsentModule } from '../../components/AbsentModule.tsx';
import { CensusBars } from '../../components/CensusBars.tsx';
import type { CensusEntry } from '../../components/CensusBars.tsx';
import { FreshnessBadge } from '../../components/FreshnessBadge.tsx';
import type { ModuleState } from '../../components/moduleState.ts';
import { ModuleCell } from '../../components/widgets/ModuleCell.tsx';
import { Widget } from '../../components/widgets/Widget.tsx';
import { Metric } from '../../components/Metric.tsx';
import { sourcesModule } from './sourcesModules.ts';

/**
 * Les modules SERVIS de la planche §12, hors la dominante (le registre,
 * porté par la page). Tous lisent la même réponse `system/capabilities`
 * déjà validée par la page. Aucun calcul : dénombrements de statuts sondés,
 * âges publiés, versions publiées, liste des exports réellement servis.
 *
 * REFONTE UI 2026-09-05 — les kickers disent la NATURE du fait (publié,
 * observé, dénombré, servi, déclaré), les pieds tiennent en une ligne et
 * les identifiants de champ sont rendus en `<code>`, jamais en backticks
 * littéraux. Les absences passent par `ModuleCell` en densité compacte : une
 * carte de motif n'a pas besoin du chrome d'une figure.
 */

const SSE_LABELS: Readonly<Record<SseConnectionState, string>> = {
  connecting: 'connexion en cours',
  open: 'connecté',
  retrying: 'reconnexion (backoff)',
  // LOT L0 : le lien peut être OUVERT et pourtant muet. Trois pings manqués
  // (45 s sans aucune trame) valent silence, et le client bascule en repli par
  // sondage — l'écran le dit plutôt que d'afficher « connecté ».
  silent: 'silence (aucune trame depuis 45 s, repli par sondage)',
  stopped: 'arrêté (aucune session active)',
};

export function AbsentSourcesModule({ id }: { readonly id: string }) {
  const module = sourcesModule(id);
  if (module.status.kind !== 'absent') {
    throw new Error(`Module ${id} is served, not absent`);
  }
  return (
    // `data-size` vient du catalogue comme pour un module servi : la planche
    // compose de la même façon un module absent et un module servi. La
    // densité compacte est une décision de COMPOSITION de la page.
    <ModuleCell id={id} size={module.size} density="compact">
      <AbsentModule title={module.title} question={module.question} reason={module.status.reason} note={module.status.note} />
    </ModuleCell>
  );
}

// ---------------------------------------------------------------------------

function statusCensusOf(data: SystemCapabilities): readonly CensusEntry[] {
  const counts = new Map<string, number>();
  for (const entry of data.capabilities) {
    counts.set(entry.tested_status, (counts.get(entry.tested_status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }));
}

export function StatusCensusModule({ data, state }: { readonly data: SystemCapabilities; readonly state: ModuleState }) {
  const module = sourcesModule('status-census');
  const neverTested = data.capabilities.filter((entry) => entry.tested_at === null).length;
  return (
    <Widget
      id="status-census"
      size={module.size}
      kicker="Dénombré"
      title={module.title}
      titleId="vx-src-census-title"
      state={state}
      action={<>{data.total} déclarée(s)</>}
      footer={<>jamais sondée = ERROR / NEVER_TESTED : {neverTested} sur {data.total}, jamais une disponibilité supposée</>}
    >
      <CensusBars entries={statusCensusOf(data)} ariaLabel="Dénombrement par statut sondé" testIdPrefix="src-status" emptyLabel="Aucune capacité déclarée." />
    </Widget>
  );
}

// ---------------------------------------------------------------------------

export function FreshnessModule({ health, state }: { readonly health: SystemHealth; readonly state: ModuleState }) {
  const module = sourcesModule('freshness');
  return (
    <Widget
      id="freshness"
      size={module.size}
      kicker="Publié"
      title={module.title}
      titleId="vx-src-freshness-title"
      state={state}
      footer={
        <>
          worker observé par <code>heartbeat_proxy</code> : l’âge de son dernier snapshot, pas le processus
        </>
      }
    >
      <dl className="vx-inspector-facts" data-testid="src-freshness">
        <div>
          <dt>Snapshot attention</dt>
          <dd>{health.attention_snapshot.present ? <FreshnessBadge ageSeconds={health.attention_snapshot.age_seconds} /> : 'jamais publié'}</dd>
        </div>
        <div>
          <dt>Snapshot capacités</dt>
          <dd>{health.capabilities_snapshot.present ? <FreshnessBadge ageSeconds={health.capabilities_snapshot.age_seconds} /> : 'jamais publié'}</dd>
        </div>
        <div>
          <dt>Dernier snapshot du worker</dt>
          <dd>
            {health.worker.last_snapshot_as_of === null ? 'aucun snapshot observé' : <FreshnessBadge ageSeconds={health.worker.age_seconds} sourceLabel="dernier snapshot publié" />}
          </dd>
        </div>
      </dl>
    </Widget>
  );
}

// ---------------------------------------------------------------------------

export function LastSyncModule({ data, state }: { readonly data: SystemCapabilities; readonly state: ModuleState }) {
  const module = sourcesModule('last-sync');
  return (
    <Widget
      id="last-sync"
      size={module.size}
      kicker="Publié"
      title={module.title}
      titleId="vx-src-lastsync-title"
      state={state}
      footer={
        <>
          <code>checked_at</code> = réponse · <code>as_of</code> = snapshot
        </>
      }
    >
      <dl className="vx-inspector-facts" data-testid="src-last-sync">
        <div>
          <dt>Vérifié à</dt>
          <dd>
            <time dateTime={data.checked_at}>{data.checked_at}</time>
          </dd>
        </div>
        <div>
          <dt>Snapshot de capacités</dt>
          <dd>
            v{data.snapshot_version ?? 'non publiée'} · {data.as_of !== null ? <time dateTime={data.as_of}>{data.as_of}</time> : 'as_of non publié'}
          </dd>
        </div>
        <div>
          <dt>Âge publié</dt>
          <dd>
            <FreshnessBadge ageSeconds={data.age_seconds} sourceLabel="âge publié par le serveur" />
          </dd>
        </div>
      </dl>
    </Widget>
  );
}

// ---------------------------------------------------------------------------

export function VersionsModule({ health, state }: { readonly health: SystemHealth; readonly state: ModuleState }) {
  const module = sourcesModule('versions');
  const sseState = useSyncExternalStore(sseStateStore.subscribe, sseStateStore.getState);
  return (
    <Widget
      id="versions"
      size={module.size}
      kicker="Publié"
      title={module.title}
      titleId="vx-src-versions-title"
      state={state}
      footer={<>versions publiées par le serveur · état du flux SSE observé par le client</>}
    >
      <div className="vx-metrics-row" data-testid="src-versions">
        <Metric label="Attention" value={health.attention_snapshot.present ? `v${health.attention_snapshot.version}` : null} absentLabel="jamais publié" size="compact" testId="src-version-attention" />
        <Metric label="Capacités" value={health.capabilities_snapshot.present ? `v${health.capabilities_snapshot.version}` : null} absentLabel="jamais publié" size="compact" testId="src-version-capabilities" />
        <Metric label="Flux SSE" value={SSE_LABELS[sseState]} size="compact" testId="src-version-sse" />
      </div>
    </Widget>
  );
}

// ---------------------------------------------------------------------------

export function ExportsModule({ state }: { readonly state: ModuleState }) {
  const module = sourcesModule('exports');
  return (
    <Widget
      id="exports"
      size={module.size}
      kicker="Servi"
      title={module.title}
      titleId="vx-src-exports-title"
      state={state}
      footer={<>fonctions pures d’un snapshot publié · rien n’est généré dans le navigateur</>}
    >
      <ul className="vx-inspector-list" data-testid="src-exports">
        <li>
          Journal du registre manuel (CSV) — <code>GET /api/v1/portfolio/export</code> · <Link to="/portfolio">depuis Portefeuille</Link>
        </li>
        <li>
          Points quotidiens de performance (CSV) — <code>GET /api/v1/performance/{'{portfolio_id}'}/export</code> ·{' '}
          <Link to="/portfolio">depuis Portefeuille</Link>
        </li>
        <li>
          Manifeste d’audit de performance (JSON : méthodes, versions, hashes) — même route · <Link to="/portfolio">depuis Portefeuille</Link>
        </li>
      </ul>
    </Widget>
  );
}

// ---------------------------------------------------------------------------

export function HealthPanel({ health }: { readonly health: SystemHealth }) {
  const sseState = useSyncExternalStore(sseStateStore.subscribe, sseStateStore.getState);
  return (
    <section className="vx-health" aria-label="Santé des composants">
      <h2>Santé des composants</h2>
      <dl className="vx-health-grid">
        <div className="vx-health-item">
          <dt>Base de données</dt>
          <dd data-health={health.db.status}>{health.db.status === 'ok' ? 'ok (SELECT 1)' : 'erreur (SELECT 1 en échec)'}</dd>
        </div>
        <div className="vx-health-item">
          <dt>Snapshot attention</dt>
          <dd>
            {health.attention_snapshot.present ? (
              <>
                version {health.attention_snapshot.version} <FreshnessBadge ageSeconds={health.attention_snapshot.age_seconds} />
              </>
            ) : (
              'jamais publié'
            )}
          </dd>
        </div>
        <div className="vx-health-item">
          <dt>Snapshot capacités</dt>
          <dd>
            {health.capabilities_snapshot.present ? (
              <>
                version {health.capabilities_snapshot.version} <FreshnessBadge ageSeconds={health.capabilities_snapshot.age_seconds} />
              </>
            ) : (
              'jamais publié'
            )}
          </dd>
        </div>
        <div className="vx-health-item">
          <dt>
            Worker <span className="vx-health-method">({health.worker.method})</span>
          </dt>
          <dd>
            {health.worker.last_snapshot_as_of === null ? 'aucun snapshot observé' : <FreshnessBadge ageSeconds={health.worker.age_seconds} sourceLabel="dernier snapshot publié" />}
            <p className="vx-health-limitation">
              Limitation assumée : « heartbeat_proxy » mesure l'âge du snapshot le plus récent, pas une observation directe du
              processus worker.
            </p>
          </dd>
        </div>
        <div className="vx-health-item">
          <dt>Flux SSE (client)</dt>
          <dd data-sse={sseState}>{SSE_LABELS[sseState]}</dd>
        </div>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function UnknownProbesModule({ data, state }: { readonly data: SystemCapabilities; readonly state: ModuleState }) {
  const module = sourcesModule('unknown-probes');
  return (
    <Widget
      id="unknown-probes"
      size={module.size}
      kicker="Observé"
      title={module.title}
      titleId="vx-src-probes-title"
      state={state}
      footer={<>sondes hors manifeste relayées telles quelles · jamais fusionnées ni ignorées</>}
    >
      {data.unknown_probed_capability_ids.length === 0 ? (
        <p className="vx-module-sentence" role="status" data-testid="src-unknown-probes-empty">
          Aucune sonde hors manifeste : toutes les sondes persistées correspondent à une capacité déclarée.
        </p>
      ) : (
        <ul className="vx-inspector-list" data-testid="src-unknown-probes">
          {data.unknown_probed_capability_ids.map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
