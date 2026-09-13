import { useCallback, useState, type ReactNode } from 'react'
import { Info, CheckCircle2 } from 'lucide-react'
import { ToastContext } from './toastState'

interface Toast {
  id: number
  message: string
  tone: 'info' | 'success'
}


export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/*
        Bug fix (2026-09-12): "the add brand button does not work" (round 2)
        - the 2026-09-12 fix that added showToast() to BrandQuickSelect's
        error path was real, but the toast itself was invisible whenever a
        modal was open, which is exactly when this fires (Add Product is a
        modal). This container used a hardcoded Tailwind `z-50`, while
        Modal.tsx (src/components/ui/Modal.tsx) paints every dialog at
        `var(--z-modal)` = 400 (see globals.css's z-index scale) - so any
        toast fired while a modal was open rendered underneath the modal's
        backdrop, completely hidden. The design system already defines
        `--z-toast: 500` for exactly this layer (and
        src/components/ui/index.tsx's separate, unused toast implementation
        already uses it correctly) - this container just was never wired to
        it. This affects every toast fired from inside any modal in the app,
        not just this one field.
      */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4"
        style={{ zIndex: 'var(--z-toast)' }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-ink-100 bg-surface px-4 py-2.5 text-sm font-medium text-ink-900 shadow-card-hover"
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 size={16} className="text-success-500" aria-hidden="true" />
            ) : (
              <Info size={16} className="text-brand-blue-500" aria-hidden="true" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
