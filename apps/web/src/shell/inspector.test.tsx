import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INSPECTOR_SLOT_ID, InspectorPanel } from './inspector.tsx';

/**
 * Le panneau est monté par PORTAIL dans un nœud du shell : sans ce nœud, il ne
 * rend rien. Les tests le posent eux-mêmes plutôt que de monter tout le shell.
 */
beforeEach(() => {
  const slot = document.createElement('div');
  slot.id = INSPECTOR_SLOT_ID;
  document.body.appendChild(slot);
});

afterEach(() => {
  document.getElementById(INSPECTOR_SLOT_ID)?.remove();
});

describe('InspectorPanel — un seul en-tête, une seule fermeture', () => {
  it('nomme le panneau « Inspecteur — <sujet> » et rend le sujet seul à l’écran', () => {
    render(
      <InspectorPanel subject="AAPL" note="Secteur non déclaré">
        <p>contenu</p>
      </InspectorPanel>,
    );
    const titre = screen.getByRole('heading', { level: 2 });
    expect(titre.getAttribute('aria-label')).toBe('Inspecteur — AAPL');
    expect(titre.textContent).toBe('AAPL');
    expect(screen.getByText('Secteur non déclaré')).toBeDefined();
  });

  it('ne rend « Fermer » que si la page sait fermer', () => {
    const { unmount } = render(
      <InspectorPanel subject="Carte des marchés">
        <p>contenu</p>
      </InspectorPanel>,
    );
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();
    unmount();

    const onClose = vi.fn();
    render(
      <InspectorPanel subject="AAPL" onClose={onClose}>
        <p>contenu</p>
      </InspectorPanel>,
    );
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDefined();
  });

  it('Échap ferme depuis n’importe quel élément du panneau, comme le bouton', async () => {
    // Mesuré sur la pile en direct : Échap ne refermait que l'inspecteur
    // d'Options. La touche est désormais portée par le panneau partagé, donc
    // par les neuf inspecteurs à la fois.
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <InspectorPanel subject="AAPL" onClose={onClose}>
        <button type="button">Envoyer au Simulateur</button>
      </InspectorPanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Envoyer au Simulateur' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ne confisque pas Échap hors du panneau', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button type="button">Inspecter AAPL</button>
        <InspectorPanel subject="AAPL" onClose={onClose}>
          <p>contenu</p>
        </InspectorPanel>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Inspecter AAPL' }));
    await user.keyboard('{Escape}');
    // Le focus est resté dans la table : la touche appartient à ce que
    // l'utilisateur regarde, pas au panneau ouvert à côté.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sans onClose, Échap dans le panneau ne casse rien', async () => {
    const user = userEvent.setup();
    render(
      <InspectorPanel subject="Carte des marchés">
        <button type="button">Voir la méthode</button>
      </InspectorPanel>,
    );
    await user.click(screen.getByRole('button', { name: 'Voir la méthode' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Carte des marchés');
  });
});
