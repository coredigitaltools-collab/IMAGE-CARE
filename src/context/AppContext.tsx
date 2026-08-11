// ============================================================
// IMC-BLD-004 | ImageCare ERP Frontend Integration v1.0
// File: src/context/AppContext.tsx
// Purpose: Global application context.
//          Provides auth state, user context and active branch
//          to all components. Single source of truth for identity.
// ============================================================

import React, {
  createContext, useContext, useEffect, useState,
  useCallback, type ReactNode
} from 'react';
import { supabase } from '../lib/supabase';
import { login, logout, loadUserContext, onAuthStateChange } from '../services/auth/authService';
import type { UserContext } from '../types/app';
import type { UUID } from '../types/database';

// ---- Context shape -----------------------------------------

interface AppContextValue {
  // Auth state
  isLoading:        boolean;
  isAuthenticated:  boolean;
  userContext:      UserContext | null;

  // Active branch (user may switch branches if they have access)
  activeBranchId:   UUID | null;
  setActiveBranchId: (branchId: UUID) => void;

  // Auth actions
  signIn:  (email: string, password: string, businessId: UUID) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;

  // Refresh user context (call after permission changes)
  refreshUserContext: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// ---- Provider ----------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading]           = useState(true);
  const [userContext, setUserContext]        = useState<UserContext | null>(null);
  const [activeBranchId, setActiveBranchId] = useState<UUID | null>(null);

  const isAuthenticated = userContext !== null;

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session && mounted) {
          // Try to restore user context from local storage first
          const cached = sessionStorage.getItem('imc_user_context');
          if (cached) {
            const ctx = JSON.parse(cached) as UserContext;
            setUserContext(ctx);
            setActiveBranchId(ctx.branch_id);
          } else {
            // Reload from database
            // Business ID must be stored at login - read from session metadata
            const businessId = data.session.user.user_metadata?.business_id as UUID | undefined;
            if (businessId) {
              const ctx = await loadUserContext(businessId);
              if (ctx && mounted) {
                setUserContext(ctx);
                setActiveBranchId(ctx.branch_id);
                sessionStorage.setItem('imc_user_context', JSON.stringify(ctx));
              }
            }
          }
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    // Listen for auth state changes (token refresh, sign out)
    const subscription = onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setUserContext(null);
        setActiveBranchId(null);
        sessionStorage.removeItem('imc_user_context');
      }
      if (event === 'TOKEN_REFRESHED') {
        // Silently refresh - no state change needed
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (
    email: string,
    password: string,
    businessId: UUID
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await login({ email, password, business_id: businessId });
      if (!result.success || !result.user_context) {
        return { success: false, error: result.error?.message ?? 'Login failed.' };
      }
      setUserContext(result.user_context);
      setActiveBranchId(result.user_context.branch_id);
      sessionStorage.setItem('imc_user_context', JSON.stringify(result.user_context));
      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      if (userContext) {
        await logout(userContext.user_id, userContext.business_id);
      }
      setUserContext(null);
      setActiveBranchId(null);
      sessionStorage.removeItem('imc_user_context');
    } finally {
      setIsLoading(false);
    }
  }, [userContext]);

  const refreshUserContext = useCallback(async () => {
    if (!userContext) return;
    const ctx = await loadUserContext(userContext.business_id);
    if (ctx) {
      setUserContext(ctx);
      sessionStorage.setItem('imc_user_context', JSON.stringify(ctx));
    }
  }, [userContext]);

  const handleSetActiveBranch = useCallback((branchId: UUID) => {
    setActiveBranchId(branchId);
  }, []);

  return (
    <AppContext.Provider value={{
      isLoading,
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

// ---- Hook --------------------------------------------------

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// Convenience hook for just the user context (throws if not authenticated)
export function useUserContext(): UserContext {
  const { userContext } = useApp();
  if (!userContext) throw new Error('useUserContext called outside authenticated session');
  return userContext;
}

// Convenience hook for active branch
export function useActiveBranch(): UUID | null {
  return useApp().activeBranchId;
}
