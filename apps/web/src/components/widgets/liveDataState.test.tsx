/**
 * `liveDataStateOf` — LA dérivation des faits servis vers l'état de donnée.
 *
 * Ce que ces tests protègent : `live` ne s'obtient jamais sans une politique
 * temps réel SERVIE dans son budget SERVI ; une population synthétique,
 * théorique ou déclarée l'emporte sur tout ; un chargement ne qualifie rien ;
 * un module sans contenu est INDISPONIBLE, pas « prêt ».
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Widget } from './Widget.tsx';
import { REALTIME_POLICY_KINDS, liveDataStateOf } from './LiveDataIndicator.tsx';

describe('liveDataStateOf — faits servis → état nommé', () => {
  it('LIVE exige une politique temps réel, un âge et un budget servis, âge ≤ budget', () => {
    expect(
      liveDataStateOf({ moduleState: 'ready', policyKind: 'intraday_quote', ageSeconds: 3, budgetSeconds: 5 }),
    ).toBe('live');
    // Hors budget : périmé, même sous politique temps réel.
    expect(
      liveDataStateOf({ moduleState: 'ready', policyKind: 'intraday_quote', ageSeconds: 9, budgetSeconds: 5 }),
    ).toBe('stale');
    // Sans budget servi : rien ne prouve l'instant → publié, jamais live.
    expect(liveDataStateOf({ moduleState: 'ready', policyKind: 'intraday_quote', ageSeconds: 3 })).toBe('published');
    // Sans âge servi : idem.
    expect(liveDataStateOf({ moduleState: 'ready', policyKind: 'intraday_quote', budgetSeconds: 5 })).toBe('published');
    // Une politique quotidienne dans son budget n'est pas « en cours ».
    expect(
      liveDataStateOf({ moduleState: 'ready', policyKind: 'daily_bar', ageSeconds: 3, budgetSeconds: 259200 }),
    ).toBe('published');
    expect(REALTIME_POLICY_KINDS.has('daily_bar')).toBe(false);
  });

  it('la population l’emporte : synthétique, théorique, déclarée', () => {
    expect(liveDataStateOf({ moduleState: 'ready', population: 'SYNTHETIC', policyKind: 'intraday_quote', ageSeconds: 1, budgetSeconds: 5 })).toBe('simulated');
    expect(liveDataStateOf({ moduleState: 'ready', population: 'DEMO' })).toBe('simulated');
    expect(liveDataStateOf({ moduleState: 'ready', population: 'THEORETICAL' })).toBe('theoretical');
    expect(liveDataStateOf({ moduleState: 'ready', population: 'USER_DECLARED' })).toBe('manual');
    expect(liveDataStateOf({ moduleState: 'stale', population: 'SYNTHETIC' })).toBe('simulated');
  });

  it('les états de module se traduisent sans se confondre', () => {
    expect(liveDataStateOf({ moduleState: 'delayed' })).toBe('delayed');
    expect(liveDataStateOf({ moduleState: 'ready', population: 'DELAYED' })).toBe('delayed');
    expect(liveDataStateOf({ moduleState: 'stale' })).toBe('stale');
    expect(liveDataStateOf({ moduleState: 'partial' })).toBe('degraded');
    expect(liveDataStateOf({ moduleState: 'closed' })).toBe('closed');
    expect(liveDataStateOf({ moduleState: 'refreshing', population: 'REAL' })).toBe('published');
  });

  it('un module sans contenu est INDISPONIBLE ; un chargement ne qualifie rien', () => {
    for (const moduleState of ['auth-required', 'error', 'offline', 'empty'] as const) {
      expect(liveDataStateOf({ moduleState })).toBe('unavailable');
    }
    expect(liveDataStateOf({ moduleState: 'loading' })).toBeNull();
  });
});

describe('Widget — la ligne de méta ouvre sur l’état canonique', () => {
  it('une clôture quotidienne réelle dans son budget dit PUBLIÉ, jamais EN COURS', () => {
    render(
      <Widget
        id="m"
        size="S"
        title="T"
        state="ready"
        served={{ asOf: '2026-09-04T00:00:00Z', ageSeconds: 3600, budgetSeconds: 259200, policyKind: 'daily_bar', population: 'REAL', snapshotVersion: 7 }}
      >
        <p>x</p>
      </Widget>,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('data-state')).toBe('published');
    expect(status.textContent).toContain('PUBLIÉ');
    expect(document.body.textContent).not.toContain('EN COURS');
    // La nature reconnue n'est plus doublée par une pastille brute.
    expect(screen.queryByText('REAL')).toBeNull();
  });

  it('une population synthétique dit SYNTHÉTIQUE dans la méta', () => {
    render(
      <Widget id="m" size="S" title="T" state="ready" served={{ asOf: null, ageSeconds: 10, population: 'SYNTHETIC' }}>
        <p>x</p>
      </Widget>,
    );
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('simulated');
  });

  it('une nature non déclarée garde son avertissement à côté de l’état', () => {
    render(
      <Widget id="m" size="S" title="T" state="ready" served={{ asOf: null }}>
        <p>x</p>
      </Widget>,
    );
    expect(screen.getByText(/NATURE NON DÉCLARÉE/)).toBeDefined();
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('published');
  });
});
