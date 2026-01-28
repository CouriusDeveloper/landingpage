import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Project = {
  id: string
  name: string
  status: string
  package_type: string
  created_at: string
  preview_visible: boolean
  has_pending_changes: boolean
  selected_addons: string[] | null
  preview_url: string | null
  contact_email: string | null
  offer_id: string | null
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Warte auf Zahlung', color: 'bg-yellow-100 text-yellow-800' },
  discovery: { label: 'Discovery', color: 'bg-purple-100 text-purple-800' },
  generating: { label: 'Generierung läuft', color: 'bg-cyan-100 text-cyan-800' },
  design: { label: 'Design', color: 'bg-pink-100 text-pink-800' },
  development: { label: 'Entwicklung', color: 'bg-indigo-100 text-indigo-800' },
  review: { label: 'Review', color: 'bg-orange-100 text-orange-800' },
  ready_for_launch: { label: 'Bereit für Launch', color: 'bg-emerald-100 text-emerald-800' },
  launched: { label: 'Live', color: 'bg-green-100 text-green-800' },
}

const packagePrices: Record<string, number> = {
  starter: 999,
  growth: 1999,
  pro: 3999,
}

export function AdminCustomersPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'live'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const client = supabase
    const loadProjects = async () => {
      try {
        const { data, error } = await client
          .from('projects')
          .select('id, name, status, package_type, created_at, preview_visible, has_pending_changes, selected_addons, preview_url, contact_email, offer_id')
          .order('created_at', { ascending: false })

        if (error) throw error
        setProjects(data || [])
      } catch (err) {
        console.error('Load projects error:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadProjects()
  }, [])

  // Filter projects
  const filteredProjects = projects.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && 
        !p.contact_email?.toLowerCase().includes(search.toLowerCase())) {
      return false
    }
    if (filter === 'pending' && p.status !== 'pending_payment') return false
    if (filter === 'active' && !['discovery', 'generating', 'design', 'development', 'review'].includes(p.status)) return false
    if (filter === 'live' && !['ready_for_launch', 'launched'].includes(p.status)) return false
    return true
  })

  // Stats
  const stats = {
    total: projects.length,
    pending: projects.filter(p => p.status === 'pending_payment').length,
    active: projects.filter(p => ['discovery', 'generating', 'design', 'development', 'review'].includes(p.status)).length,
    live: projects.filter(p => ['ready_for_launch', 'launched'].includes(p.status)).length,
    pendingChanges: projects.filter(p => p.has_pending_changes).length,
    revenue: projects.reduce((sum, p) => sum + (packagePrices[p.package_type] || 0), 0),
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kunden & Projekte</h1>
        <p className="mt-1 text-sm text-gray-500">
          Alle Kundenprojekte verwalten und überwachen.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Gesamt</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-gray-500">Ausstehend</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.active}</p>
          <p className="text-xs text-gray-500">In Bearbeitung</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.live}</p>
          <p className="text-xs text-gray-500">Live</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.pendingChanges}</p>
          <p className="text-xs text-amber-700">Änderungen</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-xl font-bold text-emerald-600">{formatCurrency(stats.revenue)}</p>
          <p className="text-xs text-emerald-700">Umsatz</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {(['all', 'pending', 'active', 'live'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'Alle' : f === 'pending' ? 'Ausstehend' : f === 'active' ? 'Aktiv' : 'Live'}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Suchen nach Name oder E-Mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-accent focus:bg-white focus:outline-none"
            />
            <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <p className="text-gray-500">Keine Projekte gefunden.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Projekt</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Paket</th>
                <th className="px-6 py-3">Erstellt</th>
                <th className="px-6 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProjects.map((project) => {
                const status = statusLabels[project.status] || { label: project.status, color: 'bg-gray-100 text-gray-800' }
                
                return (
                  <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <Link 
                          to={`/admin/projects/${project.id}`}
                          className="font-medium text-gray-900 hover:text-accent"
                        >
                          {project.name}
                        </Link>
                        <p className="text-sm text-gray-500">{project.contact_email || 'Keine E-Mail'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-2 py-1 text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        {project.has_pending_changes && (
                          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                            !
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="capitalize text-sm text-gray-600">{project.package_type}</span>
                      {project.selected_addons && project.selected_addons.length > 0 && (
                        <span className="ml-2 text-xs text-gray-400">
                          +{project.selected_addons.length}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(project.created_at).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {project.preview_url && (
                          <button
                            onClick={() => window.open(project.preview_url!, '_blank')}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Vorschau öffnen"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        )}
                        <Link
                          to={`/admin/projects/${project.id}`}
                          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
                        >
                          Verwalten
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}