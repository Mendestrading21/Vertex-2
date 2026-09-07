import { useState } from 'react';

import type { SystemCapabilities } from '../api/client.ts';
import { pageStateOf, useAttention, useCapabilities } from '../api/hooks.ts';
import { AuthRequiredNotice } from '../components/AuthRequiredNotice.tsx';
import { Card } from '../components/Card.tsx';
import { DataStateBoundary } from '../components/DataStateBoundary.tsx';
import type { ModuleState } from '../components/moduleState.ts';
import { SyntheticBanner } from '../components/SyntheticBanner.tsx';
import { SourceHealthMatrix } from './SourceHealthMatrix.tsx';
import { ModuleCell } from '../components/widgets/ModuleCell.tsx';
import { CapabilityInspector } from './sources/CapabilityInspector.tsx';
import {
  AbsentSourcesModule,
  ExportsModule,
  FreshnessModule,
  HealthPanel,
  LastSyncModule,
  StatusCensusModule,
  UnknownProbesModule,
  VersionsModule,
} from './sources/SourcesModules.tsx';
import { sourcesModule } from './sources/sourcesModules.ts';

/**
 * Page Sources & Rapports (`TL / 12`) — question : « Puis-je faire confiance
 * aux sources, traitements et sauvegardes maintenant ? »
 *
 * Destination du blueprint qui ABSORBE l'ancienne page Système
 * (docs/05-design/PAGE_ARBITRATION.md) : la question et les capacités livrées
 * sont inchangées, seule l'identité de destination l'est.
 *
 * LOT-A8 — LA PLANCHE §12 EN ENTIER. `pages-11-12-calendar-sources-reports.png`
 * (moitié droite) compose dix-sept modules. Huit sont SERVIS : les statuts
 * testés (dénombrement), la fraîcheur, la dernière vérification, les versions
 * et le flux, le **registre des sources en DOMINANTE** (matrice LOT-01
 * inchangée, bouton « Détail » par capacité), les exports réellement servis,
 * la santé des composants (section conservée, matériau de carte par la
 * grille), les sondes hors manifeste. Neuf n'ont aucune source ni contrat :
 * santé globale (le contrat interdit un vert rassurant sans couverture
 * complète), couverture et qualité des champs, taux d'erreur, incidents,
 * lignée, journal d'audit, rapports, sauvegardes — ils tiennent leur place
 * avec le motif de leur absence. Rien n'est simulé.
 *
 * REFONTE UI 2026-09-05 — ORDRE DE LECTURE. La planche se lit désormais
 * SIGNAL → REGISTRE → DIAGNOSTIC → absences : les dénombrements, la
 * fraîcheur et la dernière vérification en tête, la dominante en deuxième
 * rangée, puis la santé des composants, les versions et les sondes, les
 * exports, et les neuf absences regroupées en bas — où leur régularité est
 * le message. La composition vit dans `.vx-sources-grid` (`global.css`) ;
 * le catalogue est inchangé et l'ordre du DOM suit l'ordre de lecture.
 *
 * L'inspecteur n'existe que si une capacité est RÉELLEMENT ouverte : le
 * témoin « aucune colonne morte » du shell lit cette page sans sélection.
 *
 * La route API `/v1/system/capabilities` ne bouge PAS : la règle 2 de
 * l'arbitrage et `.claude/rules/architecture.md` interdisent de déplacer une
 * responsabilité serveur sans ADR.
 */

function RegistryModule({
  data,
  selected,
  onInspect,
}: {
  readonly data: SystemCapabilities;
  readonly selected: string | null;
  readonly onInspect: (capabilityId: string) => void;
}) {
  const module = sourcesModule('registry');
  return (
    <Card
      rank="dominant"
      kicker="Déclaré"
      title={module.title}
      titleId="vx-src-registry-title"
      className="vx-matrix-card"
      // Le compte vient du DTO (`total`), jamais d'un chiffre écrit dans le
      // code ; l'instant est celui de la réponse, daté par le serveur.
      aside={
        <>
          {data.total} déclarée(s) · vérifié à <time dateTime={data.checked_at}>{data.checked_at}</time>
        </>
      }
      footer={<>capacités déclarées × sondes persistées · jamais sondé = NEVER_TESTED</>}
    >
      <SourceHealthMatrix entries={data.capabilities} total={data.total} selected={selected} onInspect={onInspect} />
    </Card>
  );
}

