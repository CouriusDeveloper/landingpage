import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { navAnchors } from '../../content/site'
import { useAuth } from '../../context/AuthContext'

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, isAdmin, signOut } = useAuth()

  const primaryCta = user ? (isAdmin ? { label: 'Admin', to: '/admin' } : { label: 'Portal', to: '/portal' }) : { label: 'Login', to: '/login' }
  const secondaryCta = user ? { label: 'Abmelden', to: '/' } : { label: 'Projekt starten', to: '/register' }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-content items-center justify-between px-4 py-4">
        <NavLink to="/" className="font-heading text-xl font-semibold text-primary" onClick={() => setIsOpen(false)}>
          {/* Branding entfernt */}
        </NavLink>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-secondary lg:flex">
          {navAnchors.slice(0, 5).map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                clsx('transition-colors hover:text-primary', isActive && 'text-accent')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <Button to={primaryCta.to} size="md" variant="secondary">
            {primaryCta.label}
          </Button>
          {user ? (
            <Button
              size="md"
              onClick={() => {
                void signOut()
              }}
            >
              {secondaryCta.label}
            </Button>
          ) : (
            <Button to={secondaryCta.to} size="md">
              {secondaryCta.label}
            </Button>
          )}
        </div>
        <button
          className="rounded-full border border-slate-200 p-2 text-primary lg:hidden"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-label="Navigation öffnen"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {isOpen && (
        <div className="border-t border-slate-100 bg-white px-4 py-6 lg:hidden">
          <nav className="flex flex-col gap-4 text-base font-semibold text-secondary">
            {navAnchors.slice(0, 5).map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  clsx('transition-colors hover:text-primary', isActive && 'text-accent')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 space-y-2">
            <Button to={primaryCta.to} size="md" className="w-full" onClick={() => setIsOpen(false)}>
              {primaryCta.label}
            </Button>
            {user ? (
              <Button
                size="md"
                className="w-full"
                onClick={() => {
                  void signOut()
                  setIsOpen(false)
                }}
              >
                {secondaryCta.label}
              </Button>
            ) : (
              <Button to={secondaryCta.to} size="md" className="w-full" onClick={() => setIsOpen(false)}>
                {secondaryCta.label}
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
