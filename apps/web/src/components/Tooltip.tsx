import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode } from 'react';

/**
 * L'INFOBULLE UNIQUE de Vertex (refonte vague 2, lot V2-2b).
 *
 * Une seule surface, un seul rayon, une seule police, un seul positionnement
 * borné à l'écran — au lieu d'attributs `title` natifs que chaque navigateur
 * dessine à sa façon, après un délai qu'on ne choisit pas, et qu'aucun
 * clavier n'ouvre. Aucune dépendance : le périmètre desktop n'a besoin ni
 * d'un portail ni d'un moteur de placement.
 *
 * CE QU'ELLE MONTRE. Une définition, une provenance, un libellé servi —
 * jamais un calcul, jamais une valeur inventée. Le texte est passé tel quel.
 *
 * CLAVIER ET LECTEURS D'ÉCRAN. La bulle est un `role="tooltip"` toujours
 * présent dans l'arbre et relié par `aria-describedby` : un lecteur d'écran
 * lit la description même quand la bulle est masquée (l'algorithme du nom
 * accessible traverse les références masquées). Elle s'ouvre au survol, au
 * focus de n'importe quel descendant, et pour un déclencheur qui n'est pas
 * focusable par nature, `tabbable` le met dans l'ordre de tabulation.
 * Échap la ferme sans quitter le déclencheur ; un défilement ou un
 * redimensionnement la replace, parce que sa position ne suit pas seule.
 *
 * OÙ `title` RESTE LÉGITIME. Les cellules des tables denses (une provenance
 * par cellule : la bulle doublerait le DOM) et le glyphe d'absence, dont la
 * redondance `aria-label` + `title` est défendue par un test. Partout
 * ailleurs, une définition passe par ce composant.
 */
export type TooltipPlacement = 'top' | 'bottom' | 'right' | 'left';

export interface TooltipProps {
  /** Texte de la bulle — définition, provenance ou libellé servi, verbatim. */
  readonly content: string;
  readonly placement?: TooltipPlacement;
  /**
   * `true` : le déclencheur lui-même entre dans l'ordre de tabulation. À
   * réserver aux déclencheurs qui ne contiennent aucun élément focusable
   * (un en-tête de colonne, un badge).
   */
  readonly tabbable?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface TooltipPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: TooltipPlacement;
}

/** Marge minimale entre la bulle et le bord de l'écran, et avec son déclencheur. */
export const TOOLTIP_MARGIN = 8;

const OPPOSITE: Readonly<Record<TooltipPlacement, TooltipPlacement>> = {
  top: 'bottom',
  bottom: 'top',
  right: 'left',
  left: 'right',
};

function place(trigger: Rect, bubble: Size, placement: TooltipPlacement): { left: number; top: number } {
  switch (placement) {
    case 'top':
      return {
        left: trigger.left + trigger.width / 2 - bubble.width / 2,
        top: trigger.top - bubble.height - TOOLTIP_MARGIN,
      };
    case 'bottom':
      return {
        left: trigger.left + trigger.width / 2 - bubble.width / 2,
        top: trigger.top + trigger.height + TOOLTIP_MARGIN,
      };
    case 'right':
      return {
        left: trigger.left + trigger.width + TOOLTIP_MARGIN,
        top: trigger.top + trigger.height / 2 - bubble.height / 2,
      };
    case 'left':
      return {
        left: trigger.left - bubble.width - TOOLTIP_MARGIN,
        top: trigger.top + trigger.height / 2 - bubble.height / 2,
      };
  }
}

function fits(candidate: { left: number; top: number }, bubble: Size, viewport: Size): boolean {
  return (
    candidate.left >= TOOLTIP_MARGIN &&
    candidate.top >= TOOLTIP_MARGIN &&
    candidate.left + bubble.width <= viewport.width - TOOLTIP_MARGIN &&
    candidate.top + bubble.height <= viewport.height - TOOLTIP_MARGIN
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Position bornée à l'écran, en pixels de viewport (`position: fixed`).
 * Le côté demandé est gardé s'il tient ; sinon le côté opposé s'il tient ;
 * sinon le côté demandé, ramené dans l'écran — la bulle ne sort jamais.
 * Fonction pure : c'est elle que les tests exercent.
 */
export function positionTooltip(
  trigger: Rect,
  bubble: Size,
  viewport: Size,
  wanted: TooltipPlacement,
): TooltipPosition {
  const first = place(trigger, bubble, wanted);
  if (fits(first, bubble, viewport)) {
    return { ...first, placement: wanted };
  }
  const opposite = OPPOSITE[wanted];
  const second = place(trigger, bubble, opposite);
  if (fits(second, bubble, viewport)) {
    return { ...second, placement: opposite };
  }
  return {
    left: clamp(first.left, TOOLTIP_MARGIN, viewport.width - bubble.width - TOOLTIP_MARGIN),
    top: clamp(first.top, TOOLTIP_MARGIN, viewport.height - bubble.height - TOOLTIP_MARGIN),
    placement: wanted,
  };
}

export function Tooltip({ content, placement = 'top', tabbable = false, className, children }: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<TooltipPosition | null>(null);

  const mesurer = useCallback((): void => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (trigger === null || bubble === null) {
      return;
    }
    const bubbleRect = bubble.getBoundingClientRect();
    setPlaced(
      positionTooltip(
        trigger.getBoundingClientRect(),
        { width: bubbleRect.width, height: bubbleRect.height },
        { width: window.innerWidth, height: window.innerHeight },
        placement,
      ),
    );
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(null);
      return;
    }
    mesurer();
  }, [open, mesurer]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // La bulle est en `position: fixed` : elle ne suit pas d'elle-même un
    // défilement ni un redimensionnement. Elle se REPLACE plutôt que de se
    // fermer — le focus clavier fait souvent défiler la région qui l'héberge
    // (en-tête collant, table défilante), et une bulle qui disparaît à
    // l'instant où elle s'ouvre n'est pas une bulle.
    window.addEventListener('scroll', mesurer, true);
    window.addEventListener('resize', mesurer);
    return () => {
      window.removeEventListener('scroll', mesurer, true);
      window.removeEventListener('resize', mesurer);
    };
  }, [open, mesurer]);

  const onBlur = (event: FocusEvent<HTMLSpanElement>): void => {
    // Le focus qui passe d'un descendant à un autre ne ferme rien.
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key === 'Escape' && open) {
      // Échap ferme LA BULLE, pas le panneau ou le dialogue qui l'héberge.
      event.stopPropagation();
      setOpen(false);
    }
  };

  const style: CSSProperties | undefined =
    placed === null ? undefined : { left: `${Math.round(placed.left)}px`, top: `${Math.round(placed.top)}px` };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: le survol et le focus n'exécutent aucune action, ils révèlent une description ; la sémantique est portée par la bulle `role="tooltip"` et par `aria-describedby`.
    <span
      ref={triggerRef}
      className={className === undefined ? 'vx-tip' : `vx-tip ${className}`}
      data-open={open ? 'true' : 'false'}
      aria-describedby={id}
      {...(tabbable ? { tabIndex: 0 } : {})}
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(true);
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {children}
      <span
        ref={bubbleRef}
        role="tooltip"
        id={id}
        className="vx-tip-bubble"
        hidden={!open}
        data-placement={placed?.placement ?? placement}
        {...(style === undefined ? {} : { style })}
      >
        {content}
      </span>
    </span>
  );
}
