// ============================================================
// ImageCare ERP - Business Registration Page
// File: src/features/auth/RegisterPage.tsx
// Purpose: First-time, self-service business signup.
//          Collects ONLY Business Name, Owner Name, Email,
//          Password, Confirm Password - no Business ID, branch
//          name, secret word, OTP, or PIN at this stage.
//
// On success: creates the Supabase Auth account, creates the
// business record, auto-generates the internal business_id,
// associates the owner with the business, assigns the Owner
// role, and initializes owner permissions (all server-side, via
// fn_register_business - see 0020_stage7_pin_auth.sql). The user
// is then sent to PIN creation, then the Dashboard.
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  pageStyle, cardStyle, fieldGroup, labelStyle, inputStyle,
  errorBoxStyle, primaryButtonStyle, brandBadgeStyle,
} from './authStyles';

export function RegisterPage() {
  const { register, isAuthenticated, isLoading, isLocked, hasPin } = useApp();
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState('');
  const [ownerName,    setOwnerName]    = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,         setError]        = useState<string | null>(null);
  const [isSubmitting,  setIsSubmitting] = useState(false);

  // If already fully authenticated (not just locked), this screen
  // is not relevant - send the user onward.
  useEffect(() => {
    if (isAuthenticated && !isLoading && !isLocked) {
      navigate(hasPin ? '/dashboard' : '/setup-pin', { replace: true });
    }
  }, [isAuthenticated, isLoading, isLocked, hasPin, navigate]);

  function splitOwnerName(fullName: string): { first: string; last: string } {
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0] ?? '';
    const last = parts.slice(1).join(' ');
    return { first, last: last || first };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!businessName.trim()) { setError('Business name is required.'); return; }
    if (!ownerName.trim())    { setError('Owner name is required.'); return; }
    if (!email.trim())        { setError('Email is required.'); return; }
    if (!password)             { setError('Password is required.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    const { first, last } = splitOwnerName(ownerName);

    setIsSubmitting(true);
    try {
      const result = await register({
        businessName:   businessName.trim(),
        ownerFirstName: first,
        ownerLastName:  last,
        email:          email.trim(),
        password,
      });
      if (!result.success) {
        setError(result.error ?? 'Registration failed. Please try again.');
      }
      // On success, navigation happens via the isAuthenticated/isLocked/
      // hasPin effect above (hasPin is false immediately after
      // registration, so it lands on /setup-pin), same pattern as
      // LoginPage - avoids racing an explicit navigate here against it.
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

  const canSubmit = businessName && ownerName && email && password && confirmPassword;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={brandBadgeStyle}>IC</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Create your business account
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
            Set up ImageCare ERP for your business
          </p>
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="businessName">Business name</label>
            <input
              id="businessName" type="text" value={businessName}
              onChange={e => { setBusinessName(e.target.value); setError(null); }}
              placeholder="Your business name" autoComplete="organization"
              style={inputStyle} disabled={isSubmitting} required
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="ownerName">Owner name</label>
            <input
              id="ownerName" type="text" value={ownerName}
              onChange={e => { setOwnerName(e.target.value); setError(null); }}
              placeholder="Your full name" autoComplete="name"
              style={inputStyle} disabled={isSubmitting} required
            />
          </div>

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
              placeholder="Choose a password" autoComplete="new-password"
              style={inputStyle} disabled={isSubmitting} required
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword" type="password" value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
              placeholder="Re-enter your password" autoComplete="new-password"
              style={inputStyle} disabled={isSubmitting} required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            style={primaryButtonStyle(!canSubmit, isSubmitting)}
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)', marginTop: 20 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary-600)', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
