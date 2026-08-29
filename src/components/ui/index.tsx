// ============================================================
// ImageCare ERP - Shared UI Components
// File: src/components/ui/index.tsx
// Purpose: Reusable components used across all modules.
//          Build on these - never create duplicates.
// ============================================================

import React, {
  type ReactNode, type ButtonHTMLAttributes,
  type InputHTMLAttributes, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect, useState,
} from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ============================================================
// BUTTON
// ============================================================

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize    = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'primary', size = 'md', loading = false,
  leftIcon, rightIcon, children, disabled, style, ...props
}: ButtonProps) {
  const styles = buttonVariantStyles[variant];
  const sizeStyle = buttonSizeStyles[size];

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        transition: 'all var(--transition-fast)',
        borderRadius: 'var(--radius-md)',
        opacity: disabled ? 0.55 : 1,
        flexShrink: 0,
        ...sizeStyle,
        ...styles,
        ...style,
      }}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 16 : 14} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

const buttonVariantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--color-primary-600)',
    color: 'white',
    border: '1px solid var(--color-primary-600)',
  },
  secondary: {
    backgroundColor: 'var(--color-gray-100)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  },
  danger: {
    backgroundColor: 'var(--color-error-600)',
    color: 'white',
    border: '1px solid var(--color-error-600)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    border: '1px solid transparent',
  },
  outline: {
    backgroundColor: 'transparent',
    color: 'var(--color-primary-600)',
    border: '1px solid var(--color-primary-600)',
  },
};

const buttonSizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 12, height: 28 },
  md: { padding: '7px 14px', fontSize: 13, height: 34 },
  lg: { padding: '10px 20px', fontSize: 14, height: 40 },
};

// ============================================================
// INPUT
// ============================================================

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export function Input({ label, error, hint, leftAddon, rightAddon, style, id, ...props }: InputProps) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {props.required && <span style={{ color: 'var(--color-error-500)', marginLeft: 2 }}>*</span>}
        </label>
      )}
      <div style={{ display: 'flex', position: 'relative' }}>
        {leftAddon && (
          <div style={addonStyle('left')}>{leftAddon}</div>
        )}
        <input
          id={inputId}
          style={{
            width: '100%',
            padding: '7px 12px',
            paddingLeft: leftAddon ? 36 : 12,
            paddingRight: rightAddon ? 36 : 12,
            border: `1px solid ${error ? 'var(--color-error-500)' : 'var(--color-border-dark)'}`,
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            backgroundColor: props.disabled ? 'var(--color-gray-50)' : 'var(--color-surface)',
            outline: 'none',
            transition: 'border-color var(--transition-fast)',
            fontFamily: 'var(--font-sans)',
            ...style,
          }}
          {...props}
        />
        {rightAddon && (
          <div style={addonStyle('right')}>{rightAddon}</div>
        )}
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--color-error-600)' }}>{error}</p>}
      {hint && !error && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</p>}
    </div>
  );
}

// ============================================================
// SELECT
// ============================================================

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
  options:  { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export function Select({ label, error, hint, options, placeholder, style, id, ...props }: SelectProps) {
  const selectId = id ?? `select-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label htmlFor={selectId} style={labelStyle}>
          {label}
          {props.required && <span style={{ color: 'var(--color-error-500)', marginLeft: 2 }}>*</span>}
        </label>
      )}
      <select
        id={selectId}
        style={{
          width: '100%',
          padding: '7px 12px',
          border: `1px solid ${error ? 'var(--color-error-500)' : 'var(--color-border-dark)'}`,
          borderRadius: 'var(--radius-md)',
          fontSize: 13,
          color: 'var(--color-text-primary)',
          backgroundColor: props.disabled ? 'var(--color-gray-50)' : 'var(--color-surface)',
          outline: 'none',
          fontFamily: 'var(--font-sans)',
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p style={{ fontSize: 12, color: 'var(--color-error-600)' }}>{error}</p>}
      {hint && !error && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</p>}
    </div>
  );
}

// ============================================================
// TEXTAREA
// ============================================================

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, style, id, ...props }: TextareaProps) {
  const textareaId = id ?? `textarea-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label htmlFor={textareaId} style={labelStyle}>{label}</label>}
      <textarea
        id={textareaId}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: `1px solid ${error ? 'var(--color-error-500)' : 'var(--color-border-dark)'}`,
          borderRadius: 'var(--radius-md)',
          fontSize: 13,
          color: 'var(--color-text-primary)',
          backgroundColor: 'var(--color-surface)',
          outline: 'none',
          fontFamily: 'var(--font-sans)',
          resize: 'vertical',
          minHeight: 80,
          ...style,
        }}
        {...props}
      />
      {error && <p style={{ fontSize: 12, color: 'var(--color-error-600)' }}>{error}</p>}
    </div>
  );
}

