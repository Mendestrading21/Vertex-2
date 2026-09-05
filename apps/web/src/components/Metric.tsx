import type { ReactNode } from 'react';

/**
 * Metric Block — « libellé, valeur, unité, période, méthode et état
 * accessibles. Tiret explicite pour absence ; raison visible pour valeur
 * bloquée. Aucun calcul, arrondi métier ou conversion d'unité non fourni par
 * le serveur. Variation positive/négative avec signe et texte, pas couleur
 * seule. » (`references/component-system.md`)
 *
 * La valeur est une CHAÎNE SERVEUR, déjà formatée ou seulement adaptée à la
 * virgule française par l'appelant. Ce composant ne parse rien, ne compare
 * rien et n'arrondit rien. Une absence est DITE « non publié » — jamais un
 * zéro, jamais un tiret ambigu.
 */
export interface MetricProps {
  readonly label: string;
  readonly value: string | null;
  readonly unit?: string;
  /** Sens financier, dérivé par l'appelant du SIGNE textuel de la chaîne servie. */
  readonly sign?: 'up' | 'down' | 'flat' | null;
  readonly note?: ReactNode;
  readonly absentLabel?: string;
  readonly testId?: string;
  /** `compact` pour une valeur longue (horodatage, identifiant) : lisible, pas spectaculaire. */
  readonly size?: 'display' | 'compact';
  /**
   * Libellé rendu aux seules technologies d'assistance.
   *
   * REFONTE UI 2026-09-05 — la « triple étiquette » : une carte qui porte UNE
   * mesure (Spot publié, Taux) écrivait kicker + titre + libellé pour le même
   * mot, et la tête pesait plus que la valeur. Le titre de la carte EST alors
   * le libellé ; celui-ci reste dans le document (`vx-visually-hidden`), jamais
   * supprimé : le nom accessible de la mesure ne dépend pas de la mise en page.
   */
  readonly labelHidden?: boolean;
}

export function Metric({
  label,
  value,
  unit,
  sign,
  note,
  absentLabel,
  testId,
  size = 'display',
  labelHidden = false,
}: MetricProps) {
  return (
    <div
      className="vx-metric"
      data-size={size}
      {...(sign === undefined || sign === null ? {} : { 'data-sign': sign })}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      <span className={labelHidden ? 'vx-metric-label vx-visually-hidden' : 'vx-metric-label'}>{label}</span>
      {value === null ? (
        <span className="vx-metric-value vx-cell-absent" role="img" aria-label={absentLabel ?? `${label} : non publié`}>
          non publié
        </span>
      ) : (
        <span className="vx-metric-value">
          {/*
            LA VALEUR EST BORNÉE AU RENDU, PAS L'UNITÉ.
            Le moteur publie ses flottants entiers : mesuré sur Risques, un
            Herfindahl servi fait vingt-huit chiffres —
            « 0.50208908615131055819803669… » — et il écrasait sa carte. La
            chaîne servie n'est PAS arrondie : seule sa largeur est bornée, et
            la valeur entière reste dans le `title`, donc au survol. L'unité
            vit hors de la boîte bornée : un nombre sans son unité n'est pas
            une information abrégée, c'est une information fausse.
          */}
          <span className="vx-metric-number" title={value}>
            {value}
          </span>
          {unit === undefined ? null : <span className="vx-metric-unit"> {unit}</span>}
        </span>
      )}
      {note === undefined ? null : <span className="vx-metric-note">{note}</span>}
    </div>
  );
}
