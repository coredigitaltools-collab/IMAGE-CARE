// ============================================================
// ImageCare ERP - Application Context
// File: src/context/AppContext.tsx
// Purpose: Global auth state, user context, active branch, and
//          daily-PIN lock state.
//
// SESSION RESTORATION ARCHITECTURE:
// When the app loads and finds a live Supabase session, it ALWAYS
// loads user context fresh from the backend (fn_get_user_context).
// sessionStorage is used only as a UI optimization - it provides
// an immediate render while the authoritative backend load is in
// progress. The backend result always replaces the cached value.
//
// This ensures that permission changes, branch-access changes,
// owner-status changes and account suspensions are reflected
// immediately on page refresh or re-login, and are never
// permanently trusted from stale session storage.
//
// Flow on app load:
//   1. Check Supabase session (authoritative - from Supabase Auth)
//   2. If session exists:
//      a. Show cached context immediately (UI optimization only)
//      b. Load fresh context from backend (always, unconditionally)
//      c. Replace cached context with fresh backend result
//      d. If backend load fails (suspended, deleted, etc.) -> sign out
//   3. If no session -> show login
//
// DAILY PIN LOCK ARCHITECTURE (additive - does not change any of
// the above):
// `isLocked` is a UI-only gate layered on top of an already-
// authenticated session. It never bypasses the fresh-context-reload
// principle above - locking never tears down the Supabase session
// or userContext, and unlocking re-runs refreshUserContext() so
// permission/suspension changes made while locked are still picked
// up immediately, exactly as a page refresh would.
//
//   - Cold start (app opened/reloaded) with a restored session and
//     an existing PIN -> isLocked starts TRUE. The PIN screen gates
//     rendering; nothing permission-sensitive renders until unlock.
//   - Cold start with no PIN configured yet -> isLocked stays
//     FALSE, but hasPin is FALSE, so the router sends the user to
//     PIN setup instead of the app (existing users are prompted for
//     a PIN after their next successful email/password login).
//   - A fresh signIn()/register() (the user just typed their full
//     credentials) always leaves isLocked FALSE - there is no
//     reason to immediately re-challenge with a PIN.
//   - lock() is the "Lock" action (distinct from signOut()): sets
//     isLocked TRUE only. Session and userContext are untouched.
//   - unlockWithPin() verifies against the server-side PIN hash,
//     then reloads context fresh, then clears isLocked.
//   - Full email/password sign-in remains available at any time
//     (Forgot PIN, new/unrecognized device, explicit sign out,
//     expired session) exactly as before - the PIN never weakens
//     or replaces it.
// ============================================================

import React, {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  login, logout, register, loadUserContext, onAuthStateChange,
  getMyBusinessId, hasPin as hasPinRpc, setPin as setPinRpc, verifyPin,
} from '../services/auth/authService';
import { verifyStaffPin } from '../services/settings/settingsService';
import { getStaffEffectivePermissions } from '../services/settings/rolePermissionsService';
import type { StaffEffectiveContext } from '../services/settings/rolePermissionsService';
import type { RegisterInput } from '../services/auth/authService';
import type { UserContext } from '../types/app';
import type { UUID } from '../types/database';

// ---- Active staff (PIN identification) shape ----------------
//
// Distinct from userContext: userContext is always the real, actually
// authenticated Supabase Auth user (the owner, on a shared device).
// activeStaff is a lightweight, PIN-verified overlay identifying which
// staff member is currently operating that already-authenticated
// session - see 0030_stage9_pin_staff.sql for the full design rationale.
// It is NOT a second real login and never changes auth.uid()/RLS - the
// database still sees every query as the owner.
//
// Bug fix (2026-09-05): it USED to be true that this was purely cosmetic
// (name/role in the header, which sidebar items show) and every app-level
// permission check (canDo(), including the ones already in
// services/sales/salesService.ts) still ran against the OWNER's own full
// permissions regardless of who was PIN-switched in - so a staff member
// could always do everything the owner could, however restrictive the
// owner's Settings looked. See
// claude/pos-staff-permission-enforcement-2026-09-05.md.
//
// That gap is now closed: switchToStaff() below also resolves the target
// staff member's OWN real permissions/branches (getStaffEffectivePermissions,
// reading the real permission_group_members/group_permissions/
// user_permissions tables) into activeStaffContext, and useUserContext()
// overlays those onto the permissions/branches/is_owner fields of the
// context every canDo() check reads - while user_id/business_id/branch_id/
// email stay the real authenticated owner's, since those still have to
// match auth.uid() for RLS and audit fields to keep working. The database
// itself is still only ever protected by RLS (keyed to the owner on a
// shared device) - this closes the app-level gap on top of that, it does
// not change what RLS allows.
export interface ActiveStaff {
  id: string;
  fullName: string;
  role: string;
}

