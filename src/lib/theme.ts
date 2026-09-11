// ============================================================
// ImageCare - Theme (Light / Dark / System) application
// File: src/lib/theme.ts
// Purpose: Single place that decides what `data-theme` attribute sits
//          on <html>, which is all src/index.css's and
//          src/styles/globals.css's `:root[data-theme="dark"]` blocks
//          key off - every component built from their tokens (the vast
//          majority of the app) re-themes automatically once this
//          attribute is set, no per-component code needed.
//
// Added 2026-09-07 ("appearance should be dark/light/standard mode").
// ============================================================

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'imc_theme_pref'

// The user's saved Appearance -> Theme preference lives in Supabase and
// is only reachable once authenticated (useAppearanceSettings() needs a
// real business_id via useUserContext()) - this localStorage copy is
// just a same-device cache of the last known value, read synchronously
// on startup so the app can paint the right theme immediately instead
// of flashing light-then-dark (or vice versa) while that real query is
// still loading. It also has to hold something reasonable for the
// pages that render before login (LoginPage etc, which never call
// useAppearanceSettings at all) - 'system' is the fallback there.
let currentPref: ThemePreference = 'system'
let mediaListenerAttached = false

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    // matchMedia unavailable (very old browser / non-browser test
    // environment) - default to light rather than guessing dark.
    return false
  }
}

function resolve(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref
}

function applyToDocument(pref: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', resolve(pref))
}

function attachSystemListenerOnce(): void {
  if (mediaListenerAttached) return
  mediaListenerAttached = true
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    // Live-updates the app if the OS/browser theme changes while the
    // user is on "System" - matches what "System" implies. Has no
    // effect while a specific Light/Dark preference is selected.
    mq.addEventListener('change', () => {
      if (currentPref === 'system') applyToDocument(currentPref)
    })
  } catch {
    // matchMedia unavailable - "System" just won't live-update; it
    // still resolves correctly on the next full page load.
  }
}

/** Call once, as early as possible (src/main.tsx, before React
 * renders), so the very first paint already has the right theme. */
export function initThemeFromCache(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') currentPref = raw
  } catch {
    // localStorage unavailable (private browsing, disabled storage) -
    // falls back to 'system', not fatal.
  }
  applyToDocument(currentPref)
  attachSystemListenerOnce()
}

/** Call whenever the real saved preference becomes known or changes -
 * on load, once useAppearanceSettings() resolves (see AppShell.tsx),
 * and immediately when the user picks a new option on the Appearance
 * settings page, so they see the effect right away rather than only
 * after Save. Re-applies the theme and refreshes the same-device cache
 * so the next page load starts from the right value. */
export function setThemePreference(pref: ThemePreference): void {
  currentPref = pref
  applyToDocument(pref)
  attachSystemListenerOnce()
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // Non-fatal - theme still applies for this session, it just won't
    // persist across a hard refresh until the real setting reloads.
  }
}
