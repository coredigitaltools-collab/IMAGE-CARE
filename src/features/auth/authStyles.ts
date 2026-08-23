// ============================================================
// ImageCare ERP - Shared Auth Screen Styles
// File: src/features/auth/authStyles.ts
// Purpose: Shared inline-style constants for the auth screens
//          (Login, Register, PIN Setup, Daily Unlock, Forgot PIN)
//          so all five stay visually consistent. Extracted
//          unchanged from LoginPage.tsx's original styles - no
//          visual redesign, just de-duplication across the new
//          screens this task adds.
// ============================================================

import type { CSSProperties } from 'react';

export const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-bg)',
  padding: '24px 16px',
};

export const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
  backgroundColor: 'var(--color-surface)',
  borderRadius: 'var(--radius-xl)',
  padding: '36px 32px',
  boxShadow: 'var(--shadow-xl)',
  border: '1px solid var(--color-border)',
};

export const fieldGroup: CSSProperties = {
  marginBottom: 16,
};

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
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

export const errorBoxStyle: CSSProperties = {
  padding: '10px 14px',
  backgroundColor: 'var(--color-error-50)',
  border: '1px solid #fca5a5',
  borderRadius: 'var(--radius-md)',
  marginBottom: 20,
  fontSize: 13,
  color: 'var(--color-error-700)',
};

export const noticeBoxStyle: CSSProperties = {
  padding: '10px 14px',
  backgroundColor: 'var(--color-primary-50, #eff6ff)',
  border: '1px solid var(--color-primary-200, #bfdbfe)',
  borderRadius: 'var(--radius-md)',
  marginBottom: 20,
  fontSize: 13,
  color: 'var(--color-primary-700, #1d4ed8)',
};

export function primaryButtonStyle(disabled: boolean, isBusy: boolean): CSSProperties {
  return {
    width: '100%',
    padding: '10px 16px',
    backgroundColor: isBusy ? 'var(--color-primary-400)' : 'var(--color-primary-600)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontWeight: 600,
    cursor: isBusy ? 'wait' : 'pointer',
    marginTop: 8,
    transition: 'background-color var(--transition-fast)',
    opacity: disabled ? 0.6 : 1,
  };
}

export const brandBadgeStyle: CSSProperties = {
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
};
