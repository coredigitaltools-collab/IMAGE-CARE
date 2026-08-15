// ============================================================
// ImageCare ERP - Application Context
// File: src/context/AppContext.tsx
// Purpose: Global auth state, user context and active branch.
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
// ============================================================

import React, {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { login, logout, loadUserContext, onAuthStateChange } from '../services/auth/authService';
import type { UserContext } from '../types/app';
import type { UUID } from '../types/database';

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
  signIn:             (email: string, password: string, businessId: UUID) => Promise<{ success: boolean; error?: string }>;
  signOut:            () => Promise<void>;
  // Explicitly re-loads context from backend.
  // Call after the owner changes permissions, branch access, or account status.
  refreshUserContext: () => Promise<void>;
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

// ---- Provider ----------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading]         = useState(true);
  const [isContextStale, setIsContextStale] = useState(false);
  const [userContext, setUserContext]      = useState<UserContext | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<UUID | null>(null);
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

        // Step 2: A live session exists. Determine business_id.
        // business_id is stored in the session user metadata at login time,
        // or can be read from the cached context if available.
        const cached = getCachedContext();
        const businessId = (
          sessionData.session.user.user_metadata?.business_id
          ?? cached?.business_id
        ) as UUID | undefined;

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
        clearCachedContext();
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        // Token was refreshed silently. Reload context from backend
        // to pick up any permission or account-status changes that
        // occurred while the tab was in the background.
        const sessionObj = session as { user?: { user_metadata?: { business_id?: string } } } | null;
        const businessId = sessionObj?.user?.user_metadata?.business_id
          ?? userContext?.business_id;
        if (businessId) {
          await loadFreshContext(businessId as UUID);
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
  const signIn = useCallback(async (
    email: string,
    password: string,
    businessId: UUID
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await login({ email, password, business_id: businessId });

      if (!result.data?.user_context) {
        return { success: false, error: result.error?.message ?? 'Sign in failed.' };
      }

      const ctx = result.data.user_context;

      // Store business_id in Supabase auth user metadata so session
      // restoration can find it without relying solely on sessionStorage.
      await supabase.auth.updateUser({
        data: { business_id: businessId },
      }).catch(() => null); // non-fatal if this fails

      setUserContext(ctx);
      setActiveBranchId(ctx.branch_id);
      setIsContextStale(false);
      setCachedContext(ctx);

      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Sign out ---------------------------------------------
  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await logout();
      setUserContext(null);
      setActiveBranchId(null);
      setIsContextStale(false);
      clearCachedContext();
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

  const handleSetActiveBranch = useCallback((branchId: UUID) => {
    setActiveBranchId(branchId);
  }, []);

  return (
    <AppContext.Provider value={{
      isLoading,
      isContextStale,
      isAuthenticated,
      userContext,
      activeBranchId,
      setActiveBranchId: handleSetActiveBranch,
      signIn,
      signOut,
      refreshUserContext,
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
