// ============================================================
// ImageCare ERP - Error Pages
// File: src/features/NotFoundPage.tsx + UnauthorizedPage.tsx
// ============================================================

import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={errorPageStyle}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Page not found</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: 14 }}>
        This page does not exist.
      </p>
      <Link to="/dashboard" style={linkStyle}>Go to Dashboard</Link>
    </div>
  );
}

export function UnauthorizedPage() {
  return (
    <div style={errorPageStyle}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Access restricted</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: 14 }}>
        You do not have permission to view this page.
        Contact your administrator to request access.
      </p>
      <Link to="/dashboard" style={linkStyle}>Go to Dashboard</Link>
    </div>
  );
}

const errorPageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '60vh',
  textAlign: 'center',
};

const linkStyle: React.CSSProperties = {
  padding: '8px 20px',
  backgroundColor: 'var(--color-primary-600)',
  color: 'white',
  borderRadius: 'var(--radius-md)',
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 500,
};
