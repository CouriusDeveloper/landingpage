import { NavLink } from 'react-router-dom'
import { navAnchors } from '../../content/site'

export function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-white/80">
      <div className="mx-auto flex max-w-content flex-col gap-8 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          {/* Branding entfernt */}
          <p className="mt-2 text-sm text-secondary">Individuelle React-Websites ohne WordPress.</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-secondary">
          {navAnchors.map((link) => (
            <NavLink key={link.path} to={link.path} className="hover:text-primary">
              {link.label}
            </NavLink>
          ))}
        </div>
        <div className="text-sm text-secondary">
          {/* E-Mail entfernt */}
          <p className="mt-1">LinkedIn · GitHub · Impressum</p>
        </div>
      </div>
    </footer>
  )
}
