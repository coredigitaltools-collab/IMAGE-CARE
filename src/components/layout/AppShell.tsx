// ============================================================
// ImageCare ERP - Application Shell
// File: src/components/layout/AppShell.tsx
// Purpose: Persistent application frame.
//          Sidebar + header + scrollable content area.
//          Hosts all authenticated SRS module pages.
// ============================================================

import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { usePermission } from '../../hooks/usePermission';
import { BranchSelector } from './BranchSelector';
import { UserMenu } from './UserMenu';
import { OfflineBanner } from '../feedback/ServiceStates';
import type { ReactNode } from 'react';

// ---- Nav item definition -----------------------------------

interface NavItem {
  label:    string;
  path:     string;
  icon:     string;
  module:   string;
  children?: { label: string; path: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   path: '/dashboard',  icon: '▦',  module: 'reports' },
  { label: 'Sales',       path: '/sales',      icon: '🛒', module: 'sales' },
  { label: 'Inventory',   path: '/inventory',  icon: '📦', module: 'inventory' },
  { label: 'Purchasing',  path: '/purchasing', icon: '🚚', module: 'purchases' },
  { label: 'Customers',   path: '/customers',  icon: '👥', module: 'customers' },
  { label: 'Credit',      path: '/credit',     icon: '💳', module: 'credit' },
  { label: 'Invoices',    path: '/invoices',   icon: '📄', module: 'invoices' },
  { label: 'Bills',       path: '/bills',      icon: '📋', module: 'bills' },
  { label: 'Expenses',    path: '/expenses',   icon: '💸', module: 'expenses' },
  { label: 'Payroll',     path: '/payroll',    icon: '💰', module: 'payroll' },
  { label: 'Cash Flow',   path: '/cash-flow',  icon: '🏦', module: 'cash' },
  { label: 'Reports',     path: '/reports',    icon: '📊', module: 'reports' },
  // Restored from the pre-reset 20-module frontend (commit 06972ff,
  // "Offline Pack") - these modules and their pages/routes still existed
  // in source, just weren't wired into this shell. See
  // Module-Inventory-Forensic-Report.md for the full history.
  { label: 'Loyalty',             path: '/loyalty',             icon: '🎁', module: 'loyalty' },
  { label: 'Sales Targets',       path: '/sales-targets',       icon: '🎯', module: 'salesTargets' },
  { label: 'Stock Summary',       path: '/stock-summary',       icon: '🧮', module: 'stockSummary' },
  { label: 'Daily Summary',       path: '/daily-summary',       icon: '📅', module: 'dailySummary' },
  { label: 'Monthly Summary',     path: '/monthly-summary',     icon: '🗓', module: 'monthlySummary' },
  { label: 'Annual Summary',      path: '/annual-summary',      icon: '📆', module: 'annualSummary' },
  { label: 'Bank Reconciliation', path: '/bank-reconciliation', icon: '🏛', module: 'bank' },
  { label: 'Branch Overview',     path: '/branch-overview',     icon: '🏢', module: 'branchOverview' },
  { label: 'Offline Mode',        path: '/offline-mode',        icon: '📴', module: 'offlineMode' },
  { label: 'Accounting',          path: '/accounting',          icon: '🧾', module: 'accounting' },
  { label: 'Settings',    path: '/settings',   icon: '⚙',  module: 'settings' },
];

// ---- Shell component ---------------------------------------

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOnline] = useState(navigator.onLine);

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      <div className="app-shell__main" style={{
        marginLeft: sidebarOpen ? 'var(--sidebar-width)' : '56px',
        transition: 'margin-left var(--transition-base)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}>
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
        <OfflineBanner isOnline={isOnline} />
        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-6)',
          backgroundColor: 'var(--color-bg)',
        }}>
          {children}
        </main>
      </div>

      <style>{shellStyles}</style>
    </div>
  );
}

// ---- Sidebar -----------------------------------------------

function Sidebar({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { userContext } = useApp();
  const { can } = usePermission(userContext);

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: isOpen ? 'var(--sidebar-width)' : '56px',
      backgroundColor: 'var(--sidebar-bg)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width var(--transition-base)',
      zIndex: 'var(--z-sticky)',
      overflow: 'hidden',
    }}>
      {/* Brand */}
      <div style={{
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-4)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        gap: 'var(--space-3)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-primary-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
        }}>IC</div>
        {isOpen && (
          <span style={{
            color: 'var(--sidebar-text-active)',
            fontWeight: 600,
            fontSize: 15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}>
            ImageCare
          </span>
        )}
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) 0' }}>
        {NAV_ITEMS.map(item => {
          const hasAccess = can(item.module, 'view');
          if (!hasAccess && item.module !== 'reports') return null;
          return (
            <SidebarNavItem
              key={item.path}
              item={item}
              isOpen={isOpen}
            />
          );
        })}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOpen ? 'flex-end' : 'center',
          padding: 'var(--space-3) var(--space-4)',
          background: 'none',
          border: 'none',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          color: 'var(--sidebar-text)',
          cursor: 'pointer',
          fontSize: 16,
          width: '100%',
        }}
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isOpen ? '◀' : '▶'}
      </button>
    </nav>
  );
}

function SidebarNavItem({ item, isOpen }: { item: NavItem; isOpen: boolean }) {
  return (
    <NavLink
      to={item.path}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-4)',
        margin: '1px var(--space-2)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
        backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
        fontSize: 'var(--text-sm)',
        fontWeight: isActive ? 500 : 400,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transition: 'background-color var(--transition-fast), color var(--transition-fast)',
      })}
      onMouseEnter={e => {
        const el = e.currentTarget;
        if (!el.style.backgroundColor.includes('0.15')) {
          el.style.backgroundColor = 'var(--sidebar-hover)';
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        if (!el.style.backgroundColor.includes('0.15')) {
          el.style.backgroundColor = 'transparent';
        }
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, width: 20, textAlign: 'center' }}>
        {item.icon}
      </span>
      {isOpen && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.label}
        </span>
      )}
    </NavLink>
  );
}

// ---- Header ------------------------------------------------

function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header style={{
      height: 'var(--header-height)',
      backgroundColor: 'var(--header-bg)',
      borderBottom: '1px solid var(--header-border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 var(--space-6)',
      gap: 'var(--space-4)',
      position: 'sticky',
      top: 0,
      zIndex: 'var(--z-dropdown)',
      flexShrink: 0,
    }}>
      <button
        onClick={onMenuToggle}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
          fontSize: 18,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
        }}
        title="Toggle sidebar"
      >
        ☰
      </button>

      <PageTitle />

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <BranchSelector />
        <UserMenu />
      </div>
    </header>
  );
}

function PageTitle() {
  const location = useLocation();
  const segment = location.pathname.split('/')[1] ?? 'dashboard';
  const item = NAV_ITEMS.find(n => n.path.replace('/', '') === segment);
  const title = item?.label ?? segment.charAt(0).toUpperCase() + segment.slice(1);

  return (
    <h1 style={{
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    }}>
      {title}
    </h1>
  );
}

// ---- Styles ------------------------------------------------
const shellStyles = `
  .app-shell {
    display: flex;
    min-height: 100vh;
  }
`;
