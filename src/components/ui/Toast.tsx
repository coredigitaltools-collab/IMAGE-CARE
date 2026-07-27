import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Info, CheckCircle2 } from 'lucide-react'

interface Toast {
  id: number
  message: string
  tone: 'info' | 'success'
}

interface ToastContextValue {
  showToast: (message: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

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
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm font-medium text-ink-900 shadow-card-hover"
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

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
