import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Section } from '../ui/Section'
import type { ReactElement } from 'react'

export function AdminRoute({ children }: { children: ReactElement }) {
  const { user, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <Section title="Admin-Bereich wird geladen" description="Wir prüfen deine Berechtigungen.">
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-6 text-secondary">Bitte einen Moment Geduld.</div>
      </Section>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/portal" replace />
  }

  return children
}