// ============================================================
// BADGE
// ============================================================

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'neutral', size = 'md' }: BadgeProps) {
  const colors: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
    success: { bg: 'var(--color-success-50)', color: 'var(--color-success-700)', border: '#bbf7d0' },
    warning: { bg: 'var(--color-warning-50)', color: '#92400e', border: '#fde68a' },
    error:   { bg: 'var(--color-error-50)',   color: 'var(--color-error-700)',   border: '#fca5a5' },
    info:    { bg: 'var(--color-info-50)',    color: 'var(--color-info-600)',    border: '#bfdbfe' },
    neutral: { bg: 'var(--color-gray-100)',   color: 'var(--color-text-secondary)', border: 'var(--color-border)' },
  };
  const c = colors[variant];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: size === 'sm' ? '1px 6px' : '2px 8px',
      backgroundColor: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      borderRadius: 'var(--radius-full)',
      fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ============================================================
// CARD
// ============================================================

interface CardProps {
  children: ReactNode;
  padding?: number | string;
  style?:   React.CSSProperties;
  header?:  ReactNode;
}

export function Card({ children, padding = 20, style, header }: CardProps) {
  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      ...style,
    }}>
      {header && (
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--color-border)',
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--color-text-primary)',
        }}>
          {header}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

// ============================================================
// TABLE
// ============================================================

interface Column<T> {
  key:      keyof T | string;
  label:    string;
  width?:   number | string;
  align?:   'left' | 'right' | 'center';
  render?:  (value: unknown, row: T) => ReactNode;
}

