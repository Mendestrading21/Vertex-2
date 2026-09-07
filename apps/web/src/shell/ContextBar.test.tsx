/**
 * REFONTE UI 2026-09-05 — le contexte de travail a un témoin.
 *
 * `activeInstrument` était écrit par trois pages et lu par aucune : le bandeau
 * de contexte le montre désormais, et la page Options sans sous-jacent le
 * PROPOSE sans l'ouvrir à la place de l'utilisateur.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/render.tsx';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  // Hors ligne : le contexte ne dépend d'aucune donnée, seulement de l'adresse.
  fetchMock.mockRejectedValue(new TypeError('fetch failed'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContextBar — instrument actif', () => {
  it('sans instrument choisi, le bandeau ne montre aucune pilule (rien n’est inventé)', async () => {
    renderApp('/today');
    await screen.findByRole('heading', { level: 1, name: "Aujourd'hui" });
    expect(screen.queryByTestId('contextbar-instrument')).toBeNull();
  });

  it('l’instrument porté par l’adresse devient visible dans le bandeau, en lien vers son dossier', async () => {
    renderApp('/analysis/SYN-TECH-01');
    const pilule = await screen.findByTestId('contextbar-instrument');
    expect(pilule.textContent).toBe('SYN-TECH-01');
    expect(pilule.getAttribute('href')).toBe('/analysis/SYN-TECH-01');
    expect(within(screen.getByRole('banner')).getByTestId('contextbar-instrument')).toBeDefined();
  });

  it('Options sans sous-jacent PROPOSE la chaîne de l’instrument du contexte, sans l’ouvrir', async () => {
    const user = userEvent.setup();
    renderApp('/analysis/SYN-TECH-01');
    await screen.findByTestId('contextbar-instrument');
    await user.click(screen.getByRole('link', { name: 'Options' }));
    const raccourci = await screen.findByTestId('options-active-instrument');
    expect(raccourci.textContent).toContain('SYN-TECH-01');
    expect(within(raccourci).getByRole('link').getAttribute('href')).toBe('/options/SYN-TECH-01');
    // Aucune chaîne n'est demandée sans décision de l'utilisateur.
    expect(fetchMock.mock.calls.some(([entree]) => String(entree).includes('/v1/options/'))).toBe(false);
  });
});
