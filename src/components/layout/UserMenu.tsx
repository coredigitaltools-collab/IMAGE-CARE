// ============================================================
// ImageCare ERP - User Menu
// File: src/components/layout/UserMenu.tsx
// Purpose: Current user display and session actions.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { formatFullName, formatInitials } from '../../utils/formatters';
import { StaffSwitcherModal } from './StaffSwitcherModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/toastContext';

export function UserMenu() {
  const { userContext, signOut, lock, activeStaff, switchBackToOwner } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSwitchBackOpen, setIsSwitchBackOpen] = useState(false);
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

  // Lock: the normal daily action. Returns to the PIN unlock screen
  // without touching the Supabase session - distinct from Sign out,
  // which terminates the session and requires full email/password
  // to sign back in. Also clears any active staff identification (see
  // AppContext's lock()) - unlocking again always starts from "owner".
  function handleLock() {
    setIsOpen(false);
    lock();
    navigate('/unlock');
  }

  async function handleSwitchBack(ownerPin: string) {
    const result = await switchBackToOwner(ownerPin);
    if (result.success) {
      setIsSwitchBackOpen(false);
    } else {
      showToast(result.error ?? 'Incorrect PIN.');
    }
  }

  // Acting-as-staff pill: distinct look (green dot, staff name/role) so
  // it's obvious at a glance the till isn't showing the owner's own full
  // access right now - see 0030_stage9_pin_staff.sql for why this is a
  // client-side identification overlay, not a second real login.
  if (activeStaff) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: '1px solid var(--color-success-600, #16a34a)',
            borderRadius: 'var(--radius-full)',
            padding: '4px 12px 4px 4px',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: 'var(--color-success-600, #16a34a)', flexShrink: 0,
          }} />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontWeight: 500, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Acting as {activeStaff.fullName}
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>▼</span>
        </button>

        {isOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 220,
            backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
            zIndex: 'var(--z-dropdown)',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                {activeStaff.fullName}
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {activeStaff.role} · restricted view
              </p>
            </div>
            <div style={{ padding: '6px 0' }}>
              <button
                onClick={() => { setIsOpen(false); setIsSwitchBackOpen(true); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}
              >
                Switch back to owner
              </button>
              <button
                onClick={handleLock}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}
              >
                Lock
              </button>
            </div>
          </div>
        )}

        {isSwitchBackOpen && (
          <ConfirmDialog
            title="Switch back to owner"
            message="Enter your own daily PIN to return to full access."
            confirmLabel="Switch back"
            reasonLabel="Your PIN"
            reasonPlaceholder="••••"
            onConfirm={(pin) => void handleSwitchBack(pin ?? '')}
            onCancel={() => setIsSwitchBackOpen(false)}
          />
        )}
      </div>
    );
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
              onClick={() => { setIsOpen(false); setIsSwitcherOpen(true); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
            >
              Switch to staff…
            </button>
            <button
              onClick={handleLock}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}
            >
              Lock
            </button>
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

      {isSwitcherOpen && <StaffSwitcherModal onClose={() => setIsSwitcherOpen(false)} />}
    </div>
  );
}
