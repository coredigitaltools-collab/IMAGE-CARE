import { createContext } from 'react'

export interface ToastContextValue {
  showToast: (message: string, tone?: 'info' | 'success') => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
