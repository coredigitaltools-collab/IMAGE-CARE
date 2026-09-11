// ============================================================
// File: src/__tests__/unit/theme.test.ts
// Purpose: Unit tests for src/lib/theme.ts - preference storage,
//          system-preference resolution, and applying data-theme to
//          <html>. Added while closing the CI coverage gate.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Each test gets a fresh module instance so the internal
// `currentPref`/`mediaListenerAttached` module state does not leak
// between tests (the module intentionally keeps that state private).
async function freshTheme() {
  vi.resetModules();
  return import('../../lib/theme');
}

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches,
    addEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  // theme.ts re-reads matchMedia(...).matches on every apply rather than
  // trusting the event payload, so the mock must update its own `matches`
  // before firing listeners for a simulated OS change to actually take.
  return {
    mql,
    fire: (m: boolean) => {
      mql.matches = m;
      listeners.forEach((cb) => cb({ matches: m }));
    },
  };
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initThemeFromCache defaults to system (resolved via matchMedia) when nothing is cached', async () => {
    mockMatchMedia(false);
    const { initThemeFromCache } = await freshTheme();
    initThemeFromCache();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('initThemeFromCache resolves system to dark when the OS prefers dark', async () => {
    mockMatchMedia(true);
    const { initThemeFromCache } = await freshTheme();
    initThemeFromCache();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('initThemeFromCache reads a valid cached preference', async () => {
    localStorage.setItem('imc_theme_pref', 'dark');
    mockMatchMedia(false);
    const { initThemeFromCache } = await freshTheme();
    initThemeFromCache();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('initThemeFromCache ignores an invalid cached value and falls back to system', async () => {
    localStorage.setItem('imc_theme_pref', 'not-a-real-pref');
    mockMatchMedia(false);
    const { initThemeFromCache } = await freshTheme();
    initThemeFromCache();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('initThemeFromCache falls back gracefully when localStorage throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    mockMatchMedia(false);
    const { initThemeFromCache } = await freshTheme();
    expect(() => initThemeFromCache()).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    getItem.mockRestore();
  });

  it('initThemeFromCache does not throw when matchMedia is unavailable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).matchMedia = undefined;
    const { initThemeFromCache } = await freshTheme();
    expect(() => initThemeFromCache()).not.toThrow();
    // Falls back to light rather than guessing dark - see systemPrefersDark().
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setThemePreference applies and persists an explicit choice', async () => {
    mockMatchMedia(false);
    const { setThemePreference } = await freshTheme();
    setThemePreference('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('imc_theme_pref')).toBe('dark');
  });

  it('setThemePreference("light") applies and persists light regardless of system', async () => {
    mockMatchMedia(true);
    const { setThemePreference } = await freshTheme();
    setThemePreference('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('imc_theme_pref')).toBe('light');
  });

  it('setThemePreference does not throw when localStorage.setItem throws', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    mockMatchMedia(false);
    const { setThemePreference } = await freshTheme();
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setItem.mockRestore();
  });

  it('live-updates the document when the OS theme changes while on "system"', async () => {
    const { mql, fire } = mockMatchMedia(false);
    const { setThemePreference } = await freshTheme();
    setThemePreference('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(mql.addEventListener).toHaveBeenCalled();
    fire(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('does not live-update when a specific (non-system) preference is active', async () => {
    const { fire } = mockMatchMedia(false);
    const { setThemePreference } = await freshTheme();
    setThemePreference('system');
    setThemePreference('light');
    fire(true); // OS switches to dark, but preference is explicitly 'light'
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
