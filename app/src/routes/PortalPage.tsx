import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Section } from '../components/ui/Section'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

type ProjectSummary = {
  id: string
  name: string
  status: string
  package_type: string
  created_at: string
  current_phase: { customer_visible_status: string | null } | null
}

const statusLabels: Record<string, string> = {
  pending: 'Ausstehend',
  pending_payment: 'Warte auf Zahlung',
  in_progress: 'In Bearbeitung',
  discovery: 'Discovery',
  design: 'Design',
  development: 'Entwicklung',
  review: 'Review',
  launched: 'Live',
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  pending_payment: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  discovery: 'bg-purple-100 text-purple-800',
  design: 'bg-pink-100 text-pink-800',
  development: 'bg-indigo-100 text-indigo-800',
  review: 'bg-orange-100 text-orange-800',
  launched: 'bg-emerald-100 text-emerald-800',
}

export function PortalPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkoutStatus = searchParams.get('checkout')
  const subscriptionStatus = searchParams.get('subscription')

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false)
      return
    }

    const client = supabase
    const load = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: queryError } = await (client as any)
          .from('projects')
          .select(`
            id,
            name,
            status,
            package_type,
            created_at,
            current_phase:project_phases(customer_visible_status)
          `)
          .eq('offer_id', user.id)
          .order('created_at', { ascending: false })

        if (queryError) throw queryError

        // Transform data to get current phase status
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const projectsWithPhase = (data ?? []).map((p: any) => ({
          ...p,
          current_phase: Array.isArray(p.current_phase) ? p.current_phase[0] : p.current_phase,
        }))

        setProjects(projectsWithPhase)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Projekte konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [user])

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <Section
      title="Dein Kundenportal"
      description="Hier siehst du den Status deiner Projekte und Rechnungen."
    >
      {/* Success/Cancel Messages */}
      {checkoutStatus === 'success' && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
          <strong>Zahlung erfolgreich!</strong> Dein Projekt wird jetzt gestartet.
        </div>
      )}
      {checkoutStatus === 'cancelled' && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800">
          Zahlung abgebrochen. Du kannst jederzeit neu starten.
        </div>
      )}
      {subscriptionStatus === 'success' && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
          <strong>Hosting aktiviert!</strong> Deine monatliche Abrechnung läuft.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          {/* Loading State */}
          {loading && (
            <Card>
              <p className="text-center text-secondary">Projekte werden geladen…</p>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Card>
              <p className="text-center text-red-600">{error}</p>
            </Card>
          )}

          {/* No Projects */}
          {!loading && !error && projects.length === 0 && (
            <Card>
              <div className="text-center">
                <h3 className="text-xl font-semibold text-primary">Noch kein Projekt</h3>
                <p className="mt-2 text-secondary">
                  Starte jetzt dein erstes Website-Projekt.
                </p>
                <Button to="/onboarding" className="mt-4">
                  Projekt starten
                </Button>
              </div>
            </Card>
          )}

          {/* Project List */}
          {projects.map((project) => (
            <Card key={project.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                    {project.package_type} Paket
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-primary">{project.name}</h3>
                  <p className="mt-1 text-sm text-secondary">
                    {project.current_phase?.customer_visible_status ??
                      statusLabels[project.status] ??
                      project.status}
                  </p>
                  <p className="mt-2 text-xs text-secondary">
                    Erstellt am {formatDate(project.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      statusColors[project.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {statusLabels[project.status] ?? project.status}
                  </span>
                  <Button to={`/portal/projekt/${project.id}`} size="sm">
                    Details ansehen
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {/* Start New Project */}
          {projects.length > 0 && (
            <div className="text-center">
              <Button to="/onboarding" variant="secondary">
                Neues Projekt starten
              </Button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-primary">Schnellzugriff</h3>
            <div className="mt-4 space-y-2">
              <Button to="/portal/rechnungen" variant="secondary" className="w-full">
                Rechnungen ansehen
              </Button>
              <Button to="/onboarding" className="w-full">
                Neues Projekt
              </Button>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-primary">Hilfe benötigt?</h3>
            <p className="mt-2 text-sm text-secondary">
              Bei Fragen zu deinem Projekt kannst du uns jederzeit kontaktieren.
            </p>
            <Button to="/kontakt" variant="ghost" className="mt-4 w-full">
              Kontakt aufnehmen
            </Button>
          </Card>
        </div>
      </div>
    </Section>
  )
}