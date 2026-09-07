/**
 * FORMAT D'AFFICHAGE D'UN NOMBRE SERVI — une seule règle pour tout le produit.
 *
 * DÉCISION PRODUIT (refonte vague 2, 2026-09-06, énoncé §9) : `12'845.20`,
 * `+2.48%`, `−0.72%`, `124 bps`, `18.4×`. Séparateur de milliers apostrophe
 * (convention suisse), point décimal, signe moins TYPOGRAPHIQUE (U+2212),
 * chiffres tabulaires par la classe `.vx-num`.
 *
 * CE QUE CETTE FONCTION NE FAIT PAS. Elle n'arrondit pas, ne tronque pas, ne
 * convertit pas en nombre JavaScript : chaque chiffre servi est rendu, dans
 * l'ordre, avec exactement les décimales publiées (`financial-safety.md`,
 * `.claude/rules/frontend.md`). Elle n'insère que des séparateurs et
 * remplace le trait d'union par le signe moins. Une chaîne qui n'est pas un
 * nombre décimal simple (date, fraction « 22/24 », identifiant, texte) est
 * rendue TELLE QUELLE : la fonction ne devine rien.
 *
 * Le `title` et le nom accessible gardent la chaîne servie verbatim là où
 * un recours à la valeur brute existe déjà.
 */

const DECIMAL = /^([+-]?)(\d+)(\.\d+)?$/;
const MINUS = '−';

/** Groupe la partie entière par trois, de la droite, dès quatre chiffres. */
function groupThousands(integer: string): string {
  if (integer.length < 4) {
    return integer;
  }
  const parts: string[] = [];
  for (let end = integer.length; end > 0; end -= 3) {
    parts.unshift(integer.slice(Math.max(0, end - 3), end));
  }
  return parts.join("'");
}

/**
 * Rend une chaîne servie au format d'affichage. Idempotente : une chaîne
 * déjà formatée (apostrophes, signe moins) n'est ni reconnue ni altérée.
 */
export function formatServedNumber(value: string): string {
  const match = DECIMAL.exec(value.trim());
  if (match === null) {
    return value;
  }
  const sign = match[1] ?? '';
  const integer = match[2] ?? '';
  const fraction = match[3] ?? '';
  const shownSign = sign === '-' ? MINUS : sign;
  return `${shownSign}${groupThousands(integer)}${fraction}`;
}

/**
 * Pourcentage : nombre servi + « % » accolé (`+2.48%`). La chaîne servie
 * porte déjà son signe quand le serveur l'a publié ; rien n'est ajouté.
 */
export function formatServedPercent(value: string): string {
  const formatted = formatServedNumber(value);
  return formatted === value.trim() && DECIMAL.exec(value.trim()) === null
    ? value
    : `${formatted}%`;
}

/**
 * UNE MESURE, OU UN LIBELLÉ ? La distinction décide de la mise en page.
 *
 * POURQUOI ELLE EXISTE. `.vx-metric-number` borne son contenu à 14ch et le
 * termine par une ellipse, avec la valeur entière dans le `title` : c'est le
 * bon compromis pour un Herfindahl de vingt-huit chiffres, qui écraserait sa
 * carte autrement. Mesuré le 2026-09-06 sur la pile live, ce même traitement
 * s'appliquait à des valeurs qui ne sont PAS des mesures : la carte Identité
 * d'Analyse rendait « Secteur … » pour « Secteur non déclaré » et
 * « ibkr-tra… » pour « ibkr-trades-unadjusted ». Un libellé servi amputé à
 * huit caractères n'est plus une donnée : il faut survoler pour le lire, ce
 * qui exclut le clavier, et rien à l'écran ne dit qu'il manque du texte.
 *
 * LA RÈGLE. Une mesure porte des chiffres et ne contient aucune espace —
 * l'unité vit hors de la boîte bornée. Tout le reste est un libellé, et un
 * libellé passe à la ligne plutôt que d'être coupé.
 *
 *   « 319.97 », « +2.48% », « 22/24 », « 2026-09-06T11:32:24Z » → mesure ;
 *   « ibkr-trades-unadjusted », « Secteur non déclaré », « VALID » → libellé.
 *
 * La porte e2e `unbroken-measure` ne vise que `.vx-metric-number` : un
 * libellé qui passe à la ligne ne la contredit pas, il sort de son périmètre.
 */
export function isAtomicMeasure(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return false;
  }
  return !/\s/.test(trimmed) && /\d/.test(trimmed);
}
