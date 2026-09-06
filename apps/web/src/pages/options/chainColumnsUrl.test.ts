import { describe, expect, it } from 'vitest';

import {
  CHAIN_COLUMNS_DEFAULT,
  CHAIN_COLUMNS_MAX,
  chainColumnsFromParam,
  chainColumnsToParam,
} from './chainColumns.ts';

describe('colonnes de la chaîne dans l’URL — deny by default', () => {
  it('lit une sélection valide dans l’ordre du vocabulaire, ignore les clés inconnues', () => {
    expect(chainColumnsFromParam('iv,bid,inconnue')).toEqual(['bid', 'iv']);
  });

  it('retombe sur la sélection par défaut quand rien n’est lisible ou trop long', () => {
    expect(chainColumnsFromParam(null)).toBe(CHAIN_COLUMNS_DEFAULT);
    expect(chainColumnsFromParam('')).toBe(CHAIN_COLUMNS_DEFAULT);
    expect(chainColumnsFromParam('x,y')).toBe(CHAIN_COLUMNS_DEFAULT);
    const tooMany = Array.from({ length: CHAIN_COLUMNS_MAX + 1 }, (_, i) => `k${i}`).join(',');
    expect(chainColumnsFromParam(tooMany)).toBe(CHAIN_COLUMNS_DEFAULT);
  });

  it('n’écrit rien dans l’URL pour la sélection par défaut, une liste ordonnée sinon', () => {
    expect(chainColumnsToParam([...CHAIN_COLUMNS_DEFAULT])).toBeNull();
    expect(chainColumnsToParam(['iv', 'bid'])).toBe('bid,iv');
  });
});
