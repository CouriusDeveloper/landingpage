import { type InputHTMLAttributes } from 'react'
import clsx from 'clsx'

type InputProps = {
  label: string
  hint?: string
} & InputHTMLAttributes<HTMLInputElement>

export function Input({ label, hint, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name

  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-primary" htmlFor={inputId}>
      {label}
      <input
        id={inputId}
        className={clsx(
          'rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-primary placeholder:text-secondary/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30',
          className,
        )}
        {...rest}
      />
      {hint && <span className="text-xs font-normal text-secondary">{hint}</span>}
    </label>
  )
}