// ---- Context shape -----------------------------------------

interface AppContextValue {
  isLoading:          boolean;
  // isContextStale: true while the cached context is shown but
  // the authoritative backend load has not yet completed.
  // Components must not make permission-gated API calls while stale.
  isContextStale:     boolean;
  isAuthenticated:    boolean;
  userContext:        UserContext | null;
  activeBranchId:     UUID | null;
  setActiveBranchId:  (branchId: UUID) => void;
  signIn:             (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register:           (input: RegisterInput) => Promise<{ success: boolean; error?: string }>;
  signOut:            () => Promise<void>;
  // Explicitly re-loads context from backend.
  // Call after the owner changes permissions, branch access, or account status.
  refreshUserContext: () => Promise<void>;

  // ---- Daily PIN lock state ---------------------------------
  // isLocked: true when authenticated but gated behind the PIN
  // unlock screen. hasPin: whether the current user has a PIN
  // configured at all (drives whether PIN setup is forced).
  isLocked:           boolean;
  hasPin:             boolean;
  lock:               () => void;
  unlockWithPin:      (pin: string) => Promise<{ success: boolean; error?: string; locked?: boolean }>;
  setPin:             (pin: string, confirmPin: string) => Promise<{ success: boolean; error?: string }>;
  refreshHasPin:      () => Promise<void>;

  // ---- Active staff (PIN switcher) ---------------------------
  activeStaff:        ActiveStaff | null;
  switchToStaff:      (staffId: string, pin: string) => Promise<{ success: boolean; error?: string; locked?: boolean }>;
  // Requires the OWNER's own daily unlock PIN (fn_verify_pin) - not the
  // staff PIN - so a staff member operating the till can't simply click
  // their way back into the owner's full access.
  switchBackToOwner:  (ownerPin: string) => Promise<{ success: boolean; error?: string; locked?: boolean }>;
}

const AppContext = createContext<AppContextValue | null>(null);

// ---- Session storage key -----------------------------------
const SESSION_KEY = 'imc_user_context';

function getCachedContext(): UserContext | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserContext) : null;
  } catch {
    return null;
  }
}

function setCachedContext(ctx: UserContext): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch {
    // sessionStorage write failure is non-fatal
  }
}

function clearCachedContext(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // non-fatal
  }
}

// ---- Active staff session storage ---------------------------
// Own key, separate from SESSION_KEY - survives a page refresh mid-shift
// (a staff member on a shared till reloading the page shouldn't silently
// bounce back to full owner access) but is explicitly cleared on lock()
// and signOut() below, since a shared device being locked or signed out
// is exactly when "who's currently identified" should reset.
const ACTIVE_STAFF_KEY = 'imc_active_staff';

function getCachedActiveStaff(): ActiveStaff | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_STAFF_KEY);
    return raw ? (JSON.parse(raw) as ActiveStaff) : null;
  } catch {
    return null;
  }
}

function setCachedActiveStaff(staff: ActiveStaff): void {
  try {
    sessionStorage.setItem(ACTIVE_STAFF_KEY, JSON.stringify(staff));
  } catch {
    // non-fatal
  }
}

function clearCachedActiveStaff(): void {
  try {
    sessionStorage.removeItem(ACTIVE_STAFF_KEY);
  } catch {
    // non-fatal
  }
}

// ---- Active staff EFFECTIVE PERMISSIONS session storage ------
// Cached alongside activeStaff (same lifecycle - written together in
// switchToStaff, cleared together everywhere activeStaff is cleared) so
// a page refresh mid-shift keeps enforcing the right permissions instead
// of silently falling back to either "locked out of everything" or,
// worse, the owner's full access.
const ACTIVE_STAFF_CONTEXT_KEY = 'imc_active_staff_context';

