import clsx from 'clsx'
import { type ReactNode } from 'react'

type SelectableCardProps = {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
}

export function SelectableCard({ selected = false, onClick, children }: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full rounded-2xl border p-6 text-left transition-all',
        selected ? 'border-accent bg-accent/10 shadow-card' : 'border-slate-100 bg-white/90 hover:border-accent/60',
      )}
    >
      {children}
    </button>
  )
}