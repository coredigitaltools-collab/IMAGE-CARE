// ============================================================
// ImageCare ERP - PIN Setup Page
// File: src/features/auth/PinSetupPage.tsx
// Purpose: "Create your 4 digit PIN" screen, shown after the
//          first successful authentication (new registration or
//          an existing user's next successful email/password
//          login who has no PIN yet). Also reused, in "reset"
//          mode, by the Forgot PIN flow after email+password
//          reauthentication (see ForgotPinPage.tsx).
//
// The PIN is validated and hashed entirely server-side
// (fn_set_pin - pgcrypto bcrypt hash, never plaintext, never the
// Supabase Auth password). This screen never sees or stores the
// PIN anywhere except as component state while the user types it.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  pageStyle, cardStyle, fieldGroup, labelStyle, inputStyle,
  errorBoxStyle, primaryButtonStyle, brandBadgeStyle,
} from './authStyles';

const pinInputStyle: React.CSSProperties = {
  ...inputStyle,
  textAlign: 'center',
  letterSpacing: 10,
  fontSize: 22,
};

export function PinSetupPage() {
  const { isAuthenticated, isLoading, hasPin, setPin, userContext } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isReset = Boolean((location.state as { reset?: boolean } | null)?.reset);

  const [pinDigits,        setPinDigits]        = useState('');
  const [confirmPinDigits, setConfirmPinDigits] = useState('');
  const [error,            setError]            = useState<string | null>(null);
  const [isSubmitting,     setIsSubmitting]      = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Guard: must be authenticated. If a PIN already exists and this
  // is not an explicit reset (reached via Forgot PIN's reauth), the
  // user already has a PIN - nothing to set up, send them onward.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    if (hasPin && !isReset) { navigate('/dashboard', { replace: true }); }
  }, [isAuthenticated, isLoading, hasPin, isReset, navigate]);

  function onDigitsChange(setter: (v: string) => void, autoAdvanceTo?: React.RefObject<HTMLInputElement>) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
      setter(digits);
      setError(null);
      if (digits.length === 4 && autoAdvanceTo?.current) {
        autoAdvanceTo.current.focus();
      }
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^[0-9]{4}$/.test(pinDigits)) { setError('PIN must be exactly 4 digits.'); return; }
    if (pinDigits !== confirmPinDigits) { setError('PIN and confirmation do not match.'); return; }

    setIsSubmitting(true);
    try {
      const result = await setPin(pinDigits, confirmPinDigits);
      if (result.success) {
        navigate('/dashboard', { replace: true });
      } else {
        setError(result.error ?? 'Could not save your PIN. Please try again.');
        setPinDigits('');
        setConfirmPinDigits('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div style={pageStyle}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  const canSubmit = pinDigits.length === 4 && confirmPinDigits.length === 4;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={brandBadgeStyle}>IC</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            {isReset ? 'Create a new PIN' : 'Create your 4 digit PIN'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            This PIN will be used to quickly unlock your ERP on this device.
          </p>
          {userContext && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
              {userContext.email}
            </p>
          )}
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="pin">PIN</label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pinDigits}
              onChange={onDigitsChange(setPinDigits, confirmRef)}
              placeholder="••••"
              style={pinInputStyle}
              disabled={isSubmitting}
              autoFocus
              required
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle} htmlFor="confirmPin">Confirm PIN</label>
            <input
              id="confirmPin"
              ref={confirmRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={confirmPinDigits}
              onChange={onDigitsChange(setConfirmPinDigits)}
              placeholder="••••"
              style={pinInputStyle}
              disabled={isSubmitting}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            style={primaryButtonStyle(!canSubmit, isSubmitting)}
          >
            {isSubmitting ? 'Saving...' : 'Create PIN'}
          </button>
        </form>
      </div>
    </div>
  );
}
