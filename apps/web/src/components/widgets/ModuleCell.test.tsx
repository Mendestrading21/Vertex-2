import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModuleCell } from './ModuleCell.tsx';

describe('ModuleCell — trois attributs de composition, aucune surface', () => {
  it('pose data-module, data-size et, sur demande, data-density', () => {
    const { container } = render(
      <ModuleCell id="spot" size="S" density="compact" className="vx-today-cell">
        <p>corps</p>
      </ModuleCell>,
    );
    const cellule = container.firstElementChild;
    expect(cellule?.getAttribute('data-module')).toBe('spot');
    expect(cellule?.getAttribute('data-size')).toBe('S');
    expect(cellule?.getAttribute('data-density')).toBe('compact');
    expect(cellule?.className).toBe('vx-today-cell');
    expect(cellule?.textContent).toBe('corps');
  });

  it('sans densité ni classe, ne pose ni attribut vide ni classe vide', () => {
    const { container } = render(
      <ModuleCell id="chain" size="XL">
        <p>corps</p>
      </ModuleCell>,
    );
    const cellule = container.firstElementChild;
    expect(cellule?.hasAttribute('data-density')).toBe(false);
    expect(cellule?.hasAttribute('class')).toBe(false);
  });
});
