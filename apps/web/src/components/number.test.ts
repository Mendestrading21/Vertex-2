import { describe, expect, it } from 'vitest';

import { formatServedNumber, formatServedPercent, isAtomicMeasure } from './number.ts';

describe('formatServedNumber — séparateurs et signe, jamais un chiffre de moins', () => {
  it("groupe les milliers par apostrophe dès quatre chiffres, décimales verbatim", () => {
    expect(formatServedNumber('12845.20')).toBe("12'845.20");
    expect(formatServedNumber('1674.75')).toBe("1'674.75");
    expect(formatServedNumber('1234567')).toBe("1'234'567");
    expect(formatServedNumber('999.5')).toBe('999.5');
    expect(formatServedNumber('0.5261839014946787079529485756')).toBe(
      '0.5261839014946787079529485756',
    );
  });

  it('remplace le trait d’union par le signe moins typographique, garde le plus', () => {
    expect(formatServedNumber('-0.72')).toBe('−0.72');
    expect(formatServedNumber('+2.48')).toBe('+2.48');
    expect(formatServedNumber('-3731.5730453527934')).toBe("−3'731.5730453527934");
  });

  it('rend telle quelle toute chaîne qui n’est pas un nombre décimal simple', () => {
    for (const raw of ['22/24', '2026-09-04', 'SYN-TECH-01', '1e5', '12,5', '', 'n/a', '1.2.3']) {
      expect(formatServedNumber(raw)).toBe(raw);
    }
  });

  it('est idempotente', () => {
    const once = formatServedNumber('-12845.20');
    expect(formatServedNumber(once)).toBe(once);
  });

  it('pourcentage : le signe % est accolé, la chaîne non numérique reste intacte', () => {
    expect(formatServedPercent('2.48')).toBe('2.48%');
    expect(formatServedPercent('-0.72')).toBe('−0.72%');
    expect(formatServedPercent('non publié')).toBe('non publié');
  });
});

describe('isAtomicMeasure — mesure bornée ou libellé qui passe à la ligne', () => {
  it('une mesure : des chiffres, aucune espace — elle reste atomique', () => {
    for (const raw of [
      '319.97',
      '+2.48%',
      '−0.72%',
      '22/24',
      '2026-09-06T11:32:24Z',
      '0.50208908615131055819803669',
      '691200',
    ]) {
      expect(isAtomicMeasure(raw)).toBe(true);
    }
  });

  it('un libellé servi n’est jamais borné : il serait amputé, pas abrégé', () => {
    /*
      LES DEUX CAS MESURÉS LE 2026-09-06 sur la carte Identité d'Analyse :
      « Secteur non déclaré » était rendu « Secteur … » et
      « ibkr-trades-unadjusted » était rendu « ibkr-tra… ». Le texte entier
      n'existait plus que dans un `title`, donc hors d'atteinte au clavier.
    */
    for (const raw of [
      'Secteur non déclaré',
      'ibkr-trades-unadjusted',
      'VALID',
      'REAL',
      'USD',
      'NO_BENCHMARK_DECLARED',
      '',
      '   ',
    ]) {
      expect(isAtomicMeasure(raw)).toBe(false);
    }
  });

  it('les espaces de bordure ne décident de rien', () => {
    expect(isAtomicMeasure('  319.97  ')).toBe(true);
    expect(isAtomicMeasure('  VALID  ')).toBe(false);
  });
});
