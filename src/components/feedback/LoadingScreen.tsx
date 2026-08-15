// ============================================================
// ImageCare ERP - Loading Screen
// File: src/components/feedback/LoadingScreen.tsx
// ============================================================

import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: 16,
      backgroundColor: 'var(--color-bg)',
    }}>
      {/* Logo mark */}
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: 'var(--color-primary-600)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 700,
        fontSize: 18,
        marginBottom: 8,
      }}>
        IC
      </div>

      {/* Spinner */}
      <div style={{
        width: 24,
        height: 24,
        border: '2px solid var(--color-gray-200)',
        borderTopColor: 'var(--color-primary-500)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />

      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-muted)',
        fontWeight: 400,
      }}>
        {message}
      </p>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
