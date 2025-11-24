import clsx from 'clsx'
import { type ReactNode } from 'react'

type CardProps = {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={clsx('rounded-2xl border border-slate-100 bg-white/90 p-6 shadow-card backdrop-blur-sm', className)}>
      {children}
    </div>
  )
}
