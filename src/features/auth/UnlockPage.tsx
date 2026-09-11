// ============================================================
// ImageCare ERP - Daily PIN Unlock Page
// File: src/features/auth/UnlockPage.tsx
// Purpose: "Welcome back" quick-unlock screen shown when a
//          trusted device already holds a live, authenticated
//          Supabase session (isAuthenticated) but the app is
//          locked (isLocked). Entering the correct PIN unlocks
//          the app WITHOUT re-entering email/password - the PIN
//          is a convenience layer on top of the existing session,
//          never a replacement for it.
//
// "Use email and password instead" and "Forgot PIN?" both remain
// available at all times, satisfying the requirement that full
// email/password authentication is always a working fallback,
// even while PIN attempts are rate-limited/locked.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  pageStyle, cardStyle, errorBoxStyle, primaryButtonStyle, brandBadgeStyle,
} from './authStyles';

const PIN_LENGTH = 4;

export function UnlockPage() {
  const { isAuthenticated, isLoading, isLocked, userContext, unlockWithPin, signOut } = useApp();
  const navigate = useNavigate();

  const [pinDigits, setPinDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    if (!isLocked) { navigate('/dashboard', { replace: true }); }
  }, [isAuthenticated, isLoading, isLocked, navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function attemptUnlock(pin: string) {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await unlockWithPin(pin);
      if (result.success) {
        navigate('/dashboard', { replace: true });
        return;
      }
      setError(result.error ?? 'Incorrect PIN.');
      setIsLockedOut(Boolean(result.locked));
      setPinDigits('');
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPinDigits(digits);
    setError(null);
    if (digits.length === PIN_LENGTH && !isSubmitting && !isLockedOut) {
      void attemptUnlock(digits);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pinDigits.length === PIN_LENGTH && !isSubmitting) {
      void attemptUnlock(pinDigits);
    }
  }

  const fullName = userContext
    ? `${userContext.first_name ?? ''} ${userContext.last_name ?? ''}`.trim()
    : '';

  if (isLoading) {
    return (
      <div style={pageStyle}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={brandBadgeStyle}>IC</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Welcome back{fullName ? `, ${fullName}` : ''}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            Enter your 4 digit PIN
          </p>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ position: 'relative', height: 24, marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18, height: '100%', alignItems: 'center' }}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: i < pinDigits.length ? 'var(--color-primary-600)' : 'var(--color-border-dark)',
                    transition: 'background-color 0.15s ease',
                  }}
                />
              ))}
            </div>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              value={pinDigits}
              onChange={handleChange}
              aria-label="Enter your 4 digit PIN"
              disabled={isSubmitting || isLockedOut}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                opacity: 0, cursor: isLockedOut ? 'not-allowed' : 'text', border: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isLockedOut || pinDigits.length !== PIN_LENGTH}
            style={primaryButtonStyle(isLockedOut || pinDigits.length !== PIN_LENGTH, isSubmitting)}
          >
            {isSubmitting ? 'Checking...' : 'Unlock'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to="/forgot-pin" style={{ fontSize: 13, color: 'var(--color-primary-600)' }}>
            Forgot PIN?
          </Link>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--color-primary-600)', cursor: 'pointer' }}
          >
            Use email and password instead
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer', marginTop: 8 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