interface TableProps<T> {
  columns:  Column<T>[];
  data:     T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function Table<T>({ columns, data, keyField, onRowClick, emptyMessage = 'No records found.' }: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 13,
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 13,
        backgroundColor: 'var(--color-surface)',
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-gray-50)' }}>
            {columns.map(col => (
              <th key={String(col.key)} style={{
                padding: '10px 14px',
                textAlign: col.align ?? 'left',
                fontWeight: 600,
                fontSize: 12,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                width: col.width,
                whiteSpace: 'nowrap',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr
              key={String(row[keyField])}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: '1px solid var(--color-border)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background-color var(--transition-fast)',
              }}
              onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-gray-50)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
            >
              {columns.map(col => (
                <td key={String(col.key)} style={{
                  padding: '12px 14px',
                  textAlign: col.align ?? 'left',
                  color: 'var(--color-text-primary)',
                  verticalAlign: 'middle',
                }}>
                  {col.render
                    ? col.render(row[col.key as keyof T], row)
                    : String(row[col.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// MODAL
// ============================================================

interface ModalProps {
  isOpen:    boolean;
  onClose:   () => void;
  title:     string;
  children:  ReactNode;
  footer?:   ReactNode;
  size?:     'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const widths = { sm: 400, md: 560, lg: 760 };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 'var(--z-modal)', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        width: '100%',
        maxWidth: widths[size],
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-muted)', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CONFIRM DIALOG
// ============================================================

interface ConfirmProps {
  isOpen:    boolean;
  onClose:   () => void;
  onConfirm: () => void;
  title:     string;
  message:   ReactNode;
  confirmLabel?: string;
  cancelLabel?:  string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export function Confirm({
  isOpen, onClose, onConfirm, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'danger', isLoading = false,
}: ConfirmProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>{cancelLabel}</Button>
          <Button variant={variant} onClick={onConfirm} loading={isLoading}>{confirmLabel}</Button>
        </>
      }
    >
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id:      string;
  type:    ToastType;
  message: string;
  duration?: number;
}

// Simple event bus for toasts - no external dependency
const toastListeners: ((toast: ToastMessage) => void)[] = [];

export const toast = {
  success: (message: string, duration = 4000) => emitToast('success', message, duration),
  error:   (message: string, duration = 6000) => emitToast('error', message, duration),
  warning: (message: string, duration = 5000) => emitToast('warning', message, duration),
  info:    (message: string, duration = 4000) => emitToast('info', message, duration),
};

function emitToast(type: ToastType, message: string, duration: number) {
  const t: ToastMessage = { id: `toast-${Date.now()}`, type, message, duration };
  toastListeners.forEach(l => l(t));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener = (t: ToastMessage) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, t.duration ?? 4000);
    };
    toastListeners.push(listener);
    return () => {
      const idx = toastListeners.indexOf(listener);
      if (idx > -1) toastListeners.splice(idx, 1);
    };
  }, []);

  const colors: Record<ToastType, { bg: string; border: string; icon: LucideIcon; iconColor: string }> = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', icon: CheckCircle2, iconColor: '#16a34a' },
    error:   { bg: 'var(--color-error-50)', border: '#fca5a5', icon: XCircle, iconColor: '#dc2626' },
    warning: { bg: 'var(--color-warning-50)', border: '#fde68a', icon: AlertTriangle, iconColor: '#b45309' },
    info:    { bg: 'var(--color-info-50)', border: '#bfdbfe', icon: Info, iconColor: '#2563eb' },
  };

  return (
    <>
      {children}
      <div style={{
        position: 'fixed', bottom: 20, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 'var(--z-toast)', maxWidth: 360, width: '100%',
      }}>
        {toasts.map(t => {
          const c = colors[t.type];
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px',
              backgroundColor: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
              fontSize: 13, color: 'var(--color-text-primary)',
              animation: 'slideIn 0.2s ease',
            }}>
              <c.icon size={16} color={c.iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ lineHeight: 1.5 }}>{t.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'var(--color-text-muted)', flexShrink: 0 }}
              >×</button>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
    </>
  );
}

// ============================================================
// PAGINATION
// ============================================================

interface PaginationProps {
  page:        number;
  pageSize:    number;
  totalCount:  number;
  hasMore?:    boolean;
  onPage:      (page: number) => void;
}

export function Pagination({ page, pageSize, totalCount, hasMore, onPage }: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1 && !hasMore) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
      <Button variant="ghost" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>← Prev</Button>
      <span style={{ padding: '0 8px' }}>
        Page {page}{totalPages > 0 ? ` of ${totalPages}` : ''}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onPage(page + 1)} disabled={!hasMore && page >= totalPages}>Next →</Button>
    </div>
  );
}

// ============================================================
// SEARCH INPUT
// ============================================================

interface SearchProps {
  value:    string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }: SearchProps) {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={14} style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)', pointerEvents: 'none',
      }} />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          paddingLeft: 32,
          padding: '7px 12px 7px 32px',
          border: '1px solid var(--color-border-dark)',
          borderRadius: 'var(--radius-full)',
          fontSize: 13,
          color: 'var(--color-text-primary)',
          backgroundColor: 'var(--color-surface)',
          outline: 'none',
          width: 220,
          fontFamily: 'var(--font-sans)',
        }}
      />
    </div>
  );
}

// ============================================================
// PAGE HEADER
// ============================================================

interface PageHeaderProps {
  title:    string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24, gap: 16, flexWrap: 'wrap',
    }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: subtitle ? 4 : 0 }}>
          {title}
        </h2>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

// ============================================================
// CURRENCY + DATE DISPLAY
// ============================================================

import { formatCurrency, formatDate, formatStatus, getStatusVariant } from '../../utils/formatters';

export function CurrencyDisplay({ amount, currency = 'UGX' }: { amount: number; currency?: string }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(amount, currency)}</span>;
}

export function DateDisplay({ date }: { date: string | null | undefined }) {
  return <span>{formatDate(date)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = getStatusVariant(status) as BadgeVariant;
  return <Badge variant={variant}>{formatStatus(status)}</Badge>;
}

// ============================================================
// SPINNER
// ============================================================

export function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid transparent`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ============================================================
// DIVIDER
// ============================================================

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
      <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--color-border)' }} />
    </div>
  );
}

// ---- Shared styles -----------------------------------------
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  marginBottom: 4,
};

function addonStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-muted)',
    fontSize: 14,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
  };
}
