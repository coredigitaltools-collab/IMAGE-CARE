// ============================================================
// ImageCare ERP - Route Error Boundary
// File: src/components/feedback/RouteErrorBoundary.tsx
//
// 2026-09-01: reported live - opening Sales showed a raw crash
// screen: "Unexpected Application Error! Failed to fetch
// dynamically imported module: .../assets/PointOfSalePage-<hash>.js".
// That text is React Router's own default error screen, which this
// app never replaced - so ANY unhandled error anywhere in the routed
// app (not just this one) was falling through to a raw, technical,
// unbranded crash page. That's a direct violation of this app's own
// error-handling standard (clear, actionable, non-technical messages,
// never a raw error dump).
//
// The specific trigger here has a well-understood cause: every page
// is lazy-loaded (see router.tsx's lazy() calls), so each one lives
// in its own hashed JS file. When a newer version of the app gets
// deployed, those hashes change and the OLD files are gone from the
// server. A browser tab that was already open (or whose cached HTML
// still points at the old build) then tries to fetch an old page's
// chunk by its old filename and gets a 404 - "failed to fetch
// dynamically imported module". A plain reload almost always fixes
// this immediately, because it re-fetches the current index.html
// with the CURRENT chunk filenames. So for that specific class of
// error, this reloads automatically once (guarded against looping
// forever if reloading doesn't actually help - e.g. genuinely
// offline) instead of leaving the user stuck on a crash screen.
//
// For any other, unrelated error, this still replaces the raw
// React Router crash screen with a plain-language message and a
// manual "Reload page" action - the safety net this app was
// missing everywhere.
// ============================================================

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const RELOAD_GUARD_KEY = 'imc_last_auto_reload_at';
const RELOAD_GUARD_WINDOW_MS = 15000; // don't auto-reload more than once per 15s

function extractMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function looksLikeStaleChunk(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('failed to fetch dynamically imported module') ||
    m.includes('error loading dynamically imported module') ||
    m.includes('importing a module script failed') ||
    m.includes('load failed') // Safari's phrasing for the same failure
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [autoReloading, setAutoReloading] = useState(false);

  const message = extractMessage(error);
  const isStaleChunk = looksLikeStaleChunk(message);

  useEffect(() => {
    if (!isStaleChunk) return;
    let lastReload = 0;
    try {
      lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    } catch {
      // sessionStorage unavailable (e.g. private mode) - fall through to
      // a manual reload below rather than looping.
    }
    if (Date.now() - lastReload > RELOAD_GUARD_WINDOW_MS) {
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        // ignore - worst case this reloads more than once
      }
      setAutoReloading(true);
      window.location.reload();
    }
  }, [isStaleChunk]);

  if (autoReloading) {
    return (
      <div style={pageStyle}>
        <div style={spinnerStyle} />
        <p style={mutedTextStyle}>A newer version of ImageCare is available. Updating…</p>
        {/* Scoped here (not assumed global) since this can render before
            LoadingScreen ever has - same pattern LoadingScreen itself uses. */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={iconWrapStyle}>
        <AlertTriangle size={26} color="var(--color-primary-600, #b91c1c)" />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text, #1f2937)', marginBottom: 6 }}>
          {isStaleChunk ? 'A newer version of ImageCare is available' : 'Something went wrong loading this page'}
        </p>
        <p style={mutedTextStyle}>
          {isStaleChunk
            ? 'Please reload to continue - your data is safe.'
            : "This usually clears up with a refresh. If it keeps happening, your data is safe and it's worth letting support know."}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={() => window.location.reload()} style={primaryButtonStyle}>
          <RefreshCw size={14} /> Reload page
        </button>
        <button onClick={() => navigate('/dashboard')} style={secondaryButtonStyle}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  gap: 16,
  padding: 24,
  backgroundColor: 'var(--color-bg, #f9fafb)',
};

const iconWrapStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: '50%',
  background: 'var(--color-primary-50, #fef2f2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const mutedTextStyle: CSSProperties = {
  fontSize: 'var(--text-sm, 13px)',
  color: 'var(--color-text-muted, #6b7280)',
  fontWeight: 400,
};

const spinnerStyle: CSSProperties = {
  width: 24,
  height: 24,
  border: '2px solid var(--color-gray-200, #e5e7eb)',
  borderTopColor: 'var(--color-primary-500, #ef4444)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

const primaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-primary-600, #1d4ed8)',
  color: 'white',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid var(--color-gray-200, #e5e7eb)',
  background: 'white',
  color: 'var(--color-text, #1f2937)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};
