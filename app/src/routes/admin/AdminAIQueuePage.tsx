import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type PipelineRun = {
  id: string
  project_id: string
  correlation_id: string
  status: string
  current_phase: number
  current_agent: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  total_tokens: number
  total_cost_usd: number
  error_message: string | null
  error_agent: string | null
  total_retries: number
  project?: { name: string }
}

type AgentRun = {
  id: string
  pipeline_run_id: string
  agent_name: string
  phase: number
  status: string
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  tokens_used: number
  cost_usd: number
  retry_count: number
  error_message: string | null
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Wartend' },
  phase_1: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Phase 1' },
  phase_2: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Phase 2' },
  phase_3: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Phase 3' },
  phase_4: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Phase 4' },
  phase_5: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Phase 5' },
  phase_6: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Phase 6' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Fertig' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Fehler' },
  needs_human: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Manuell' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Läuft' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Abgebrochen' },
}

const agentLabels: Record<string, string> = {
  'agent-collector': 'Collector',
  'agent-code-collector': 'Code Collector',
  'agent-shared-components': 'Shared Components',
  'agent-page-builder': 'Page Builder',
  'agent-deployer': 'Deployer',
}

export function AdminAIQueuePage() {
  const [pipelines, setPipelines] = useState<PipelineRun[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const client = supabase
    const loadPipelines = async () => {
      try {
        const { data, error } = await client
          .from('pipeline_runs')
          .select('*, projects(name)')
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formatted = (data || []).map((p: any) => ({
          ...p,
          project: p.projects,
        }))
        setPipelines(formatted)
      } catch (err) {
        console.error('Load pipelines error:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadPipelines()

    // Realtime subscription
    const channel = client
      .channel('pipeline_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pipeline_runs',
      }, () => {
        void loadPipelines()
      })
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!supabase || !selectedPipeline) {
      setAgentRuns([])
      return
    }

    const client = supabase
    const loadAgentRuns = async () => {
      const { data } = await client
        .from('agent_runs')
        .select('*')
        .eq('pipeline_run_id', selectedPipeline)
        .order('phase', { ascending: true })
        .order('sequence', { ascending: true })

      setAgentRuns(data || [])
    }

    void loadAgentRuns()
  }, [selectedPipeline])

  const filteredPipelines = pipelines.filter(p => {
    if (filter === 'running') return ['pending', 'phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'].includes(p.status)
    if (filter === 'completed') return p.status === 'completed'
    if (filter === 'failed') return ['failed', 'needs_human'].includes(p.status)
    return true
  })

  const stats = {
    total: pipelines.length,
    running: pipelines.filter(p => ['pending', 'phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'].includes(p.status)).length,
    completed: pipelines.filter(p => p.status === 'completed').length,
    failed: pipelines.filter(p => ['failed', 'needs_human'].includes(p.status)).length,
    totalTokens: pipelines.reduce((sum, p) => sum + (p.total_tokens || 0), 0),
    totalCost: pipelines.reduce((sum, p) => sum + (p.total_cost_usd || 0), 0),
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const formatCost = (usd: number) => {
    return `$${usd.toFixed(4)}`
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
    return tokens.toString()
  }

  const stopAllPipelines = async () => {
    if (!confirm('ALLE laufenden Pipelines und Agents stoppen?')) {
      return
    }
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipeline-stop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        }
      )

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Pipeline stop failed')
      }

      alert(`Gestoppt: ${result.stoppedPipelines} Pipelines, ${result.stoppedAgents} Agents`)
      
      // Reload page data
      window.location.reload()

    } catch (err) {
      console.error('Stop all pipelines error:', err)
      alert(`Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
    }
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Pipeline Queue</h1>
          <p className="mt-1 text-sm text-gray-500">
            Überwache und verwalte laufende Generierungsprozesse.
          </p>
        </div>
        {stats.running > 0 && (
          <button
            onClick={stopAllPipelines}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Alle stoppen ({stats.running})
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Gesamt</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Laufend</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{stats.running}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Abgeschlossen</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Fehlgeschlagen</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Tokens / Kosten</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {formatTokens(stats.totalTokens)} / {formatCost(stats.totalCost)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'running', 'completed', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'Alle' : f === 'running' ? 'Laufend' : f === 'completed' ? 'Fertig' : 'Fehler'}
          </button>
        ))}
      </div>

      {/* Pipeline List */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipelines */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Pipeline Runs ({filteredPipelines.length})</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {filteredPipelines.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Keine Pipeline-Runs gefunden.
              </div>
            ) : (
              filteredPipelines.map((pipeline) => {
                const status = statusColors[pipeline.status] || statusColors.pending
                const isSelected = selectedPipeline === pipeline.id
                
                return (
                  <button
                    key={pipeline.id}
                    onClick={() => setSelectedPipeline(isSelected ? null : pipeline.id)}
                    className={`w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-accent/5 border-l-2 border-l-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/admin/projekt/${pipeline.project_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-gray-900 hover:text-accent"
                        >
                          {pipeline.project?.name || 'Unbekannt'}
                        </Link>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </div>
                      {pipeline.total_retries > 0 && (
                        <span className="text-xs text-amber-600">
                          {pipeline.total_retries} Retries
                        </span>
                      )}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          pipeline.status === 'completed' ? 'bg-green-500' :
                          pipeline.status === 'failed' ? 'bg-red-500' :
                          'bg-accent'
                        }`}
                        style={{ width: pipeline.status === 'completed' ? '100%' : `${(pipeline.current_phase / 6) * 100}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      {pipeline.current_agent && (
                        <span>Agent: {agentLabels[pipeline.current_agent] || pipeline.current_agent}</span>
                      )}
                      <span>{formatDuration(pipeline.duration_ms)}</span>
                      <span>{formatTokens(pipeline.total_tokens)} Tokens</span>
                      <span>{formatCost(pipeline.total_cost_usd)}</span>
                    </div>

                    {pipeline.error_message && (
                      <p className="mt-2 text-xs text-red-600 truncate">
                        Fehler: {pipeline.error_message}
                      </p>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Agent Details */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="font-semibold text-gray-900">
              {selectedPipeline ? 'Agent Runs' : 'Wähle eine Pipeline'}
            </h2>
          </div>
          <div className="p-6">
            {!selectedPipeline ? (
              <div className="py-8 text-center text-gray-500">
                <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                <p>Klicke auf eine Pipeline um Details zu sehen.</p>
              </div>
            ) : agentRuns.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                Keine Agent-Runs vorhanden.
              </div>
            ) : (
              <div className="space-y-4">
                {agentRuns.map((agent) => {
                  const status = statusColors[agent.status] || statusColors.pending
                  
                  return (
                    <div
                      key={agent.id}
                      className="rounded-lg border border-gray-100 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${
                            agent.status === 'completed' ? 'bg-green-500' : 
                            agent.status === 'running' ? 'bg-blue-500 animate-pulse' :
                            agent.status === 'failed' ? 'bg-red-500' : 'bg-gray-300'
                          }`} />
                          <span className="font-medium text-gray-900">
                            {agentLabels[agent.agent_name] || agent.agent_name}
                          </span>
                        </div>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}>
                          Phase {agent.phase}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span>{formatDuration(agent.duration_ms)}</span>
                        <span>{formatTokens(agent.tokens_used)} Tokens</span>
                        <span>{formatCost(agent.cost_usd)}</span>
                        {agent.retry_count > 0 && (
                          <span className="text-amber-600">{agent.retry_count} Retries</span>
                        )}
                      </div>

                      {agent.error_message && (
                        <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600">
                          {agent.error_message}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}