/**
 * La planche §12. L'état passé aux widgets est celui de la PAGE, et il ne
 * vaut ici que `ready` ou `refreshing` : la frontière de `SourcesReportsPage`
 * ne rend cette planche que dans ces deux états, avec `data` défini. Les
 * autres états (hors ligne, erreur, session requise) sont dits par la
 * frontière, une fois, au-dessus — jamais répétés dix-sept fois.
 */
function SourcesBoard({ data, state }: { readonly data: SystemCapabilities; readonly state: ModuleState }) {
  const attention = useAttention();
  // La nature vient d'une SECONDE requête. Tant qu'elle n'a pas répondu, on ne
  // sait pas encore — ce n'est pas la même chose qu'une nature non déclarée.
  // Rendre le bandeau tout de suite afficherait « NATURE NON DÉCLARÉE » en
  // rouge à chaque chargement de la page : une fausse alerte, et la confusion
  // exacte entre « absent » et « pas encore connu » que le programme interdit.
  // Une requête en ERREUR, en revanche, laisse bien la nature indéterminée et
  // doit avertir.
  const attentionSettled = !attention.isPending;
  const population = attention.data?.population ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const opened = selected === null ? null : (data.capabilities.find((entry) => entry.capability_id === selected) ?? null);

  return (
    <>
      {attentionSettled ? <SyntheticBanner population={population} /> : null}

      <div className="vx-sources-grid vx-board" data-testid="sources-grid">
        {/* SIGNAL : ce que la réponse dit d'elle-même. */}
        <StatusCensusModule data={data} state={state} />
        <FreshnessModule health={data.health} state={state} />
        <LastSyncModule data={data} state={state} />

        {/* REGISTRE : la dominante, en pleine largeur. */}
        <ModuleCell id="registry" size={sourcesModule('registry').size}>
          <RegistryModule
            data={data}
            selected={opened?.capability_id ?? null}
            onInspect={(capabilityId) => {
              setSelected((previous) => (previous === capabilityId ? null : capabilityId));
            }}
          />
        </ModuleCell>

        {/* DIAGNOSTIC : composants, versions, sondes, exports. */}
        <ModuleCell id="components-health" size={sourcesModule('components-health').size}>
          <HealthPanel health={data.health} />
        </ModuleCell>
        <VersionsModule health={data.health} state={state} />
        {/* L'ORDRE DU DOM SUIT L'ORDRE DE LECTURE : les exports sont posés
            au-dessus des sondes hors manifeste. Mesuré le 2026-09-07, le
            document les donnait après. */}
        <ExportsModule state={state} />
        <UnknownProbesModule data={data} state={state} />

        {/* ABSENCES : neuf motifs fermés, regroupés. */}
        <AbsentSourcesModule id="global-health" />
        <AbsentSourcesModule id="field-coverage" />
        <AbsentSourcesModule id="error-rate" />
        <AbsentSourcesModule id="incidents" />
        <AbsentSourcesModule id="lineage" />
        <AbsentSourcesModule id="field-quality" />
        <AbsentSourcesModule id="audit-log" />
        <AbsentSourcesModule id="reports" />
        <AbsentSourcesModule id="backups" />
      </div>

      {opened !== null ? (
        <CapabilityInspector
          entry={opened}
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}
    </>
  );
}

export function SourcesReportsPage() {
  const capabilities = useCapabilities();
  const state = pageStateOf(capabilities);

  return (
    <article className="vx-page" aria-labelledby="vx-page-title-sources-reports">
      <div className="vx-page-header">
        <h1 id="vx-page-title-sources-reports">Sources &amp; Rapports</h1>
        <p className="vx-page-question">
          Puis-je faire confiance aux sources, traitements et sauvegardes maintenant ?
        </p>
      </div>

      {state === 'auth-required' ? (
        <AuthRequiredNotice />
      ) : state === 'ready' || state === 'refreshing' ? (
        <DataStateBoundary
          state={state}
          {...(capabilities.data !== undefined ? { asOfLabel: `vérifié à ${capabilities.data.checked_at}` } : {})}
        >
          {capabilities.data !== undefined ? <SourcesBoard data={capabilities.data} state={state} /> : null}
        </DataStateBoundary>
      ) : (
        <DataStateBoundary
          state={state}
          {...(state === 'offline'
            ? { detail: "L'API locale est injoignable — aucun état de capacité ne peut être affiché." }
            : state === 'error'
              ? { detail: "Réponse invalide ou inattendue de l'API — aucun état de capacité affiché." }
              : {})}
        />
      )}
    </article>
  );
}
