import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Section } from '../ui/Section'
import type { ReactElement } from 'react'

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <Section title="Portal wird geladen" description="Wir prüfen deine Zugangsdaten.">
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-6 text-secondary">Bitte einen Moment Geduld.</div>
      </Section>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}