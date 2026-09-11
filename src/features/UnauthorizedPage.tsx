// ============================================================
// ImageCare ERP - Unauthorized Page
// File: src/features/UnauthorizedPage.tsx
// ============================================================

import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      textAlign: 'center',
    }}>
      <Lock size={40} style={{ marginBottom: 16, color: 'var(--color-text-muted)' }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Access restricted</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: 14 }}>
        You do not have permission to view this page.
        Contact your administrator to request access.
      </p>
      <Link to="/dashboard" style={{
        padding: '8px 20px',
        backgroundColor: 'var(--color-primary-600)',
        color: 'white',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: 500,
      }}>
        Go to Dashboard
      </Link>
    </div>
  );
}
