// ============================================================
// ImageCare ERP - Password Input (show/hide toggle)
// File: src/features/auth/PasswordInput.tsx
// Purpose: Shared password field for the auth screens (Login,
//          Register, Forgot PIN reauth) with a show/hide toggle -
//          hidden by default, click the eye icon to reveal while
//          typing, click again to mask it.
//
// This is only for full-account passwords. The 4-digit daily PIN
// fields (PinSetupPage, UnlockPage) intentionally do NOT use this -
// the spec requires the PIN to never be shown in plain text while
// entering it.
// ============================================================

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inputStyle } from './authStyles';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
}

export function PasswordInput({
  id, value, onChange, placeholder, autoComplete, disabled, required,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{ ...inputStyle, paddingRight: 40 }}
        disabled={disabled}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: disabled ? 'default' : 'pointer',
          color: 'var(--color-text-muted)',
        }}
      >
        {visible ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
      </button>
    </div>
  );
}
