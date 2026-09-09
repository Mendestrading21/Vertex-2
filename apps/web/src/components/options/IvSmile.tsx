import { useLayoutEffect, useRef, useState } from 'react';

import type { OptionChainExpiration } from '../../api/client.ts';
import { geometryNumber, ivViewOf } from '../../pages/options/optionsView.ts';

/**
 * Sourire d'IV d'UN groupe (expiration, trading_class) : les IV THÉORIQUES
 * publiées par le worker, placées par strike, calls et puts séparés.
 *
 * Ce composant ne calcule aucune volatilité : il ne fait que la GÉOMÉTRIE
 * du tracé (position des points publiés), comme `Sparkline` pour les
 * clôtures. Un contrat sans IV résolue n'a pas de point — jamais un zéro —
 * et le compte des absents est écrit. Aucun point « ATM » n'est choisi :
 * choisir un strike de référence serait une décision de calcul.
 */
export interface IvPoint {
  readonly strike: string;
  readonly iv: string;
  readonly right: 'CALL' | 'PUT';
  /**
   * Les mêmes valeurs, LUES UNE FOIS pour la géométrie.
   *
   * Elles étaient relues à chaque usage par une conversion qui rendait `0` sur
   * une chaîne illisible : un strike ou une IV non analysable devenait alors un
   * point posé à l'origine du graphique — une donnée FAUSSE, indiscernable
   * d'une mesure réelle. Un contrat dont l'une des deux ne se lit pas est
   * désormais compté ABSENT, au même titre qu'une IV non résolue, et il n'entre
   * pas dans la série.
   */
  readonly strikeValue: number;
  readonly ivValue: number;
}

export interface IvSmileSeries {
  readonly calls: readonly IvPoint[];
  readonly puts: readonly IvPoint[];
  readonly absentCount: number;
  readonly strikeMin: string | null;
  readonly strikeMax: string | null;
  readonly ivMin: string | null;
  readonly ivMax: string | null;
}

/** Points publiés du groupe, triés par strike (tri de vue). Exportée pour être testée sans DOM. */
export function ivSmileSeriesOf(group: OptionChainExpiration): IvSmileSeries {
  const calls: IvPoint[] = [];
  const puts: IvPoint[] = [];
  let absentCount = 0;
  for (const contract of group.contracts) {
    const iv = ivViewOf(contract);
    if (contract.strike === null || contract.right === null || iv.status !== 'OK' || iv.value === null) {
      absentCount += 1;
      continue;
    }
    const strikeValue = geometryNumber(contract.strike);
    const ivValue = geometryNumber(iv.value);
    if (strikeValue === null || ivValue === null) {
      absentCount += 1;
      continue;
    }
    const point: IvPoint = {
      strike: contract.strike,
      iv: iv.value,
      right: contract.right,
      strikeValue,
      ivValue,
    };
    if (contract.right === 'CALL') {
      calls.push(point);
    } else {
      puts.push(point);
    }
  }
  // Tri de VUE : les strikes publiés deviennent des nombres AVANT toute
  // comparaison, comme `Sparkline` pour les clôtures — aucune arithmétique
  // sur une propriété financière relayée.
  const orderOf = (points: IvPoint[]): IvPoint[] => {
    return [...points].sort((left, right) => left.strikeValue - right.strikeValue);
  };
  const sortedCalls = orderOf(calls);
  const sortedPuts = orderOf(puts);
  const all = [...sortedCalls, ...sortedPuts];
  const extreme = (pick: (values: number[]) => number, key: 'strike' | 'iv'): string | null => {
    if (all.length === 0) {
      return null;
    }
    const lu = (point: IvPoint): number => (key === 'strike' ? point.strikeValue : point.ivValue);
    const target = pick(all.map(lu));
    return all.find((point) => lu(point) === target)?.[key] ?? null;
  };
  return {
    calls: sortedCalls,
    puts: sortedPuts,
    absentCount,
    strikeMin: extreme((values) => Math.min(...values), 'strike'),
    strikeMax: extreme((values) => Math.max(...values), 'strike'),
    ivMin: extreme((values) => Math.min(...values), 'iv'),
    ivMax: extreme((values) => Math.max(...values), 'iv'),
  };
}

