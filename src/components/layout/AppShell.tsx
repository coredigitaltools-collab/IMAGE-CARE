// ============================================================
// ImageCare ERP - Application Shell
// File: src/components/layout/AppShell.tsx
// Purpose: Persistent application frame.
//          Sidebar + header + scrollable content area.
//          Hosts all authenticated SRS module pages.
// ============================================================

import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, CreditCard, FileText, ClipboardList,
  Receipt, Wallet, Landmark, BarChart3, Gift, Target, Boxes, Calendar, CalendarDays, CalendarRange,
  Building2, Building, WifiOff, BookOpen, Settings as SettingsIcon, Menu, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePermission } from '../../hooks/usePermission';
import { BranchSelector } from './BranchSelector';
import { UserMenu } from './UserMenu';
import { OfflineBanner } from '../feedback/ServiceStates';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// ---- Nav item definition -----------------------------------

interface NavItem {
  label:    string;
  path:     string;
  icon:     LucideIcon;
  module:   string;
  children?: { label: string; path: string }[];
}

// Every icon here is a lucide-react icon, the same set the rest of the
// app already uses for buttons/cards/empty states - the sidebar
// previously rendered raw emoji characters instead (🛒📦🚚 etc.), which
// look inconsistent with the app's design system and render differently
// across operating systems.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   path: '/dashboard',  icon: LayoutDashboard, module: 'reports' },
  { label: 'Sales',       path: '/sales',      icon: ShoppingCart,    module: 'sales' },
  { label: 'Inventory',   path: '/inventory',  icon: Package,         module: 'inventory' },
  { label: 'Purchasing',  path: '/purchasing', icon: Truck,           module: 'purchases' },
  { label: 'Customers',   path: '/customers',  icon: Users,           module: 'customers' },
  { label: 'Credit',      path: '/credit',     icon: CreditCard,      module: 'credit' },
  { label: 'Invoices',    path: '/invoices',   icon: FileText,        module: 'invoices' },
  { label: 'Bills',       path: '/bills',      icon: ClipboardList,   module: 'bills' },
  { label: 'Expenses',    path: '/expenses',   icon: Receipt,         module: 'expenses' },
  { label: 'Payroll',     path: '/payroll',    icon: Wallet,          module: 'payroll' },
  { label: 'Cash Flow',   path: '/cash-flow',  icon: Landmark,        module: 'cash' },
  { label: 'Reports',     path: '/reports',    icon: BarChart3,       module: 'reports' },
  // Restored from the pre-reset 20-module frontend (commit 06972ff,
  // "Offline Pack") - these modules and their pages/routes still existed
  // in source, just weren't wired into this shell. See
  // Module-Inventory-Forensic-Report.md for the full history.
  { label: 'Loyalty',             path: '/loyalty',             icon: Gift,          module: 'loyalty' },
  { label: 'Sales Targets',       path: '/sales-targets',       icon: Target,        module: 'salesTargets' },
  { label: 'Stock Summary',       path: '/stock-summary',       icon: Boxes,         module: 'stockSummary' },
  { label: 'Daily Summary',       path: '/daily-summary',       icon: Calendar,      module: 'dailySummary' },
  { label: 'Monthly Summary',     path: '/monthly-summary',     icon: CalendarDays,  module: 'monthlySummary' },
  { label: 'Annual Summary',      path: '/annual-summary',      icon: CalendarRange, module: 'annualSummary' },
  { label: 'Bank Reconciliation', path: '/bank-reconciliation', icon: Building2,     module: 'bank' },
  { label: 'Branch Overview',     path: '/branch-overview',     icon: Building,      module: 'branchOverview' },
  { label: 'Offline Mode',        path: '/offline-mode',        icon: WifiOff,       module: 'offlineMode' },
  { label: 'Accounting',          path: '/accounting',          icon: BookOpen,      module: 'accounting' },
  { label: 'Settings',    path: '/settings',   icon: SettingsIcon, module: 'settings' },
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
        // ROOT CAUSE FIX (2026-08-28): the sidebar is `position: fixed`, so it
        // is removed from this flex row entirely - this main wrapper is the
        // ONLY item .app-shell's flex layout sees. Without flex-grow it kept
        // its default `flex: 0 1 auto`, so it sized to its own content
        // (shrink-to-fit) instead of filling the space left of the sidebar.
        // That's what produced the narrow content column with a large empty
        // area on the right across every module (Sales/POS, Payroll,
        // Inventory, etc.) - confirmed by an isolated reproduction of this
        // exact markup/CSS before applying this fix. `flex: 1 1 0%` makes it
        // fill the remaining width (flexbox correctly subtracts the
        // margin-left offset when distributing that space); `minWidth: 0`
        // stops it from being kept artificially wide by its own content
        // (e.g. a wide table), which is what allows horizontal scrolling to
        // work inside pages instead of pushing the whole layout wider.
        flex: '1 1 0%',
        minWidth: 0,
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
  const { userContext, activeStaff } = useApp();
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
          // PIN staff mode (2026-09-05, see 0030_stage9_pin_staff.sql):
          // the owner's real permissions (ctx.permissions, via
          // fn_get_user_context) are still what's checked above - this is
          // an additional, coarse restriction layered on top while a
          // staff member is identified on a shared device. Settings
          // (business config, staff PINs, roles/permissions) always stays
          // hidden while acting as staff, regardless of the owner's own
          // access - real per-role restrictions for everything else are a
          // separate, larger follow-up (the Roles/Permission Matrix
          // screens don't persist to the database yet - see
          // claude/add-staff-not-persisting-fix-2026-09-04.md).
          if (activeStaff && item.module === 'settings') return null;
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
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
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
      <span style={{ display: 'flex', flexShrink: 0, width: 20, justifyContent: 'center' }}>
        <item.icon size={17} strokeWidth={1.75} />
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
        <Menu size={18} />
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