function getCachedActiveStaffContext(): StaffEffectiveContext | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_STAFF_CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as StaffEffectiveContext) : null;
  } catch {
    return null;
  }
}

function setCachedActiveStaffContext(context: StaffEffectiveContext): void {
  try {
    sessionStorage.setItem(ACTIVE_STAFF_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // non-fatal
  }
}

function clearCachedActiveStaffContext(): void {
  try {
    sessionStorage.removeItem(ACTIVE_STAFF_CONTEXT_KEY);
  } catch {
    // non-fatal
  }
}

// ---- Provider ----------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading]         = useState(true);
  const [isContextStale, setIsContextStale] = useState(false);
  const [userContext, setUserContext]      = useState<UserContext | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<UUID | null>(null);
  const [isLocked, setIsLocked]             = useState(false);
  const [hasPinState, setHasPinState]       = useState(false);
  const [activeStaff, setActiveStaff]       = useState<ActiveStaff | null>(() => getCachedActiveStaff());
  const [activeStaffContext, setActiveStaffContext] = useState<StaffEffectiveContext | null>(() => getCachedActiveStaffContext());
  const mountedRef = useRef(true);

  const isAuthenticated = userContext !== null;

  // ---- Authoritative context load ---------------------------
  // Always calls the backend. Replaces any cached state.
  // Signs out automatically if the account is suspended or deleted.
  const loadFreshContext = useCallback(async (
    businessId: UUID
  ): Promise<UserContext | null> => {
    const fresh = await loadUserContext(businessId);

    if (!mountedRef.current) return null;

    if (!fresh) {
      // Backend returned nothing - session is valid but user not found.
      // This can happen if the user was deleted or moved to another business.
      // Sign out and clear everything.
      await supabase.auth.signOut();
      setUserContext(null);
      setActiveBranchId(null);
      clearCachedContext();
      return null;
    }

    if (!fresh.is_active) {
      // Account has been suspended since last login.
      // Refuse the session regardless of what sessionStorage says.
      await supabase.auth.signOut();
      setUserContext(null);
      setActiveBranchId(null);
      clearCachedContext();
      return null;
    }

    // Fresh authoritative context - replace cache and state.
    setUserContext(fresh);
    setCachedContext(fresh);
    setIsContextStale(false);
    return fresh;
  }, []);

  // ---- App initialization -----------------------------------
  useEffect(() => {
    mountedRef.current = true;

    async function initAuth() {
      try {
        // Step 1: Check for a live Supabase session (authoritative).
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session) {
          // No live session - show login immediately.
          return;
        }

        // Step 2: A live session exists. Resolve business_id server-side
        // via fn_get_my_business_id() - derived from auth.uid(), never
        // asked of the user and never stored in auth metadata or the URL.
        // The cached context (if any) is used only for the instant-render
        // optimization in Step 3 below, never to determine which business
        // to authoritatively load.
        const cached = getCachedContext();
        const businessId = await getMyBusinessId();

        if (!businessId) {
          // Cannot determine which business this session belongs to.
          // Cannot load authoritative context - sign out.
          await supabase.auth.signOut();
          clearCachedContext();
          return;
        }

        // Step 3: If cached context exists, show it immediately as a
        // UI optimization while the authoritative load is in progress.
        // Mark context as stale so the app knows not to rely on it for
        // permission-gated calls yet.
        if (cached && mountedRef.current) {
          setUserContext(cached);
          setActiveBranchId(cached.branch_id);
          setIsContextStale(true);
        }

        // Step 4: ALWAYS load fresh context from the backend.
        // This is unconditional - the cache never bypasses this call.
        // Reflects: permission changes, branch-access changes,
        // owner-status changes, account suspension.
        const fresh = await loadFreshContext(businessId);

        if (fresh && mountedRef.current) {
          // Fresh context has been set by loadFreshContext.
          // Only update branch if not already set by the user.
          if (!activeBranchId) {
            setActiveBranchId(fresh.branch_id);
          }

          // Step 5: This is a restored session on a "trusted device"
          // (the browser already held a live Supabase session) - the
          // daily PIN screen gates the app rather than requiring the
          // user to type their password again. If no PIN is configured
          // yet, isLocked stays false and the router sends the user to
          // PIN setup instead (see RequireAuth in app/router.tsx).
          const userHasPin = await hasPinRpc();
          if (mountedRef.current) {
            setHasPinState(userHasPin);
            setIsLocked(userHasPin);
          }
        }

      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
          setIsContextStale(false);
        }
      }
    }

    initAuth();

    // Listen for Supabase auth state changes.
    const subscription = onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        setUserContext(null);
        setActiveBranchId(null);
        setIsContextStale(false);
        setIsLocked(false);
        setHasPinState(false);
        setActiveStaff(null);
        setActiveStaffContext(null);
        clearCachedContext();
        clearCachedActiveStaff();
        clearCachedActiveStaffContext();
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        // Token was refreshed silently. Reload context from backend
        // to pick up any permission or account-status changes that
        // occurred while the tab was in the background. business_id is
        // resolved server-side, same as initial load - never from
        // client-held metadata.
        const businessId = await getMyBusinessId();
        if (businessId) {
          await loadFreshContext(businessId);
        }
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
    // loadFreshContext is stable (useCallback with no deps that change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Sign in ----------------------------------------------
  // Full email + password authentication. No Business ID - it is
  // resolved server-side inside login() via fn_get_my_business_id().
  // A fresh sign-in always leaves the PIN unlocked (isLocked=false):
  // the user just proved full identity, so there is no reason to
  // immediately re-challenge with a PIN too.
  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await login({ email, password });

      if (!result.data?.user_context) {
        return { success: false, error: result.error?.message ?? 'Sign in failed.' };
      }

      const ctx = result.data.user_context;

      setUserContext(ctx);
      setActiveBranchId(ctx.branch_id);
      setIsContextStale(false);
      setCachedContext(ctx);
      setIsLocked(false);

      const userHasPin = await hasPinRpc();
      setHasPinState(userHasPin);

      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Register (first-time business signup) -----------------
  // Business Name + Owner Name + Email + Password only. Creates the
  // Supabase Auth account, the business, the owner user row, and
  // full owner permission grants (see fn_register_business). The
  // caller (RegisterPage) is expected to route the user to PIN
  // setup next - hasPin is false immediately after this succeeds.
  const registerBusiness = useCallback(async (
    input: RegisterInput
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await register(input);

      if (!result.data?.user_context) {
        return { success: false, error: result.error?.message ?? 'Registration failed.' };
      }

      const ctx = result.data.user_context;

      setUserContext(ctx);
      setActiveBranchId(ctx.branch_id);
      setIsContextStale(false);
      setCachedContext(ctx);
      setIsLocked(false);
      setHasPinState(false);

      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Sign out ---------------------------------------------
  // Terminates the session entirely. Distinct from lock(): signing
  // back in always requires full email + password, never just a PIN.
  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await logout();
      setUserContext(null);
      setActiveBranchId(null);
      setIsContextStale(false);
      setIsLocked(false);
      setHasPinState(false);
      setActiveStaff(null);
      setActiveStaffContext(null);
      clearCachedContext();
      clearCachedActiveStaff();
      clearCachedActiveStaffContext();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Refresh user context ---------------------------------
  // Explicitly re-loads from the backend.
  // Call after the owner changes permissions, branch access,
  // owner status, or account status for another user.
  const refreshUserContext = useCallback(async () => {
    if (!userContext) return;
    setIsContextStale(true);
    await loadFreshContext(userContext.business_id);
  }, [userContext, loadFreshContext]);

  // ---- Lock ---------------------------------------------------
  // The "Lock" action, distinct from Sign Out. Returns to the PIN
  // screen without touching the Supabase session or userContext -
  // this is the normal, expected daily action. Also clears any active
  // staff identification - a locked device shows the owner's own unlock
  // screen next, not a staff member's view, and unlocking always starts
  // from "owner" until the staff switcher is used again.
  const lock = useCallback(() => {
    setIsLocked(true);
    setActiveStaff(null);
    setActiveStaffContext(null);
    clearCachedActiveStaff();
    clearCachedActiveStaffContext();
  }, []);

  // ---- Unlock with PIN -----------------------------------------
  // Verifies the PIN server-side (rate-limited, temporary lockout
  // only - see fn_verify_pin). On success, reloads context fresh
  // from the backend before clearing the lock, so a permission or
  // suspension change made while locked is honored immediately,
  // consistent with the session-restoration principle above.
  const unlockWithPin = useCallback(async (
    pin: string
  ): Promise<{ success: boolean; error?: string; locked?: boolean }> => {
    const result = await verifyPin(pin);

    if (!result.success) {
      if (result.reason === 'LOCKED') {
        return { success: false, locked: true, error: 'Too many incorrect attempts. Try again later, or use email and password instead.' };
      }
      if (result.reason === 'NO_PIN_SET') {
        return { success: false, error: 'No PIN is set up for this account yet.' };
      }
      const remaining = result.attemptsRemaining;
      return {
        success: false,
        error: typeof remaining === 'number'
          ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect PIN.',
      };
    }

    if (userContext) {
      await loadFreshContext(userContext.business_id);
    }
    setIsLocked(false);
    return { success: true };
  }, [userContext, loadFreshContext]);

  // ---- Set / reset PIN ------------------------------------------
  // Used both for first-time PIN creation and for the Forgot PIN
  // reset path (the caller re-authenticates with email + password
  // before calling this - see ForgotPinPage). The old PIN is never
  // read back; it is simply overwritten server-side.
  const setPinValue = useCallback(async (
    pin: string,
    confirmPin: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await setPinRpc(pin, confirmPin);
    if (!result.success || result.error) {
      return { success: false, error: result.error?.message ?? 'Could not set PIN.' };
    }
    setHasPinState(true);
    setIsLocked(false);
    return { success: true };
  }, []);

  // ---- Refresh hasPin ------------------------------------------
  const refreshHasPin = useCallback(async () => {
    const userHasPin = await hasPinRpc();
    setHasPinState(userHasPin);
  }, []);

  // ---- Switch to staff (PIN identification) ---------------------
  // Verifies the staff member's PIN server-side (fn_verify_staff_pin -
  // rate-limited per staff row, same 5-attempts/30-minute pattern as the
  // owner's own unlock PIN). Does NOT touch auth.uid()/the real Supabase
  // session - it only records which staff member is now identified on
  // this already-authenticated device (see AppShell's Sidebar, which
  // hides Settings while a staff member is active).
  const switchToStaff = useCallback(async (
    staffId: string,
    pin: string
  ): Promise<{ success: boolean; error?: string; locked?: boolean }> => {
    const result = await verifyStaffPin(staffId, pin);

    if (!result.success) {
      if (result.reason === 'LOCKED') {
        return { success: false, locked: true, error: 'Too many incorrect attempts. Try again later.' };
      }
      if (result.reason === 'NO_PIN_SET') {
        return { success: false, error: 'No PIN has been set for this staff member yet.' };
      }
      if (result.reason === 'NOT_FOUND') {
        return { success: false, error: 'Staff member not found.' };
      }
      const remaining = result.attemptsRemaining;
      return {
        success: false,
        error: typeof remaining === 'number'
          ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect PIN.',
      };
    }

    const next: ActiveStaff = { id: result.staffId ?? staffId, fullName: result.fullName ?? '', role: result.role ?? '' };

    // Bug fix (2026-09-05): resolve this staff member's OWN real
    // permissions/branches (see the ActiveStaff interface comment above)
    // so useUserContext() can enforce them instead of the owner's full
    // access for the rest of this shift. Best-effort and fails safe: if
    // this lookup errors for any reason, activeStaffContext stays an
    // empty ("no access") map rather than silently falling back to the
    // owner's full access, which is the exact bug being fixed here.
    let effective: StaffEffectiveContext = { permissions: {}, branches: [], branch_id: null };
    if (userContext) {
      try {
        effective = await getStaffEffectivePermissions(userContext, next.id);
      } catch {
        // fail safe to no-access (the default above).
      }
    }

    setActiveStaff(next);
    setCachedActiveStaff(next);
    setActiveStaffContext(effective);
    setCachedActiveStaffContext(effective);
    return { success: true };
  }, [userContext]);

  // ---- Switch back to owner ---------------------------------------
  // Deliberately reuses the OWNER's own daily unlock PIN (fn_verify_pin -
  // the same one used to unlock the device each day), not a staff PIN -
  // this is the whole point of gating "switch back" at all: a staff
  // member using the till can identify themselves and be shown a
  // restricted view, but cannot self-escalate back to full owner access
  // just by clicking a button.
  const switchBackToOwner = useCallback(async (
    ownerPin: string
  ): Promise<{ success: boolean; error?: string; locked?: boolean }> => {
    const result = await verifyPin(ownerPin);

    if (!result.success) {
      if (result.reason === 'LOCKED') {
        return { success: false, locked: true, error: 'Too many incorrect attempts. Try again later, or use email and password instead.' };
      }
      const remaining = result.attemptsRemaining;
      return {
        success: false,
        error: typeof remaining === 'number'
          ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect PIN.',
      };
    }

    setActiveStaff(null);
    setActiveStaffContext(null);
    clearCachedActiveStaff();
    clearCachedActiveStaffContext();
    return { success: true };
  }, []);

  const handleSetActiveBranch = useCallback((branchId: UUID) => {
    setActiveBranchId(branchId);
  }, []);

  // ---- Effective user context (2026-09-05 permission enforcement fix) --
  // Every permission check in the app - useUserContext(), PermissionGuard/
  // PermissionButton/BranchGuard, AppShell's Sidebar, and every canDo()
  // call inside a service function that receives `ctx` from one of these
  // - reads whichever object is exposed here as `userContext`. Overlaying
  // the active staff member's own real permissions/branches/is_owner at
  // this single point, rather than in each consumer, is what makes every
  // one of those checks respect the PIN-switched staff member instead of
  // the owner automatically, with no other file needing to know this
  // overlay exists. business_id/user_id/branch_id/email are deliberately
  // NOT overridden - those still have to match the real authenticated
  // owner for RLS and created_by/audit fields to keep working, since the
  // database itself is still only ever protected by RLS keyed to auth.uid()
  // (the owner, on a shared device) - see the ActiveStaff interface
  // comment above for the full rationale.
  const effectiveUserContext: UserContext | null = React.useMemo(() => {
    if (!userContext) return null;
    // activeStaff cached from a session that started before this fix
    // shipped (or an in-flight switchToStaff() call) has no matching
    // activeStaffContext yet - falls back to the owner's context, i.e.
    // exactly the pre-fix behavior, rather than an abrupt full lockout
    // mid-shift the moment this deploys. Resolves itself on the next
    // staff switch, lock/unlock, or PIN re-entry.
    if (!activeStaff || !activeStaffContext) return userContext;
    return {
      ...userContext,
      permissions: activeStaffContext.permissions,
      branches: activeStaffContext.branches,
      is_owner: false,
    };
  }, [userContext, activeStaff, activeStaffContext]);

  return (
    <AppContext.Provider value={{
      isLoading,
      isContextStale,
      isAuthenticated,
      userContext: effectiveUserContext,
      activeBranchId,
      setActiveBranchId: handleSetActiveBranch,
      signIn,
      register: registerBusiness,
      isLocked,
      hasPin: hasPinState,
      lock,
      unlockWithPin,
      setPin: setPinValue,
      refreshHasPin,
      signOut,
      refreshUserContext,
      activeStaff,
      switchToStaff,
      switchBackToOwner,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// ---- Hooks -------------------------------------------------

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function useUserContext(): UserContext {
  const { userContext } = useApp();
  if (!userContext) throw new Error('useUserContext called outside authenticated session');
  return userContext;
}

export function useActiveBranch(): UUID | null {
  return useApp().activeBranchId;
}

// Bug fix (2026-09-07): "abdul a staff member is working but the receipt
// shows owner" - activeStaff has always been readable via useApp(), but no
// screen outside the header (AppShell/UserMenu's "Acting as X") ever read
// it, so every place that attributes a transaction to "whoever is at the
// till right now" (Sales receipts, Payroll approvals, etc.) fell back to
// the real authenticated user - which on this shared-device/single-login
// architecture is always the owner, never the PIN-switched staff member.
// A small dedicated hook (mirroring useActiveBranch above) so those
// screens don't each need the full useApp() surface just for this.
export function useActiveStaff(): ActiveStaff | null {
  return useApp().activeStaff;
}
