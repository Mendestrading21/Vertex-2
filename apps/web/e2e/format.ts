/**
 * Format d'affichage des nombres servis — miroir TEST de
 * `src/components/number.ts` (décision produit, refonte vague 2) : apostrophe
 * des milliers dès quatre chiffres, point décimal, signe moins typographique,
 * pourcentage accolé. Dupliqué ici pour que les parcours e2e restent sans
 * import du code applicatif ; un test unitaire garde la règle côté source.
 */
const DECIMAL = /^([+-]?)(\d+)(\.\d+)?$/;

export function displayNumber(value: string): string {
  const match = DECIMAL.exec(value.trim());
  if (match === null) {
    return value;
  }
  const sign = match[1] === '-' ? '−' : (match[1] ?? '');
  const integer = match[2] ?? '';
  const fraction = match[3] ?? '';
  const parts: string[] = [];
  for (let end = integer.length; end > 0; end -= 3) {
    parts.unshift(integer.slice(Math.max(0, end - 3), end));
  }
  const grouped = integer.length < 4 ? integer : parts.join("'");
  return `${sign}${grouped}${fraction}`;
}

export function displayPercent(value: string): string {
  return DECIMAL.exec(value.trim()) === null ? value : `${displayNumber(value)}%`;
}
