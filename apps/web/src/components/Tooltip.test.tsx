import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TOOLTIP_MARGIN, Tooltip, positionTooltip } from './Tooltip.tsx';

const VIEWPORT = { width: 1280, height: 800 } as const;
const BUBBLE = { width: 200, height: 40 } as const;

describe('positionTooltip — bornée à l’écran', () => {
  it('garde le côté demandé quand il tient, centrée sur le déclencheur', () => {
    const p = positionTooltip({ left: 500, top: 300, width: 100, height: 20 }, BUBBLE, VIEWPORT, 'top');
    expect(p).toEqual({ left: 450, top: 300 - 40 - TOOLTIP_MARGIN, placement: 'top' });
  });

  it('bascule sur le côté opposé quand le côté demandé sort de l’écran', () => {
    const p = positionTooltip({ left: 500, top: 10, width: 100, height: 20 }, BUBBLE, VIEWPORT, 'top');
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(10 + 20 + TOOLTIP_MARGIN);
    const droite = positionTooltip({ left: 1200, top: 300, width: 60, height: 20 }, BUBBLE, VIEWPORT, 'right');
    expect(droite.placement).toBe('left');
    expect(droite.left).toBe(1200 - 200 - TOOLTIP_MARGIN);
  });

  it('ramène la bulle dans l’écran quand aucun des deux côtés ne tient', () => {
    // Déclencheur collé au bord gauche : centrer déborde à gauche des deux côtés.
    const p = positionTooltip({ left: 0, top: 300, width: 20, height: 20 }, BUBBLE, VIEWPORT, 'top');
    expect(p.left).toBe(TOOLTIP_MARGIN);
    expect(p.placement).toBe('top');
    // Viewport minuscule : la bulle ne sort jamais, même si elle ne tient pas.
    const q = positionTooltip({ left: 0, top: 0, width: 10, height: 10 }, BUBBLE, { width: 100, height: 30 }, 'bottom');
    expect(q.left).toBe(TOOLTIP_MARGIN);
    expect(q.top).toBe(TOOLTIP_MARGIN);
  });
});

describe('Tooltip — une bulle, reliée, clavier', () => {
  it('relie la bulle au déclencheur par aria-describedby et la garde dans l’arbre, masquée', () => {
    render(
      <Tooltip content="Volatilité implicite servie par le worker." tabbable>
        IV
      </Tooltip>,
    );
    const bulle = screen.getByRole('tooltip', { hidden: true });
    expect(bulle.hidden).toBe(true);
    expect(bulle.textContent).toBe('Volatilité implicite servie par le worker.');
    const declencheur = bulle.parentElement;
    expect(declencheur?.getAttribute('aria-describedby')).toBe(bulle.id);
    expect(declencheur?.getAttribute('tabindex')).toBe('0');
  });

  it('s’ouvre au focus clavier, se ferme à Échap sans quitter le déclencheur, puis au blur', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Définition." tabbable>
        Delta
      </Tooltip>,
    );
    const bulle = screen.getByRole('tooltip', { hidden: true });
    await user.tab();
    expect(bulle.hidden).toBe(false);
    expect(document.activeElement).toBe(bulle.parentElement);
    await user.keyboard('{Escape}');
    expect(bulle.hidden).toBe(true);
    expect(document.activeElement).toBe(bulle.parentElement);
    await user.tab();
    expect(bulle.hidden).toBe(true);
  });

  it('s’ouvre au focus d’un descendant sans être elle-même tabulable', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Cocher pour afficher la colonne.">
        <label>
          <input type="checkbox" /> Bid
        </label>
      </Tooltip>,
    );
    const bulle = screen.getByRole('tooltip', { hidden: true });
    expect(bulle.parentElement?.hasAttribute('tabindex')).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('checkbox'));
    expect(bulle.hidden).toBe(false);
  });

  it('s’ouvre au survol et se ferme quand le pointeur sort', async () => {
    const user = userEvent.setup();
    render(<Tooltip content="Provenance.">12.5</Tooltip>);
    const bulle = screen.getByRole('tooltip', { hidden: true });
    const declencheur = bulle.parentElement as HTMLElement;
    await user.hover(declencheur);
    expect(bulle.hidden).toBe(false);
    expect(bulle.getAttribute('data-placement')).toBe('top');
    await user.unhover(declencheur);
    expect(bulle.hidden).toBe(true);
  });
});
