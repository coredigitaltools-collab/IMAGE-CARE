// ============================================================
// ImageCare ERP - Forgot PIN Page
// File: src/features/auth/ForgotPinPage.tsx
// Purpose: PIN reset flow. Requires full email + password
//          reauthentication to verify the account before letting
//          the user create a new PIN. The old PIN is never read
//          back or recoverable - fn_set_pin only ever overwrites
//          the stored hash.
//
// This is a standalone reauth (uses the existing signIn(), same
// as LoginPage), so it does not depend on any existing session -
// it works identically whether the app is currently locked, fully
// signed out, or the session expired.
// ============================================================

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  pageStyle, cardStyle, fieldGroup, labelStyle, inputStyle,
  errorBoxStyle, primaryButtonStyle, brandBadgeStyle,
} from './authStyles';

export function ForgotPinPage() {
  const { signIn, userContext } = useApp();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState(userContext?.email ?? '');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim())    { setError('Email is required.'); return; }
    if (!password.trim()) { setError('Password is required.'); return; }

    setIsSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.success) {
        // Re-authenticated. Send them to PIN setup in "reset" mode -
        // fn_set_pin overwrites the existing hash; the old PIN is
        // never shown or recoverable.
        navigate('/setup-pin', { replace: true, state: { reset: true } });
      } else {
        setError(result.error ?? 'Could not verify your account. Please check your email and password.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={brandBadgeStyle}>IC</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            Reset your PIN
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Confirm your email and password to create a new PIN.
          </p>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="email">Email address</label>
            <input
              id="email" type="email" value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="you@example.com" autoComplete="email"
              style={inputStyle} disabled={isSubmitting} required
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="password">Password</label>
            <input
              id="password" type="password" value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              placeholder="Your password" autoComplete="current-password"
              style={inputStyle} disabled={isSubmitting} required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email || !password}
            style={primaryButtonStyle(!email || !password, isSubmitting)}
          >
            {isSubmitting ? 'Verifying...' : 'Verify and continue'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 20 }}>
          <Link to="/unlock" style={{ color: 'var(--color-primary-600)' }}>Back to PIN unlock</Link>
        </p>
      </div>
    </div>
  );
}
