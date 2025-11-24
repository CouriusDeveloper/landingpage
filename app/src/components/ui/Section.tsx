import clsx from 'clsx'
import { type ReactNode } from 'react'

type SectionProps = {
  id?: string
  background?: 'default' | 'muted' | 'dark'
  className?: string
  eyebrow?: string
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function Section({
  id,
  background = 'default',
  className,
  eyebrow,
  title,
  description,
  actions,
  children,
}: SectionProps) {
  const bgClass =
    background === 'muted'
      ? 'bg-slate-50'
      : background === 'dark'
        ? 'bg-primary text-white'
        : 'bg-transparent'

  return (
    <section id={id} className={clsx(bgClass, 'px-4 py-16 md:py-20', className)}>
      <div className="mx-auto max-w-content">
        {(eyebrow || title || description || actions) && (
          <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>}
              {title && (
                <h2 className={clsx('font-heading text-3xl font-semibold text-primary', background === 'dark' && 'text-white')}>
                  {title}
                </h2>
              )}
              {description && (
                <p className={clsx('mt-4 text-lg text-secondary', background === 'dark' && 'text-white/80')}>
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="flex flex-none flex-col gap-2 md:text-right">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </section>
  )
}
