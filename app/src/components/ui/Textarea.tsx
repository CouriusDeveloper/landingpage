import { type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

type TextareaProps = {
  label: string
  hint?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ label, hint, className, id, ...rest }: TextareaProps) {
  const textareaId = id ?? rest.name

  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-primary" htmlFor={textareaId}>
      {label}
      <textarea
        id={textareaId}
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
