import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type CostData = {
  totalTokens: number
  totalCost: number
  avgCostPerProject: number
  avgTokensPerProject: number
  projectCount: number
}

type ProjectCost = {
  id: string
  name: string
  tokens: number
  cost: number
  runs: number
  lastRun: string | null
}

type MonthlyCost = {
  month: string
  tokens: number
  cost: number
  runs: number
}

type AgentCost = {
  agent: string
  tokens: number
  cost: number
  runs: number
  avgDuration: number
}

const agentLabels: Record<string, string> = {
  'agent-collector': 'Collector',
  'agent-code-collector': 'Code Collector',
  'agent-shared-components': 'Shared Components',
  'agent-page-builder': 'Page Builder',
  'agent-deployer': 'Deployer',
}

export function AdminCostAnalyticsPage() {
  const [stats, setStats] = useState<CostData>({
    totalTokens: 0,
    totalCost: 0,
    avgCostPerProject: 0,
    avgTokensPerProject: 0,
    projectCount: 0,
  })
  const [projectCosts, setProjectCosts] = useState<ProjectCost[]>([])
  const [monthlyCosts, setMonthlyCosts] = useState<MonthlyCost[]>([])
  const [agentCosts, setAgentCosts] = useState<AgentCost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const client = supabase
    const loadCosts = async () => {
      try {
        // Load all pipeline runs with project info
        const { data: pipelinesData } = await client
          .from('pipeline_runs')
          .select('id, project_id, total_tokens, total_cost_usd, created_at, completed_at, projects(name)')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipelines = (pipelinesData || []) as any[]
        if (pipelines.length > 0) {
          // Calculate totals
          const totalTokens = pipelines.reduce((sum, p) => sum + (p.total_tokens || 0), 0)
          const totalCost = pipelines.reduce((sum, p) => sum + (p.total_cost_usd || 0), 0)
          const uniqueProjects = new Set(pipelines.map(p => p.project_id))
          
          setStats({
            totalTokens,
            totalCost,
            avgCostPerProject: uniqueProjects.size > 0 ? totalCost / uniqueProjects.size : 0,
            avgTokensPerProject: uniqueProjects.size > 0 ? totalTokens / uniqueProjects.size : 0,
            projectCount: uniqueProjects.size,
          })

          // Group by project
          const projectMap = new Map<string, ProjectCost>()
          pipelines.forEach((p) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const name = (p as any).projects?.name || 'Unbekannt'
            const existing = projectMap.get(p.project_id) || {
              id: p.project_id,
              name,
              tokens: 0,
              cost: 0,
              runs: 0,
              lastRun: null,
            }
            existing.tokens += p.total_tokens || 0
            existing.cost += p.total_cost_usd || 0
            existing.runs += 1
            if (!existing.lastRun || (p.created_at && p.created_at > existing.lastRun)) {
              existing.lastRun = p.created_at
            }
            projectMap.set(p.project_id, existing)
          })
          
          const projectList = Array.from(projectMap.values())
            .sort((a, b) => b.cost - a.cost)
          setProjectCosts(projectList)

          // Group by month
          const monthMap = new Map<string, MonthlyCost>()
          pipelines.forEach((p) => {
            if (!p.created_at) return
            const date = new Date(p.created_at)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            const existing = monthMap.get(monthKey) || {
              month: monthKey,
              tokens: 0,
              cost: 0,
              runs: 0,
            }
            existing.tokens += p.total_tokens || 0
            existing.cost += p.total_cost_usd || 0
            existing.runs += 1
            monthMap.set(monthKey, existing)
          })
          
          const monthList = Array.from(monthMap.values())
            .sort((a, b) => b.month.localeCompare(a.month))
            .slice(0, 6)
          setMonthlyCosts(monthList)
        }

        // Load agent costs
        const { data: agentRunsData } = await client
          .from('agent_runs')
          .select('agent_name, tokens_used, cost_usd, duration_ms')

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentRuns = (agentRunsData || []) as any[]
        if (agentRuns.length > 0) {
          const agentMap = new Map<string, AgentCost>()
          agentRuns.forEach((a) => {
            const existing = agentMap.get(a.agent_name) || {
              agent: a.agent_name,
              tokens: 0,
              cost: 0,
              runs: 0,
              avgDuration: 0,
            }
            existing.tokens += a.tokens_used || 0
            existing.cost += a.cost_usd || 0
            existing.runs += 1
            existing.avgDuration += a.duration_ms || 0
            agentMap.set(a.agent_name, existing)
          })

          const agentList = Array.from(agentMap.values())
            .map(a => ({
              ...a,
              avgDuration: a.runs > 0 ? Math.round(a.avgDuration / a.runs) : 0,
            }))
            .sort((a, b) => b.cost - a.cost)
          setAgentCosts(agentList)
        }

      } catch (err) {
        console.error('Load costs error:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadCosts()
  }, [])

  const formatCurrency = (usd: number) => {
    return `$${usd.toFixed(4)}`
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
    return tokens.toString()
  }

  const formatDuration = (ms: number) => {
    if (!ms) return '-'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  // Calculate max for bars
  const maxMonthlyCost = Math.max(...monthlyCosts.map(m => m.cost), 0.01)
  const maxAgentCost = Math.max(...agentCosts.map(a => a.cost), 0.01)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kosten-Analyse</h1>
        <p className="mt-1 text-sm text-gray-500">
          Übersicht über Token-Verbrauch und Kosten der AI-Generierung.
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Gesamtkosten</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{formatCurrency(stats.totalCost)}</p>
          <p className="mt-1 text-xs text-gray-500">{stats.projectCount} Projekte</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Tokens gesamt</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">{formatTokens(stats.totalTokens)}</p>
          <p className="mt-1 text-xs text-gray-500">
            ~{formatCurrency(stats.totalTokens * 0.00001)} bei $10/1M
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Ø pro Projekt</p>
          <p className="mt-2 text-3xl font-bold text-green-600">{formatCurrency(stats.avgCostPerProject)}</p>
          <p className="mt-1 text-xs text-gray-500">{formatTokens(stats.avgTokensPerProject)} Tokens</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">Marge (bei 999€)</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">
            {stats.avgCostPerProject > 0 
              ? `${((1 - stats.avgCostPerProject / 999) * 100).toFixed(1)}%`
              : '100%'
            }
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {formatCurrency(999 - stats.avgCostPerProject)} Gewinn/Projekt
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Costs */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-gray-900">Monatliche Kosten</h2>
          {monthlyCosts.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Noch keine Daten vorhanden.
            </div>
          ) : (
            <div className="space-y-4">
              {monthlyCosts.map((month) => (
                <div key={month.month}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{formatMonth(month.month)}</span>
                    <span className="text-gray-500">
                      {formatCurrency(month.cost)} · {month.runs} Runs
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div 
                      className="h-full bg-accent transition-all duration-500"
                      style={{ width: `${(month.cost / maxMonthlyCost) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agent Costs */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-gray-900">Kosten pro Agent</h2>
          {agentCosts.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Noch keine Daten vorhanden.
            </div>
          ) : (
            <div className="space-y-4">
              {agentCosts.map((agent) => (
                <div key={agent.agent}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">
                      {agentLabels[agent.agent] || agent.agent}
                    </span>
                    <span className="text-gray-500">
                      {formatCurrency(agent.cost)} · Ø {formatDuration(agent.avgDuration)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${(agent.cost / maxAgentCost) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatTokens(agent.tokens)} Tokens · {agent.runs} Runs
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project Breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Kosten pro Projekt</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Projekt</th>
                <th className="px-6 py-3 text-right">Tokens</th>
                <th className="px-6 py-3 text-right">Kosten</th>
                <th className="px-6 py-3 text-right">Runs</th>
                <th className="px-6 py-3 text-right">Letzter Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projectCosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Noch keine Projekte mit Kosten.
                  </td>
                </tr>
              ) : (
                projectCosts.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        to={`/admin/projekt/${project.id}`}
                        className="font-medium text-gray-900 hover:text-accent"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600">
                      {formatTokens(project.tokens)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(project.cost)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600">
                      {project.runs}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-500">
                      {project.lastRun 
                        ? new Date(project.lastRun).toLocaleDateString('de-DE')
                        : '-'
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}