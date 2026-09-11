// ============================================================
// ImageCare ERP - Dashboard Page (Stage 1 Placeholder)
// File: src/features/dashboard/DashboardPage.tsx
// Purpose: Foundation dashboard shell. Shows business context
//          and confirms the architecture is wired correctly.
//          Full KPI implementation comes in Stage 7 (Reporting).
// ============================================================

import React from 'react';
import { useApp, useActiveBranch } from '../../context/AppContext';
import { usePermission } from '../../hooks/usePermission';
import { formatFullName } from '../../utils/formatters';

export default function DashboardPage() {
  const { userContext } = useApp();
  const activeBranchId  = useActiveBranch();
  const { can } = usePermission(userContext);

  if (!userContext) return null;

  const fullName = formatFullName(userContext.first_name, userContext.last_name);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Welcome */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Welcome back, {userContext.first_name}
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          ImageCare ERP is running. Foundation stage complete.
        </p>
      </div>

      {/* Status cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        <StatusCard
          label="Authentication"
          value="Active"
          detail={userContext.email}
          status="ok"
        />
        <StatusCard
          label="Business Context"
          value="Loaded"
          detail={`ID: ${userContext.business_id.slice(0, 8)}...`}
          status="ok"
        />
        <StatusCard
          label="Branch Context"
          value={activeBranchId ? 'Active' : 'None'}
          detail={activeBranchId ? `ID: ${activeBranchId.slice(0, 8)}...` : 'Set in header'}
          status={activeBranchId ? 'ok' : 'warn'}
        />
        <StatusCard
          label="Permissions"
          value={userContext.is_owner ? 'Owner' : userContext.role}
          detail={userContext.is_owner ? 'Can manage all permissions' : `${Object.keys(userContext.permissions).length} modules configured`}
          status="ok"
        />
      </div>

      {/* User context detail */}
      <div style={sectionCard}>
        <h3 style={sectionTitle}>Your Access</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          <Detail label="Name"  value={fullName} />
          <Detail label="Role"  value={userContext.role} />
          <Detail label="Email" value={userContext.email} />
          <Detail label="Branches" value={`${userContext.branches.length} authorized`} />
          <Detail label="Account" value={userContext.is_active ? 'Active' : 'Inactive'} />
        </div>
      </div>

      {/* Module access summary */}
      <div style={sectionCard}>
        <h3 style={sectionTitle}>Module Permissions</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 8,
        }}>
          {[
            { label: 'Sales',       module: 'sales' },
            { label: 'Inventory',   module: 'inventory' },
            { label: 'Purchasing',  module: 'purchases' },
            { label: 'Customers',   module: 'customers' },
            { label: 'Credit',      module: 'credit' },
            { label: 'Expenses',    module: 'expenses' },
            { label: 'Payroll',     module: 'payroll' },
            { label: 'Reports',     module: 'reports' },
            { label: 'Settings',    module: 'settings' },
          ].map(({ label, module }) => (
            <div key={module} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: can(module, 'view')
                ? 'var(--color-success-50)'
                : 'var(--color-gray-50)',
              border: '1px solid',
              borderColor: can(module, 'view')
                ? '#bbf7d0'
                : 'var(--color-border)',
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: can(module, 'view')
                  ? 'var(--color-success-500)'
                  : 'var(--color-gray-300)',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 12,
                fontWeight: 500,
                color: can(module, 'view')
                  ? 'var(--color-success-700)'
                  : 'var(--color-text-muted)',
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Build stage notice */}
      <div style={{
        padding: '14px 16px',
        backgroundColor: 'var(--color-info-50)',
        border: '1px solid var(--color-primary-200)',
        borderRadius: 'var(--radius-lg)',
        fontSize: 13,
        color: 'var(--color-primary-700)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ</span>
        <div>
          <strong>ImageCare ERP is fully connected to its backend.</strong>
          {' '}Core ERP workflows and business data are now live.
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----------------------------------------

function StatusCard({ label, value, detail, status }: {
  label: string; value: string; detail: string;
  status: 'ok' | 'warn' | 'error';
}) {
  const colors = {
    ok:    { bg: 'var(--color-success-50)',  border: '#bbf7d0', dot: 'var(--color-success-500)' },
    warn:  { bg: 'var(--color-warning-50)', border: '#fde68a', dot: 'var(--color-warning-500)' },
    error: { bg: 'var(--color-error-50)',   border: '#fca5a5', dot: 'var(--color-error-500)' },
  }[status];

  return (
    <div style={{
      padding: 16,
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colors.dot }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>
        {value}
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{detail}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</span>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginTop: 1 }}>
        {value}
      </p>
    </div>
  );
}

const sectionCard: React.CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 20,
  marginBottom: 16,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  marginBottom: 14,
};
