// ============================================================
// IMC-BLD-004 | ImageCare ERP Frontend Integration v1.0
// File: src/components/feedback/ServiceStates.tsx
// Purpose: Shared loading, error and empty state components.
//          Every service call in every module uses these.
//          Never write ad-hoc loading spinners or error text in pages.
// ============================================================

import React, { type ReactNode } from 'react';

// ---- Loading State -----------------------------------------

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingState({ message = 'Loading...', size = 'md' }: LoadingStateProps) {
  const sizeClass = { sm: 'py-4', md: 'py-8', lg: 'py-16' }[size];

  return (
    <div className={`flex flex-col items-center justify-center ${sizeClass} gap-3 text-gray-500`}>
      <div className="animate-spin rounded-full border-2 border-gray-200 border-t-primary-500 w-8 h-8" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---- Error State -------------------------------------------

interface ErrorStateProps {
  message:    string;
  onRetry?:   () => void;
  retryLabel?: string;
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 text-xl">
        !
      </div>
      <p className="text-sm text-gray-700 max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-primary-600 underline hover:no-underline"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

// ---- Empty State -------------------------------------------

interface EmptyStateProps {
  title:      string;
  message?:   string;
  action?:    ReactNode;
  icon?:      ReactNode;
}

export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {icon && <div className="text-gray-300 text-4xl">{icon}</div>}
      <p className="font-medium text-gray-700">{title}</p>
      {message && <p className="text-sm text-gray-500 max-w-sm">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---- Service State Wrapper ---------------------------------
// Wraps a service call's loading/error/empty states.
// Use this to eliminate boilerplate in every list screen.

interface ServiceStateWrapperProps<T> {
  isLoading: boolean;
  error:     string | null;
  data:      T | null;
  isEmpty?:  (data: T) => boolean;
  loadingMessage?: string;
  emptyTitle?:     string;
  emptyMessage?:   string;
  onRetry?:        () => void;
  children:  (data: T) => ReactNode;
}

export function ServiceStateWrapper<T>({
  isLoading,
  error,
  data,
  isEmpty,
  loadingMessage,
  emptyTitle = 'No records found',
  emptyMessage,
  onRetry,
  children,
}: ServiceStateWrapperProps<T>) {
  if (isLoading) return <LoadingState message={loadingMessage} />;
  if (error)     return <ErrorState message={error} onRetry={onRetry} />;
  if (!data || (isEmpty && isEmpty(data))) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return <>{children(data)}</>;
}

// ---- Permission Denied State -------------------------------

export function PermissionDeniedState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-500 text-xl">
        &#x1F512;
      </div>
      <p className="font-medium text-gray-700">Access Restricted</p>
      <p className="text-sm text-gray-500 max-w-sm">
        You do not have permission to view this section.
        Contact your administrator to request access.
      </p>
    </div>
  );
}

// ---- Offline Banner ----------------------------------------

interface OfflineBannerProps {
  isOnline:   boolean;
  pendingOps?: number;
  onSync?:    () => void;
  isSyncing?: boolean;
}

export function OfflineBanner({ isOnline, pendingOps = 0, onSync, isSyncing }: OfflineBannerProps) {
  if (isOnline && pendingOps === 0) return null;

  return (
    <div className={`px-4 py-2 text-sm flex items-center justify-between gap-2 ${
      isOnline ? 'bg-yellow-50 text-yellow-800 border-b border-yellow-200'
               : 'bg-red-50 text-red-800 border-b border-red-200'
    }`}>
      <span>
        {!isOnline
          ? 'You are offline. Changes will sync when you reconnect.'
          : `${pendingOps} operation${pendingOps !== 1 ? 's' : ''} waiting to sync.`}
      </span>
      {isOnline && onSync && (
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="text-xs underline disabled:opacity-50"
        >
          {isSyncing ? 'Syncing...' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
