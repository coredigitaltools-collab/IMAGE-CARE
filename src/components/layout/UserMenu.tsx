// ============================================================
// ImageCare ERP - User Menu
// File: src/components/layout/UserMenu.tsx
// Purpose: Current user display and session actions.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { formatFullName, formatInitials } from '../../utils/formatters';

export function UserMenu() {
  const { userContext, signOut } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!userContext) return null;

  const fullName  = formatFullName(userContext.first_name, userContext.last_name);
  const initials  = formatInitials(userContext.first_name, userContext.last_name);

  async function handleSignOut() {
    setIsSigningOut(true);
    setIsOpen(false);
    await signOut();
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-full)',
          padding: '4px 8px 4px 4px',
          cursor: 'pointer',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: 'var(--color-primary-600)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fullName}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          width: 220,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          zIndex: 'var(--z-dropdown)',
        }}>
          {/* User info */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              {fullName}
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {userContext.email}
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {userContext.role}
            </p>
          </div>

          {/* Actions */}
          <div style={{ padding: '6px 0' }}>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                cursor: isSigningOut ? 'wait' : 'pointer',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-error-600)',
                opacity: isSigningOut ? 0.6 : 1,
              }}
            >
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
