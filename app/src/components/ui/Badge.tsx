import clsx from 'clsx'
import { type ReactNode } from 'react'

type BadgeProps = {
  children: ReactNode
  variant?: 'default' | 'accent'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-4 py-1 text-sm font-medium',
        variant === 'accent' ? 'bg-accent/10 text-accent' : 'bg-slate-100 text-secondary',
        className,
      )}
    >
      {children}
    </span>
  )
}
