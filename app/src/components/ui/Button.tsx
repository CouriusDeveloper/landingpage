import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'

const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variantStyles: Record<'primary' | 'secondary' | 'ghost', string> = {
  primary: 'bg-accent text-white hover:bg-blue-600',
  secondary: 'border border-blue-200 text-accent hover:border-accent hover:text-blue-700',
  ghost: 'text-primary hover:text-accent',
}

const sizeStyles: Record<'md' | 'lg', string> = {
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

type ButtonProps = {
  children: ReactNode
  to?: string
  external?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  className?: string
  onClick?: (event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>

export function Button({
  children,
  to,
  external,
  variant = 'primary',
  size = 'md',
  className,
  ...buttonProps
}: ButtonProps) {
  const classes = clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)
  const { onClick, ...rest } = buttonProps

  if (to) {
    const isExternal = external ?? to.startsWith('http')
    if (isExternal) {
      return (
        <a href={to} className={classes} rel="noreferrer" target="_blank" onClick={onClick}>
          {children}
        </a>
      )
    }

    return (
      <Link to={to} className={classes} onClick={onClick}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} onClick={onClick} {...rest}>
      {children}
    </button>
  )
}
