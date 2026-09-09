import type { ReactNode } from 'react';

import type { WidgetSize } from './Widget.tsx';

/**
 * LA CELLULE D'UN MODULE SUR UNE PLANCHE.
 *
 * POURQUOI ELLE EXISTE. Chaque page posait `data-module` sur un `<div>` nu,
 * et rien d'autre : la taille du catalogue (`size`) n'était lue par aucun
 * composant, donc `align-self: stretch` (réservé aux `L`/`XL` porteurs de
 * `data-size`, `widgets.css`) ne s'appliquait jamais aux dominantes, et la
 * densité de carte n'avait pas de porteur. Mesuré sur Options avant la
 * refonte : la chaîne — `XL` au catalogue — ne remplissait pas sa rangée.
 *
 * CE QU'ELLE POSE, ET RIEN D'AUTRE. Trois attributs de COMPOSITION :
 *   - `data-module` : l'identifiant du catalogue, cible de l'aire nommée ;
 *   - `data-size`   : le span déclaré par le catalogue (ADR-017 : une taille est
 *                     un span, jamais une apparence) ;
 *   - `data-density`: `compact` quand la page décide qu'une carte d'une valeur
 *                     ou d'absence n'a pas besoin du chrome d'une figure.
 * Elle ne rend aucune surface : la surface est celle de `Card`/`Widget`, la
 * composition celle de la grille de la page.
 *
 * `Widget` pose déjà `data-module` et `data-size` sur sa propre racine : un
 * module rendu par `Widget` n'a PAS besoin de cette cellule (deux porteurs de
 * `data-module` feraient compter le module deux fois par les e2e).
 */
export type ModuleDensity = 'compact';

export interface ModuleCellProps {
  readonly id: string;
  readonly size: WidgetSize;
  readonly density?: ModuleDensity;
  /** Classe de COMPOSITION de la page (ex. `vx-today-cell`). Jamais d'apparence. */
  readonly className?: string;
  readonly children: ReactNode;
}

export function ModuleCell({ id, size, density, className, children }: ModuleCellProps) {
  return (
    <div
      data-module={id}
      data-size={size}
      {...(density === undefined ? {} : { 'data-density': density })}
      {...(className === undefined ? {} : { className })}
    >
      {children}
    </div>
  );
}
