// ============================================================
// ImageCare ERP - Branch Selector
// File: src/components/layout/BranchSelector.tsx
// Purpose: Active branch switcher. Shows only branches the
//          user is authorized to access. Never shows all branches.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import type { Branch } from '../../types/database';
import type { UUID } from '../../types/database';

export function BranchSelector() {
  const { userContext, activeBranchId, setActiveBranchId } = useApp();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load authorized branches for this user
  useEffect(() => {
    if (!userContext) return;

    async function loadBranches() {
      try {
        // Load all branches for the business that the user can access
        const { data } = await supabase
          .schema('imagecare')
          .from('branches')
          .select('*')
          .eq('business_id', userContext!.business_id)
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('name');

        if (data) {
          // Filter to only authorized branches (unless user has all-branch access)
          const hasAllAccess = Object.values(userContext!.permissions).some(
            p => p.branch_scope === 'all'
          );
          const authorized = hasAllAccess
            ? data
            : data.filter(b =>
                b.id === userContext!.branch_id ||
                userContext!.branches.some(ba => ba.branch_id === b.id)
              );

          setBranches(authorized as Branch[]);

          // Set active branch display
          const active = (data as Branch[]).find(b => b.id === activeBranchId);
          setActiveBranch(active ?? (data[0] as Branch) ?? null);
        }
      } catch {
        // Non-critical - branch selector failing doesn't break the app
      }
    }

    loadBranches();
  }, [userContext, activeBranchId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!userContext || branches.length === 0) return null;
  if (branches.length === 1) {
    return (
      <span style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-secondary)',
        padding: '4px 10px',
        background: 'var(--color-gray-100)',
        borderRadius: 'var(--radius-full)',
      }}>
        {activeBranch?.name ?? 'Main Branch'}
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          background: 'var(--color-gray-100)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-full)',
          cursor: 'pointer',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-primary)',
          fontWeight: 500,
        }}
      >
        <span>🏪</span>
        <span>{activeBranch?.name ?? 'Select Branch'}</span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          minWidth: 180,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          zIndex: 'var(--z-dropdown)',
        }}>
          <div style={{ padding: '6px 0' }}>
            {branches.map(branch => (
              <button
                key={branch.id}
                onClick={() => {
                  setActiveBranchId(branch.id as UUID);
                  setActiveBranch(branch);
                  setIsOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: branch.id === activeBranchId ? 'var(--color-primary-50)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  color: branch.id === activeBranchId ? 'var(--color-primary-700)' : 'var(--color-text-primary)',
                  fontWeight: branch.id === activeBranchId ? 500 : 400,
                }}
              >
                {branch.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
