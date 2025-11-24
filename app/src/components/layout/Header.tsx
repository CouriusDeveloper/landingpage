import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { navAnchors } from '../../content/site'

export function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-content items-center justify-between px-4 py-4">
        <NavLink to="/" className="font-heading text-xl font-semibold text-primary" onClick={() => setIsOpen(false)}>
          Fynn & Jan
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
        <div className="hidden lg:block">
          <Button to="/kontakt" size="md">
            Projekt anfragen
          </Button>
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
          <Button to="/kontakt" size="md" className="mt-6 w-full" onClick={() => setIsOpen(false)}>
            Projekt anfragen
          </Button>
        </div>
      )}
    </header>
  )
}
