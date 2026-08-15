// ============================================================
// ImageCare ERP - Login Page
// File: src/features/auth/LoginPage.tsx
// Purpose: Authentication screen. Establishes identity.
//          Business ID is loaded from the authenticated user record.
//          Authentication does NOT determine authorization.
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

export function LoginPage() {
  const { signIn, isAuthenticated, isLoading } = useApp();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [businessId,  setBusinessId]  = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic field validation
    if (!email.trim())      { setError('Email is required.'); return; }
    if (!password.trim())   { setError('Password is required.'); return; }
    if (!businessId.trim()) { setError('Business ID is required.'); return; }

    setIsSubmitting(true);
    try {
      const result = await signIn(email.trim(), password, businessId.trim());
      if (result.success) {
        navigate('/dashboard', { replace: true });
      } else {
        setError(result.error ?? 'Sign in failed. Please check your credentials.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
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
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'var(--color-primary-600)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize: 20,
            marginBottom: 16,
          }}>
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
          <div style={{
            padding: '10px 14px',
            backgroundColor: 'var(--color-error-50)',
            border: '1px solid #fca5a5',
            borderRadius: 'var(--radius-md)',
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--color-error-700)',
          }}>
            {error}
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
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
              disabled={isSubmitting}
              required
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              placeholder="Your password"
              autoComplete="current-password"
              style={inputStyle}
              disabled={isSubmitting}
              required
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="businessId">Business ID</label>
            <input
              id="businessId"
              type="text"
              value={businessId}
              onChange={e => { setBusinessId(e.target.value); setError(null); }}
              placeholder="Your business identifier"
              autoComplete="off"
              style={inputStyle}
              disabled={isSubmitting}
              required
            />
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Provided by your system administrator
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email || !password || !businessId}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: isSubmitting ? 'var(--color-primary-400)' : 'var(--color-primary-600)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 600,
              cursor: isSubmitting ? 'wait' : 'pointer',
              marginTop: 8,
              transition: 'background-color var(--transition-fast)',
              opacity: (!email || !password || !businessId) ? 0.6 : 1,
            }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 24 }}>
          ImageCare ERP v1.0
        </p>
      </div>
    </div>
  );
}

// ---- Styles ------------------------------------------------
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-bg)',
  padding: '24px 16px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 400,
  backgroundColor: 'var(--color-surface)',
  borderRadius: 'var(--radius-xl)',
  padding: '36px 32px',
  boxShadow: 'var(--shadow-xl)',
  border: '1px solid var(--color-border)',
};

const fieldGroup: React.CSSProperties = {
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--color-border-dark)',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  color: 'var(--color-text-primary)',
  backgroundColor: 'var(--color-surface)',
  outline: 'none',
  transition: 'border-color var(--transition-fast)',
  boxSizing: 'border-box',
};
