import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type DashboardStats = {
  totalProjects: number
  activeProjects: number
  pendingPayment: number
  liveProjects: number
  pendingChanges: number
  unreadMessages: number
  runningPipelines: number
  totalRevenue: number
}

type RecentActivity = {
  id: string
  type: 'message' | 'change_request' | 'pipeline' | 'project'
  title: string
  subtitle: string
  time: string
  status?: string
}

type PipelineRun = {
  id: string
  project_id: string
  status: string
  current_phase: number
  current_agent: string | null
  started_at: string | null
  project?: { name: string }
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  phase_1: 'bg-blue-100 text-blue-700',
  phase_2: 'bg-blue-100 text-blue-700',
  phase_3: 'bg-indigo-100 text-indigo-700',
  phase_4: 'bg-purple-100 text-purple-700',
  phase_5: 'bg-pink-100 text-pink-700',
  phase_6: 'bg-cyan-100 text-cyan-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  needs_human: 'bg-amber-100 text-amber-700',
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    activeProjects: 0,
    pendingPayment: 0,
    liveProjects: 0,
    pendingChanges: 0,
    unreadMessages: 0,
    runningPipelines: 0,
    totalRevenue: 0,
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [pipelines, setPipelines] = useState<PipelineRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const client = supabase
    const loadDashboard = async () => {
      try {
        // Load projects stats
        const { data: projectsData } = await client
          .from('projects')
          .select('id, status, has_pending_changes, package_type')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const projects = (projectsData || []) as any[]
        if (projects.length > 0) {
          const activeStatuses = ['discovery', 'generating', 'design', 'development', 'review']
          setStats(prev => ({
            ...prev,
            totalProjects: projects.length,
            activeProjects: projects.filter(p => activeStatuses.includes(p.status)).length,
            pendingPayment: projects.filter(p => p.status === 'pending_payment').length,
            liveProjects: projects.filter(p => ['ready_for_launch', 'launched'].includes(p.status)).length,
            pendingChanges: projects.filter(p => p.has_pending_changes).length,
          }))

          // Calculate revenue (simplified: starter=999, growth=1999, pro=3999)
          const prices: Record<string, number> = { starter: 999, growth: 1999, pro: 3999 }
          const revenue = projects.reduce((sum, p) => sum + (prices[p.package_type] || 0), 0)
          setStats(prev => ({ ...prev, totalRevenue: revenue }))
        }

        // Load unread messages count
        const { count: unreadCount } = await client
          .from('project_messages')
          .select('*', { count: 'exact', head: true })
          .eq('read_by_admin', false)
          .eq('sender_role', 'client')

        setStats(prev => ({ ...prev, unreadMessages: unreadCount || 0 }))

        // Load running pipelines
        const { data: pipelineData } = await client
          .from('pipeline_runs')
          .select('id, project_id, status, current_phase, current_agent, started_at, projects(name)')
          .in('status', ['pending', 'phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'])
          .order('started_at', { ascending: false })
          .limit(5)

        if (pipelineData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formatted = pipelineData.map((p: any) => ({
            ...p,
            project: p.projects,
          }))
          setPipelines(formatted)
          setStats(prev => ({ ...prev, runningPipelines: pipelineData.length }))
        }

        // Load recent activity (messages + pipelines)
        const activities: RecentActivity[] = []

        // Recent messages
        const { data: messages } = await client
          .from('project_messages')
          .select('id, content, message_type, created_at, project_id, projects(name)')
          .eq('sender_role', 'client')
          .order('created_at', { ascending: false })
          .limit(5)

        if (messages) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages.forEach((m: any) => {
            activities.push({
              id: m.id,
              type: m.message_type === 'change_request' ? 'change_request' : 'message',
              title: m.message_type === 'change_request' ? 'Neue Änderungsanfrage' : 'Neue Nachricht',
              subtitle: `${m.projects?.name || 'Unbekannt'}: ${m.content.substring(0, 50)}...`,
              time: m.created_at,
            })
          })
        }

        // Recent pipeline completions
        const { data: completedPipelines } = await client
          .from('pipeline_runs')
          .select('id, status, completed_at, projects(name)')
          .in('status', ['completed', 'failed'])
          .order('completed_at', { ascending: false })
          .limit(3)

        if (completedPipelines) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          completedPipelines.forEach((p: any) => {
            activities.push({
              id: p.id,
              type: 'pipeline',
              title: p.status === 'completed' ? 'Pipeline abgeschlossen' : 'Pipeline fehlgeschlagen',
              subtitle: p.projects?.name || 'Unbekannt',
              time: p.completed_at,
              status: p.status,
            })
          })
        }

        // Sort by time
        activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        setRecentActivity(activities.slice(0, 8))

      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadDashboard()
  }, [])

  const formatTime = (time: string) => {
    const date = new Date(time)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return 'Gerade eben'
    if (minutes < 60) return `vor ${minutes}m`
    if (hours < 24) return `vor ${hours}h`
    return `vor ${days}d`
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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Willkommen zurück! Hier ist dein Überblick.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Umsatz (Total)</p>
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.totalProjects} Projekte</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Aktive Projekte</p>
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-blue-600">{stats.activeProjects}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.liveProjects} bereits live</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Ausstehend</p>
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-amber-600">{stats.pendingPayment}</p>
          <p className="mt-1 text-xs text-gray-500">Warten auf Zahlung</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Änderungsanfragen</p>
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-red-600">{stats.pendingChanges}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.unreadMessages} ungelesene Nachrichten</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Letzte Aktivitäten</h2>
            <Link to="/admin/kunden" className="text-sm font-medium text-accent hover:underline">
              Alle anzeigen
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Noch keine Aktivitäten vorhanden.
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 px-6 py-4">
                  <div className={`mt-0.5 rounded-full p-2 ${
                    activity.type === 'change_request' ? 'bg-amber-100 text-amber-600' :
                    activity.type === 'message' ? 'bg-blue-100 text-blue-600' :
                    activity.status === 'completed' ? 'bg-green-100 text-green-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {activity.type === 'change_request' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      ) : activity.type === 'message' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      ) : activity.status === 'completed' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      )}
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{activity.title}</p>
                    <p className="mt-0.5 truncate text-sm text-gray-500">{activity.subtitle}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-gray-400">
                    {formatTime(activity.time)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Running Pipelines */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Laufende Pipelines</h2>
            <Link to="/admin/ai-queue" className="text-sm font-medium text-accent hover:underline">
              Queue
            </Link>
          </div>
          <div className="p-4">
            {pipelines.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                <p className="text-sm">Keine laufenden Pipelines</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pipelines.map((pipeline) => (
                  <Link
                    key={pipeline.id}
                    to={`/admin/projekt/${pipeline.project_id}`}
                    className="block rounded-lg border border-gray-100 p-3 hover:border-accent/30 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 truncate">
                        {pipeline.project?.name || 'Unbekannt'}
                      </p>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[pipeline.status] || 'bg-gray-100'}`}>
                        Phase {pipeline.current_phase}
                      </span>
                    </div>
                    {pipeline.current_agent && (
                      <p className="mt-1 text-xs text-gray-500">
                        Agent: {pipeline.current_agent}
                      </p>
                    )}
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${(pipeline.current_phase / 6) * 100}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Schnellaktionen</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/admin/kunden"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            Kunden verwalten
          </Link>
          <Link
            to="/admin/ai-queue"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
            AI Queue
          </Link>
          <Link
            to="/admin/kosten"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Kosten-Analyse
          </Link>
        </div>
      </div>
    </div>
  )
}