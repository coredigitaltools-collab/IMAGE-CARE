import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-card border border-ink-100 bg-white shadow-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