/**
 * Largeur de tracé par défaut, quand rien ne peut être mesuré (jsdom, premier
 * rendu). Les hauteurs sont celles de la boîte CSS (`.vx-smile-svg`) : la
 * figure est dessinée AUX DIMENSIONS DE SA BOÎTE, jamais étirée dedans.
 */
const WIDTH = 160;
const HEIGHT = 120;
const HEIGHT_COMPACT = 56;
const PAD_X = 8;
const PAD_Y = 8;

/**
 * La largeur RÉELLE de la figure, observée.
 *
 * REFONTE UI 2026-09-05 — LES POINTS ÉTAIENT DES ELLIPSES. Le SVG déclarait
 * une boîte de 160×72 et `preserveAspectRatio="none"` ; la CSS l'étirait en
 * pleine largeur sur 120 px de haut, donc chaque `<circle>` devenait un ovale
 * trois fois plus large que haut (défaut relevé par `refonte/option.md` §1.2).
 * La figure prend désormais la largeur mesurée de sa boîte comme espace de
 * coordonnées : un point est un disque quelle que soit la colonne. Sans
 * `ResizeObserver` (tests), la largeur par défaut sert, sans déformation
 * puisque le rapport d'aspect est alors préservé par le navigateur.
 */
function useMeasuredWidth(fallback: number): readonly [React.RefObject<HTMLElement | null>, number] {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const mesure = entries[0]?.contentRect.width;
      if (mesure !== undefined && mesure > 0) {
        setWidth(Math.round(mesure));
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

function scale(values: readonly number[], size: number, pad: number, invert: boolean): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const drawable = size - 2 * pad;
  if (span === 0) {
    return () => pad + drawable / 2;
  }
  return (value) => {
    const ratio = (value - min) / span;
    return invert ? size - pad - ratio * drawable : pad + ratio * drawable;
  };
}

export interface IvSmileProps {
  readonly group: OptionChainExpiration;
  readonly label: string;
  readonly compact?: boolean;
}

export function IvSmile({ group, label, compact = false }: IvSmileProps) {
  const series = ivSmileSeriesOf(group);
  const all = [...series.calls, ...series.puts];
  const [figureRef, width] = useMeasuredWidth(WIDTH);
  if (all.length === 0) {
    return (
      <p className="vx-iw-absent" role="status" data-testid="iv-smile-absent">
        Aucune IV résolue dans ce groupe ({series.absentCount} contrat{series.absentCount > 1 ? 's' : ''} sans IV) :
        rien n’est tracé.
      </p>
    );
  }
  const height = compact ? HEIGHT_COMPACT : HEIGHT;
  const x = scale(all.map((point) => point.strikeValue), width, PAD_X, false);
  const y = scale(all.map((point) => point.ivValue), height, PAD_Y, true);
  const path = (points: readonly IvPoint[]): string =>
    points.map((point) => `${x(point.strikeValue).toFixed(2)},${y(point.ivValue).toFixed(2)}`).join(' ');
  return (
    <figure ref={figureRef} className="vx-smile" data-compact={compact ? 'true' : 'false'} data-testid="iv-smile">
      <svg
        className="vx-smile-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={label}
      >
        {series.calls.length > 1 ? <polyline className="vx-smile-line" data-right="CALL" points={path(series.calls)} /> : null}
        {series.puts.length > 1 ? <polyline className="vx-smile-line" data-right="PUT" points={path(series.puts)} /> : null}
        {all.map((point) => (
          <circle
            key={`${point.right}-${point.strike}`}
            className="vx-smile-dot"
            data-right={point.right}
            cx={x(point.strikeValue)}
            cy={y(point.ivValue)}
            r={compact ? 2.5 : 3.5}
          />
        ))}
      </svg>
      <figcaption className="vx-smile-caption">
        <span>
          strikes <code>{series.strikeMin}</code> → <code>{series.strikeMax}</code>
        </span>
        <span>
          IV <code>{series.ivMin}</code> → <code>{series.ivMax}</code>
        </span>
        <span>
          <span className="vx-smile-key" data-right="CALL" aria-hidden="true">●</span> calls {series.calls.length} ·{' '}
          <span className="vx-smile-key" data-right="PUT" aria-hidden="true">●</span> puts {series.puts.length}
          {series.absentCount > 0 ? ` · ${series.absentCount} sans IV` : ''}
        </span>
      </figcaption>
    </figure>
  );
}
