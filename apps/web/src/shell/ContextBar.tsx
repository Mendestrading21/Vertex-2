import { useSyncExternalStore } from 'react';
import { Link, useMatches } from 'react-router-dom';

import { sessionStore } from '../api/client.ts';
import type { SessionState } from '../api/client.ts';
import { sseLinkStore } from '../api/events.ts';
import { isKnownResource, useSnapshotMeta } from '../api/hooks.ts';
import type { PageDef } from '../app/pages.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { LiveBadge } from '../components/widgets/LiveBadge.tsx';

/** `handle` de route portant la définition de page (posé dans routes.tsx). */
export interface PageHandle {
  readonly page: PageDef;
}

function isPageHandle(handle: unknown): handle is PageHandle {
  if (typeof handle !== 'object' || handle === null || !('page' in handle)) {
    return false;
  }
  const page = (handle as { page: unknown }).page;
  return (
    typeof page === 'object' &&
    page !== null &&
    'title' in page &&
    typeof (page as { title: unknown }).title === 'string'
  );
}

/**
 * Libellés d'état de session — uniquement des faits observés sur l'API :
 * `unknown` tant qu'aucune réponse n'a été vue (jamais un état deviné), puis
 * ce que le navigateur a RÉELLEMENT observé.
 *
 * CE QUE CE LIBELLÉ PEUT DIRE, ET CE QU'IL NE PEUT PAS. Le client passe à
 * `authenticated` quand une route protégée répond 200 (`api/client.ts`). Il
 * n'a jamais vu de session : il a vu un serveur qui accepte. Or ce poste
 * tourne avec le contournement local déclaré (`VERTEX_AUTH_OPEN_LOCAL`), où
 * l'API répond 200 SANS session — et la barre affichait « Connecté » avec sa
 * pastille verte, ce qui était faux. Mesuré le 2026-09-06.
 *
 * « Accès accordé » est vrai dans les DEUX configurations : avec passkey
 * comme avec le contournement, c'est exactement ce que le navigateur sait.
 */
const SESSION_LABELS: Readonly<Record<SessionState, string>> = {
  unknown: 'Session non vérifiée',
  authenticated: 'Accès accordé',
  unauthenticated: 'Accès refusé',
};

/**
 * Clé de repli quand la page n'a pas de tête fixe : elle n'est jamais
 * interrogée, donc son état de cache est vide et le badge dit « SANS SIGNAL ».
 * Un hook ne peut pas être appelé sous condition ; cette clé le remplace.
 */
const NO_RESOURCE_KEY = ['snapshot', '(aucune tête fixe)'] as const;

export interface ContextBarProps {
  /**
   * Ouvre la recherche globale. Fourni par la coquille, qui possède l'état de
   * la palette : la barre ne fait que déclencher, elle ne connaît ni les
   * résultats ni le raccourci.
   */
  readonly onOpenSearch: () => void;
}

/** Barre de contexte — page courante, recherche, lien de signalement, session. */
export function ContextBar({ onOpenSearch }: ContextBarProps) {
  const matches = useMatches();
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getState);
  const link = useSyncExternalStore(sseLinkStore.subscribe, sseLinkStore.getState);
  const pageMatch = [...matches].reverse().find((match) => isPageHandle(match.handle));
  const page =
    pageMatch !== undefined && isPageHandle(pageMatch.handle) ? pageMatch.handle.page : null;
  const title = page === null ? 'Page introuvable' : page.title;
  const live = page?.live ?? null;
  const meta = useSnapshotMeta(live === null ? NO_RESOURCE_KEY : live.queryKey);
  // « Suivie » veut dire : le flux signale RÉELLEMENT cette tête aujourd'hui.
  const tracked = live?.resource !== null && live?.resource !== undefined
    ? isKnownResource(live.resource)
    : false;
  /*
    REFONTE UI 2026-09-05 — LE CONTEXTE DE TRAVAIL DEVIENT VISIBLE.

    `activeInstrument` était écrit par trois pages (adopté depuis l'URL sur
    Analyse et Options, choisi sur Marchés) et LU par personne : le modèle de
    contexte du skill maître existait sans aucun témoin à l'écran. Le bandeau
    le montre à côté du titre de page, en lien vers le dossier d'analyse —
    c'est le fil qui relie une tuile de Marchés à la page suivante. Aucun
    instrument n'est inventé : sans choix, rien n'est affiché.
  */
  const { activeInstrument } = useWorkspace();

  return (
    <header className="vx-contextbar">
      <div className="vx-contextbar-title">
        <span className="vx-contextbar-app" aria-hidden="true">
          Titanium Ledger
        </span>
        <span className="vx-contextbar-divider" aria-hidden="true">
          /
        </span>
        <span className="vx-contextbar-page">{title}</span>
        {activeInstrument === null ? null : (
          <>
            <span className="vx-contextbar-divider" aria-hidden="true">
              /
            </span>
            <Link
              to={`/analysis/${encodeURIComponent(activeInstrument)}`}
              className="vx-contextbar-instrument"
              data-testid="contextbar-instrument"
              aria-label={`Instrument actif ${activeInstrument} — ouvrir son dossier d'analyse`}
            >
              <code>{activeInstrument}</code>
            </Link>
          </>
        )}
      </div>
      {/*
        Le déclencheur est VISIBLE, et pas seulement un raccourci : un raccourci
        que rien n'annonce n'existe que pour qui le connaît déjà. Il est
        atteignable à la tabulation comme les autres contrôles du bandeau, et
        occupe l'espace libre entre le titre et les états.
      */}
      <button type="button" className="vx-palette-trigger" onClick={onOpenSearch}>
        <span className="vx-palette-trigger-label">Rechercher une destination ou un instrument</span>
        <kbd className="vx-palette-kbd">⌘K</kbd>
      </button>
      <div className="vx-contextbar-meta">
        {/*
          POINT 5 DE L'ANATOMIE CANONIQUE — 2/3, et c'est dit.

          La FRAÎCHEUR et le BADGE DE MODE ont désormais un propriétaire : le
          lien de signalement (`sseLinkStore`) et les métadonnées SERVIES de la
          ressource principale de la page (`useSnapshotMeta`). La CLOCHE reste
          absente : aucune file de notifications n'existe côté contrat, et une
          cloche sans file serait une façade (article 17).

          Le badge ne dit jamais « en direct » : le flux est signal-only, il
          prouve un LIEN, pas une cotation.
        */}
        <LiveBadge session={session} link={link.link} mode={link.mode} tracked={tracked} meta={meta} />
        <p className="vx-contextbar-status" data-session={session}>
          <span className="vx-status-dot" aria-hidden="true" />
          {SESSION_LABELS[session]}
          {session === 'unauthenticated' ? <Link to="/auth">Accès</Link> : null}
        </p>
      </div>
    </header>
  );
}
