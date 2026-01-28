import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// =============================================================================
// TYPES
// =============================================================================

type PipelineRun = {
  id: string
  project_id: string
  correlation_id: string
  status: string
  current_phase: number
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  total_tokens: number
  total_cost_usd: number
  error_message: string | null
  error_agent: string | null
  error_code: string | null
  total_retries: number
  preview_url: string | null
  projects?: { name: string }
}

type AgentRun = {
  id: string
  pipeline_run_id: string
  agent_name: string
  phase: number
  sequence: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  model_used: string | null
  cost_usd: number | null
  quality_score: number | null
  validation_passed: boolean | null
  error_code: string | null
  error_message: string | null
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PHASES = [
  { id: 1, name: 'Strategie', agents: ['strategist'] },
  { id: 2, name: 'Analyse', agents: ['seo', 'legal', 'visual'] },
  { id: 3, name: 'Content', agents: ['image', 'collector', 'content-pack', 'editor'] },
  { id: 4, name: 'Code', agents: ['code-renderer', 'shared-components', 'section-generator', 'page-builder'] },
  { id: 5, name: 'Integration', agents: ['sanity-setup', 'resend-setup', 'analytics'] },
  { id: 6, name: 'Deploy', agents: ['deployer'] },
]

const AGENT_INFO: Record<string, { label: string; description: string; icon: string }> = {
  'strategist': { label: 'Strategist', description: 'Zielgruppenanalyse & Messaging', icon: '🎯' },
  'seo': { label: 'SEO', description: 'Meta-Tags & Keywords', icon: '🔍' },
  'legal': { label: 'Legal', description: 'Impressum & Datenschutz', icon: '⚖️' },
  'visual': { label: 'Visual', description: 'Farben & Typografie', icon: '🎨' },
  'image': { label: 'Image', description: 'Bildauswahl (Unsplash)', icon: '🖼️' },
  'collector': { label: 'Collector', description: 'Phase 2 Sammlung', icon: '📦' },
  'content-pack': { label: 'Content Pack', description: 'Alle Seiteninhalte', icon: '📝' },
  'editor': { label: 'Editor', description: 'Qualitätsprüfung & Korrektur', icon: '✅' },
  'code-renderer': { label: 'Code Renderer', description: 'Phase 4 Orchestrator', icon: '🎬' },
  'shared-components': { label: 'Shared Components', description: 'Header, Footer, Utils', icon: '🧩' },
  'section-generator': { label: 'Section Generator', description: 'Einzelne Sections (parallel)', icon: '📐' },
  'page-builder': { label: 'Page Builder', description: 'Seiten assemblieren', icon: '📄' },
  'sanity-setup': { label: 'Sanity CMS', description: 'CMS Schema & Config', icon: '🗄️' },
  'resend-setup': { label: 'Resend E-Mail', description: 'Kontaktformular Setup', icon: '📧' },
  'analytics': { label: 'Analytics', description: 'Tracking Integration', icon: '📊' },
  'deployer': { label: 'Deployer', description: 'Vercel Deployment', icon: '🚀' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', ring: 'ring-gray-300' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-400' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-400' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-400' },
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatTokens(tokens: number | null | undefined): string {
  if (!tokens) return '-'
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return tokens.toString()
}

function formatCost(usd: number | null | undefined): string {
  if (!usd) return '-'
  return `$${usd.toFixed(4)}`
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  
  if (diffSec < 60) return `vor ${diffSec}s`
  if (diffMin < 60) return `vor ${diffMin}m`
  if (diffHour < 24) return `vor ${diffHour}h`
  return date.toLocaleDateString('de-DE')
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AdminPipelineMonitorPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<AgentRun | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Load data
  const loadData = useCallback(async () => {
    if (!supabase || !pipelineId) return

    try {
      // Load pipeline
      const { data: pipelineData } = await supabase
        .from('pipeline_runs')
        .select('*, projects(name)')
        .eq('id', pipelineId)
        .single()

      if (pipelineData) {
        setPipeline(pipelineData as unknown as PipelineRun)
      }

      // Load agent runs
      const { data: agentData } = await supabase
        .from('agent_runs')
        .select('*')
        .eq('pipeline_run_id', pipelineId)
        .order('phase', { ascending: true })
        .order('sequence', { ascending: true })
        .order('created_at', { ascending: true })

      setAgentRuns(agentData || [])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [pipelineId])

  // Initial load + auto-refresh
  useEffect(() => {
    void loadData()

    if (!autoRefresh) return

    const interval = setInterval(() => {
      void loadData()
    }, 3000) // Alle 3 Sekunden

    return () => clearInterval(interval)
  }, [loadData, autoRefresh])

  // Realtime subscription
  useEffect(() => {
    if (!supabase || !pipelineId) return

    const channel = supabase!
      .channel(`pipeline-${pipelineId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pipeline_runs',
        filter: `id=eq.${pipelineId}`,
      }, () => {
        void loadData()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_runs',
        filter: `pipeline_run_id=eq.${pipelineId}`,
      }, () => {
        void loadData()
      })
      .subscribe()

    return () => {
      supabase!.removeChannel(channel)
    }
  }, [pipelineId, loadData])

  // Group agents by phase
  const agentsByPhase = PHASES.map(phase => ({
    ...phase,
    agents: agentRuns.filter(a => a.phase === phase.id),
  }))

  // Calculate stats
  const stats = {
    totalAgents: agentRuns.length,
    completed: agentRuns.filter(a => a.status === 'completed').length,
    running: agentRuns.filter(a => a.status === 'running').length,
    failed: agentRuns.filter(a => a.status === 'failed').length,
    totalTokens: agentRuns.reduce((sum, a) => sum + (a.input_tokens || 0) + (a.output_tokens || 0), 0),
    totalCost: agentRuns.reduce((sum, a) => sum + (a.cost_usd || 0), 0),
    avgDuration: agentRuns.filter(a => a.duration_ms).reduce((sum, a) => sum + (a.duration_ms || 0), 0) / Math.max(1, agentRuns.filter(a => a.duration_ms).length),
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!pipeline) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Pipeline nicht gefunden.</p>
        <Link to="/admin/ai-queue" className="mt-4 text-accent hover:underline">
          Zurück zur Queue
        </Link>
      </div>
    )
  }

  const pipelineStatus = STATUS_STYLES[pipeline.status] || STATUS_STYLES.pending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link to="/admin/ai-queue" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Pipeline Monitor</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {pipeline.projects?.name || 'Projekt'} • {pipeline.correlation_id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              autoRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {autoRefresh ? 'Live' : 'Pausiert'}
          </button>
          <span className="text-xs text-gray-400">
            Aktualisiert {timeAgo(lastUpdate.toISOString())}
          </span>
        </div>
      </div>

      {/* Pipeline Status Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`rounded-full p-3 ${pipelineStatus.bg}`}>
              {pipeline.status === 'completed' ? '✅' : 
               pipeline.status === 'failed' ? '❌' : 
               pipeline.status.startsWith('phase_') ? '⚡' : '⏳'}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {pipeline.status === 'completed' ? 'Pipeline abgeschlossen' :
                 pipeline.status === 'failed' ? 'Pipeline fehlgeschlagen' :
                 pipeline.status === 'needs_human' ? 'Manuelle Prüfung erforderlich' :
                 `Phase ${pipeline.current_phase} läuft`}
              </p>
              {pipeline.error_message && (
                <p className="mt-1 text-sm text-red-600">{pipeline.error_message}</p>
              )}
            </div>
          </div>
          {pipeline.preview_url && (
            <a
              href={pipeline.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Preview öffnen ↗
            </a>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between mb-2">
            {PHASES.map((phase) => (
              <div
                key={phase.id}
                className={`text-xs font-medium ${
                  pipeline.current_phase > phase.id ? 'text-green-600' :
                  pipeline.current_phase === phase.id ? 'text-accent' :
                  'text-gray-400'
                }`}
              >
                {phase.name}
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                pipeline.status === 'completed' ? 'bg-green-500' :
                pipeline.status === 'failed' ? 'bg-red-500' :
                'bg-accent'
              }`}
              style={{ 
                width: pipeline.status === 'completed' ? '100%' : 
                       `${((pipeline.current_phase - 1) / 6) * 100 + (1/6) * 50}%` 
              }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-6 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.totalAgents}</p>
            <p className="text-xs text-gray-500">Agents</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-gray-500">Fertig</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.running}</p>
            <p className="text-xs text-gray-500">Laufend</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            <p className="text-xs text-gray-500">Fehler</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{formatTokens(stats.totalTokens)}</p>
            <p className="text-xs text-gray-500">Tokens</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{formatCost(stats.totalCost)}</p>
            <p className="text-xs text-gray-500">Kosten</p>
          </div>
        </div>
      </div>

      {/* Phase Timeline */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-4">
          {agentsByPhase.map((phase) => (
            <div key={phase.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className={`px-4 py-3 border-b ${
                pipeline.current_phase > phase.id ? 'bg-green-50 border-green-100' :
                pipeline.current_phase === phase.id ? 'bg-accent/5 border-accent/20' :
                'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      pipeline.current_phase > phase.id ? 'bg-green-500 text-white' :
                      pipeline.current_phase === phase.id ? 'bg-accent text-white' :
                      'bg-gray-300 text-gray-600'
                    }`}>
                      {pipeline.current_phase > phase.id ? '✓' : phase.id}
                    </span>
                    <span className="font-semibold text-gray-900">Phase {phase.id}: {phase.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {phase.agents.length} Agents
                  </span>
                </div>
              </div>

              {phase.agents.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {phase.agents.map((agent) => {
                    const info = AGENT_INFO[agent.agent_name] || { label: agent.agent_name, description: '', icon: '🔧' }
                    const status = STATUS_STYLES[agent.status] || STATUS_STYLES.pending
                    
                    return (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                          selectedAgent?.id === agent.id ? 'bg-accent/5' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{info.icon}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{info.label}</span>
                                {agent.status === 'running' && (
                                  <span className="flex items-center gap-1 text-xs text-blue-600">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    läuft
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{info.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right text-xs">
                              <p className="font-medium text-gray-700">{formatDuration(agent.duration_ms)}</p>
                              <p className="text-gray-400">{formatTokens((agent.input_tokens || 0) + (agent.output_tokens || 0))}</p>
                            </div>
                            <span className={`w-2.5 h-2.5 rounded-full ${status.ring} ring-2 ${
                              agent.status === 'completed' ? 'bg-green-500' :
                              agent.status === 'running' ? 'bg-blue-500 animate-pulse' :
                              agent.status === 'failed' ? 'bg-red-500' :
                              'bg-gray-300'
                            }`} />
                          </div>
                        </div>
                        {agent.error_message && (
                          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                            {agent.error_message}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  {pipeline.current_phase < phase.id ? 'Noch nicht gestartet' : 'Keine Agents'}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Agent Detail Panel */}
        <div className="rounded-xl border border-gray-200 bg-white h-fit sticky top-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">
              {selectedAgent ? 'Agent Details' : 'Agent auswählen'}
            </h3>
          </div>
          {selectedAgent ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">
                  {AGENT_INFO[selectedAgent.agent_name]?.icon || '🔧'}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">
                    {AGENT_INFO[selectedAgent.agent_name]?.label || selectedAgent.agent_name}
                  </p>
                  <p className={`text-xs ${STATUS_STYLES[selectedAgent.status]?.text}`}>
                    {selectedAgent.status === 'completed' ? 'Abgeschlossen' :
                     selectedAgent.status === 'running' ? 'Läuft...' :
                     selectedAgent.status === 'failed' ? 'Fehlgeschlagen' : 'Wartend'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Dauer</p>
                  <p className="font-semibold">{formatDuration(selectedAgent.duration_ms)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Modell</p>
                  <p className="font-semibold text-xs">{selectedAgent.model_used || '-'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Input Tokens</p>
                  <p className="font-semibold">{formatTokens(selectedAgent.input_tokens)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Output Tokens</p>
                  <p className="font-semibold">{formatTokens(selectedAgent.output_tokens)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Kosten</p>
                  <p className="font-semibold">{formatCost(selectedAgent.cost_usd)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Qualität</p>
                  <p className="font-semibold">
                    {selectedAgent.quality_score ? `${selectedAgent.quality_score}/10` : '-'}
                  </p>
                </div>
              </div>

              {selectedAgent.error_message && (
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">
                    Fehler: {selectedAgent.error_code}
                  </p>
                  <p className="text-xs text-red-600">{selectedAgent.error_message}</p>
                </div>
              )}

              <div className="text-xs text-gray-400 space-y-1">
                <p>Gestartet: {selectedAgent.created_at ? new Date(selectedAgent.created_at).toLocaleString('de-DE') : '-'}</p>
                <p>Beendet: {selectedAgent.completed_at ? new Date(selectedAgent.completed_at).toLocaleString('de-DE') : '-'}</p>
                <p className="font-mono text-[10px] break-all">ID: {selectedAgent.id}</p>
              </div>

              {selectedAgent.input_data && Object.keys(selectedAgent.input_data).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Input Data</summary>
                  <pre className="mt-2 p-2 bg-gray-50 rounded text-[10px] overflow-auto max-h-32">
                    {JSON.stringify(selectedAgent.input_data, null, 2)}
                  </pre>
                </details>
              )}

              {selectedAgent.output_data && Object.keys(selectedAgent.output_data).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Output Data</summary>
                  <pre className="mt-2 p-2 bg-gray-50 rounded text-[10px] overflow-auto max-h-32">
                    {JSON.stringify(selectedAgent.output_data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p>Klicke auf einen Agent für Details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
