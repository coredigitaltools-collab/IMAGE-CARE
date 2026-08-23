// ============================================================
// ImageCare ERP - Login Page
// File: src/features/auth/LoginPage.tsx
// Purpose: Authentication screen. Establishes identity.
//          Business ID is never shown or entered here - it is
//          resolved server-side from the authenticated account
//          (see fn_get_my_business_id in 0020_stage7_pin_auth.sql).
//          Authentication does NOT determine authorization.
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import {
  pageStyle, cardStyle, fieldGroup, labelStyle, inputStyle,
  errorBoxStyle, noticeBoxStyle, primaryButtonStyle, brandBadgeStyle,
} from './authStyles';

export function LoginPage() {
  const { signIn, isAuthenticated, isLoading, isLocked, hasPin } = useApp();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [notice,      setNotice]      = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Redirect if already fully authenticated. A user who is
  // authenticated-but-locked (isLocked) intentionally does NOT get
  // redirected here - "Use email and password instead" on the PIN
  // unlock screen sends them to this exact page, and it must render
  // the form rather than immediately bouncing them back.
  useEffect(() => {
    if (isAuthenticated && !isLoading && !isLocked) {
      navigate(hasPin ? '/dashboard' : '/setup-pin', { replace: true });
    }
  }, [isAuthenticated, isLoading, isLocked, hasPin, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    // Basic field validation
    if (!email.trim())      { setError('Email is required.'); return; }
    if (!password.trim())   { setError('Password is required.'); return; }

    setIsSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result.success) {
        // Navigation happens via the isAuthenticated effect above, once
        // hasPin has resolved, so the user lands on PIN setup (no PIN
        // yet) or the dashboard (PIN already configured) correctly.
      } else {
        setError(result.error ?? 'Sign in failed. Please check your credentials.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email address above first, then click "Forgot password?".');
      return;
    }
    setIsSendingReset(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim());
    } catch {
      // Intentionally fall through - see notice below.
    } finally {
      setIsSendingReset(false);
      // Same message whether or not the account exists, so the form
      // never confirms/denies which emails are registered.
      setNotice('If an account exists for that email, a password reset link has been sent.');
    }
  }

  if (isLoading) {
    return (
      <div style={pageStyle}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Checking session...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Card */}
      <div style={cardStyle}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={brandBadgeStyle}>
            IC
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            ImageCare ERP
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            Sign in to your business account
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={errorBoxStyle}>
            {error}
          </div>
        )}

        {/* Notice (e.g. password reset sent) */}
        {notice && !error && (
          <div style={noticeBoxStyle}>
            {notice}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); setNotice(null); }}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
              disabled={isSubmitting}
              required
            />
          </div>

          <div style={fieldGroup}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <label style={labelStyle} htmlFor="password">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isSendingReset}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontSize: 12, color: 'var(--color-primary-600)',
                  cursor: isSendingReset ? 'wait' : 'pointer',
                }}
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); setNotice(null); }}
              placeholder="Your password"
              autoComplete="current-password"
              style={inputStyle}
              disabled={isSubmitting}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email || !password}
            style={primaryButtonStyle(!email || !password, isSubmitting)}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 20 }}>
          New business?{' '}
          <Link to="/register" style={{ color: 'var(--color-primary-600)', fontWeight: 500 }}>
            Create an account
          </Link>
        </p>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 16 }}>
          ImageCare ERP v1.0
        </p>
      </div>
    </div>
  );
}

// Styles are shared with the other auth screens - see ./authStyles.ts
