// ============================================================
// File: src/__tests__/unit/registerServiceWorker.test.ts
// Purpose: Unit tests for src/lib/registerServiceWorker.ts - the PWA
// installability service worker registration added 2026-09-12. Covers:
// registering at the correct base-relative path on window `load`, never
// throwing when the browser has no serviceWorker support, and swallowing
// a registration failure rather than surfacing it.
//
// Listeners are captured via a spy and invoked directly (rather than
// dispatching a real 'load' event on `window`) so a leftover listener from
// one test can never also fire - and double-count - in the next one.
//
// jsdom has no Service Worker API at all, so `navigator.serviceWorker` is
// simply absent by default (the property key itself doesn't exist) - the
// "unsupported browser" case is simulated with `delete`, not by setting
// the value to `undefined` (that would still leave the key present, which
// `'serviceWorker' in navigator` - what the source checks - treats as
// "supported").
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerServiceWorker } from '../../lib/registerServiceWorker';

describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as any).serviceWorker;
  });

  it('does nothing (and never throws) when the browser has no serviceWorker support', () => {
    delete (navigator as any).serviceWorker;
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    expect(() => registerServiceWorker()).not.toThrow();
    // No 'load' listener should be added if there's nothing to register.
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('registers sw.js at the Vite base URL once the page has loaded', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    registerServiceWorker();
    const loadHandler = addEventListenerSpy.mock.calls.find(([event]) => event === 'load')?.[1] as (() => void) | undefined;
    expect(loadHandler).toBeTypeOf('function');

    // Registration is deferred to 'load', not immediate.
    expect(register).not.toHaveBeenCalled();
    loadHandler!();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sw.js`);
  });

  it('swallows a registration failure instead of throwing or rejecting unhandled', async () => {
    const register = vi.fn().mockRejectedValue(new Error('registration blocked'));
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    registerServiceWorker();
    const loadHandler = addEventListenerSpy.mock.calls.find(([event]) => event === 'load')?.[1] as (() => void) | undefined;
    expect(() => loadHandler!()).not.toThrow();
    // Let the rejected promise's .catch(() => {}) run.
    await Promise.resolve();
    await Promise.resolve();
  });
});
