import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * Inspecteur contextuel du shell — point 6 de l'anatomie canonique :
 * « zone de travail dense avec une dominante centrale et un inspecteur
 * contextuel À DROITE ». Largeur de référence : 300–340 px selon viewport
 * (`references/canonical-visual.md`).
 *
 * Le contrat des douze pages donne à CHAQUE destination le contenu de son
 * inspecteur (§7 « ligne sélectionnée, provenance manuelle, corrections et
 * impacts », §10 « source, fuseau, historique, instruments liés et
 * incertitude », etc.). L'inspecteur est donc un EMPLACEMENT du shell, rempli
 * par la page — jamais un composant qui irait lire les données lui-même.
 *
 * Deux règles tenues par ce mécanisme :
 *
 * 1. **Aucune colonne morte.** L'aside n'occupe la grille que si une page y a
 *    monté du contenu. Une destination qui n'a rien à inspecter n'affiche pas
 *    un panneau vide — ce serait de la chrome décorative, et
 *    `.claude/rules/frontend.md` interdit d'ajouter un module « sans décision
 *    utilisateur précise ».
 * 2. **Un seul propriétaire.** L'inspecteur n'a pas d'état propre et ne
 *    recalcule rien : il rend ce que la page lui passe, qui vient déjà d'un
 *    DTO relayé.
 *
 * Mécanique : le panneau est monté par la page via un portail vers le nœud du
 * shell. Un compteur externe (même motif que `sseStateStore`) dit au shell si
 * au moins un panneau est monté, sans que le shell ait à connaître les pages.
 */

let mountedPanels = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

const inspectorStore = {
  getState(): number {
    return mountedPanels;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Identifiant du nœud d'accueil, posé par `AppShell`. */
export const INSPECTOR_SLOT_ID = 'vx-inspector-slot';

/** `true` dès qu'une page a monté un panneau d'inspecteur. */
export function useInspectorOccupied(): boolean {
  return useSyncExternalStore(
    inspectorStore.subscribe,
    () => inspectorStore.getState() > 0,
    () => false,
  );
}

export interface InspectorPanelProps {
  /**
   * Titre du panneau. Le contrat canonique montre « Inspecteur — <sujet> » :
   * le sujet est le nom de l'élément sélectionné, jamais un libellé générique.
   * Le nom ACCESSIBLE garde la forme complète ; à l'écran, « Inspecteur » est
   * le kicker et le sujet le titre — un seul en-tête, pas deux.
   */
  readonly subject: string;
  /**
   * REFONTE VAGUE 2 — UN SEUL EN-TÊTE POUR NEUF INSPECTEURS. Chaque page
   * réécrivait son bloc « note + bouton Fermer » (`vx-sheet-head`) ; la note
   * (secteur, statut, lot, nature) et la fermeture sont désormais des props :
   * même structure, même position du bouton, même focus, sur toutes les pages.
   */
  readonly note?: React.ReactNode;
  /**
   * Présent ⇒ le bouton « Fermer » est rendu dans l'en-tête, jamais ailleurs,
   * ET `Échap` referme depuis n'importe quel élément du panneau.
   */
  readonly onClose?: () => void;
  readonly children: React.ReactNode;
}

/**
 * Monte un panneau dans l'inspecteur du shell. À rendre par la PAGE, pas par
 * le shell : c'est la page qui sait ce qu'elle a de sélectionné.
 */
export function InspectorPanel({ subject, note, onClose, children }: InspectorPanelProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [panneau, setPanneau] = useState<HTMLElement | null>(null);
  // Une page peut monter PLUSIEURS panneaux (un dossier ouvert, une
  // explication). Un identifiant fixe les rendrait tous porteurs du même
  // `id`, ce qu'axe refuse et ce qui casserait `aria-labelledby`.
  const titleId = useId();

  const attacherPanneau = useCallback((node: HTMLElement | null) => {
    setPanneau(node);
  }, []);

  useEffect(() => {
    mountedPanels += 1;
    notify();
    // Le nœud d'accueil est rendu par `AppShell`, donc déjà présent quand une
    // page se monte. On le lit après la peinture pour ne dépendre d'aucun
    // ordre de montage.
    setSlot(document.getElementById(INSPECTOR_SLOT_ID));
    return () => {
      mountedPanels -= 1;
      notify();
    };
  }, []);

  /*
    ÉCHAP FERME, SUR TOUTES LES PAGES (vague 2, tour de mise en place).
    Mesuré sur la pile en direct le 2026-09-06 : `Échap` ne refermait que
    l'inspecteur d'Options, qui portait son propre écouteur ; sur Marchés,
    Risques, Portefeuille et les six autres, la même touche ne faisait rien.
    Une seule touche, un seul comportement : l'écouteur vit ici, avec le
    bouton « Fermer », et les deux répondent à la même prop.

    Écouteur NATIF sur le nœud plutôt que `onKeyDown` sur la section : sans
    `role="dialog"` — et ce panneau n'en est pas un, il ne piège pas le focus
    et ne masque pas la page — la règle d'accessibilité du linter refuse, à
    juste titre, un gestionnaire clavier sur un élément statique.

    PORTÉE VOLONTAIREMENT ÉTROITE : l'écouteur est posé sur le panneau, donc
    `Échap` ne referme que si le focus est DANS l'inspecteur. Depuis la table,
    la touche reste disponible pour ce que l'utilisateur regarde vraiment
    (palette, infobulle) ; on ne confisque jamais une touche globalement.
  */
  useEffect(() => {
    if (panneau === null || onClose === undefined) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation();
        fermer();
      }
    }
    const fermer = onClose;
    panneau.addEventListener('keydown', onKeyDown);
    return () => {
      panneau.removeEventListener('keydown', onKeyDown);
    };
  }, [panneau, onClose]);

  if (slot === null) {
    return null;
  }

  return createPortal(
    <section ref={attacherPanneau} className="vx-inspector-panel" aria-labelledby={titleId}>
      <header className="vx-inspector-head">
        <div className="vx-inspector-head-text">
          <p className="vx-inspector-kicker" aria-hidden="true">
            Inspecteur
          </p>
          <h2 id={titleId} className="vx-inspector-heading" aria-label={`Inspecteur — ${subject}`}>
            {subject}
          </h2>
          {note === undefined ? null : <p className="vx-inspector-note">{note}</p>}
        </div>
        {onClose === undefined ? null : (
          <button type="button" className="vx-sheet-close" onClick={onClose}>
            Fermer
          </button>
        )}
      </header>
      {children}
    </section>,
    slot,
  );
}
