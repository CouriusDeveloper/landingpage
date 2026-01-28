import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Section } from '../../components/ui/Section'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import { Input } from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

// ============================================================================
// ADMIN PROJECT DETAIL PAGE
// ============================================================================
// ✅ Generate Website Button
// ✅ Toggle Preview Visibility
// ✅ Resolve Change Requests
// ✅ Realtime Chat with Client
// ✅ View all project details and addons
// ✅ Manage URLs (preview, deployment)
// ✅ Copy shareable links
// ✅ Full pipeline control

type ProjectDetail = {
  id: string
  name: string
  status: string
  package_type: string
  brief: string | null
  created_at: string
  primary_color?: string | null
  secondary_color?: string | null
  logo_url?: string | null
  website_style?: string | null
  optimization_goal?: string | null
  target_audience?: string | null
  selected_addons?: string[] | null
  preview_url?: string | null
  deployment_url?: string | null
  preview_visible?: boolean
  has_pending_changes?: boolean
  // Tracking
  google_pixel_id?: string | null
  meta_pixel_id?: string | null
  // Sanity
  sanity_project_id?: string | null
  sanity_studio_url?: string | null
  // Contact
  contact_email?: string | null
  email_domain?: string | null
  // Company
  industry?: string | null
  company_size?: string | null
  brand_voice?: string | { tone?: string; formality?: string } | null
}

type Message = {
  id: string
  sender_type: 'client' | 'admin'
  message_type: 'text' | 'change_request'
  content: string
  change_category?: string | null
  screenshot_url?: string | null
  created_at: string
  read_at?: string | null
}

type PipelineRun = {
  id: string
  status: string
  trigger_source: string
  total_tokens: number | null
  total_cost_usd: number | null
  started_at: string
  completed_at: string | null
  error_message: string | null
}

const statusOptions = [
  'pending_payment',
  'discovery',
  'generating',
  'design',
  'development',
  'review',
  'ready_for_launch',
  'launched',
]

const changeCategories: Record<string, string> = {
  design: 'Design',
  text: 'Text',
  functionality: 'Funktion',
  bug: 'Fehler',
  other: 'Sonstiges',
}

export function AdminProjectPage() {
  const { id } = useParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Actions state
  const [generating, setGenerating] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [savingChanges, setSavingChanges] = useState(false)
  
  // URL Management
  const [editingUrls, setEditingUrls] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [deploymentUrl, setDeploymentUrl] = useState('')
  const [sanityUrl, setSanityUrl] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  
  // Chat state
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Load project, messages, pipeline runs
  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false)
      return
    }

    const client = supabase
    const load = async () => {
      try {
        // Load project
        const { data: projectData, error: projectError } = await client
          .from('projects')
          .select('*')
          .eq('id', id)
          .single()
        
        if (projectError) throw projectError
        setProject(projectData as ProjectDetail)
        
        // Initialize URL fields
        const pd = projectData as ProjectDetail
        setPreviewUrl(pd.preview_url || '')
        setDeploymentUrl(pd.deployment_url || '')
        setSanityUrl(pd.sanity_studio_url || '')

        // Load messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: messagesData } = await (client as any)
          .from('project_messages')
          .select('*')
          .eq('project_id', id)
          .order('created_at', { ascending: true })
        
        setMessages(messagesData ?? [])

        // Load pipeline runs (optional - table may not exist)
        try {
          const { data: runsData } = await client
            .from('pipeline_runs')
            .select('id, status, trigger_source, total_tokens, total_cost_usd, started_at, completed_at, error_message')
            .eq('project_id', id)
            .order('started_at', { ascending: false })
            .limit(10)
          
          setPipelineRuns(runsData ?? [])
        } catch {
          // pipeline_runs table may not exist yet
          console.log('Pipeline runs table not available')
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading project')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  // Realtime subscription
  useEffect(() => {
    if (!supabase || !id) return

    const client = supabase
    const channel = client
      .channel(`admin_messages:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'project_messages',
        filter: `project_id=eq.${id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { client.removeChannel(channel) }
  }, [id])

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Generate Website
  const triggerGeneration = useCallback(async () => {
    if (!supabase || !id || !project) return
    
    setGenerating(true)
    try {
      // Update status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('projects').update({ status: 'generating' }).eq('id', id)
      setProject(prev => prev ? { ...prev, status: 'generating' } : null)

      // Call pipeline orchestrator
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipeline-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ projectId: id }),
        }
      )

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Pipeline trigger failed')
      }

      alert('Website-Generierung gestartet! Die Pipeline läuft im Hintergrund.')
      
      // Reload pipeline runs
      const { data: runsData } = await supabase
        .from('pipeline_runs')
        .select('id, status, trigger_source, total_tokens, total_cost_usd, started_at, completed_at, error_message')
        .eq('project_id', id)
        .order('started_at', { ascending: false })
        .limit(10)
      
      setPipelineRuns(runsData ?? [])

    } catch (err) {
      console.error('Generation error:', err)
      alert(`Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
      // Reset status on error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)?.from('projects').update({ status: 'discovery' }).eq('id', id)
      setProject(prev => prev ? { ...prev, status: 'discovery' } : null)
    } finally {
      setGenerating(false)
    }
  }, [id, project])

  // Stop pipeline
  const stopPipeline = useCallback(async () => {
    if (!id) return
    
    if (!confirm('Alle laufenden Pipelines und Agents für dieses Projekt stoppen?')) {
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
          body: JSON.stringify({ projectId: id }),
        }
      )

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Pipeline stop failed')
      }

      alert(`Gestoppt: ${result.stoppedPipelines} Pipelines, ${result.stoppedAgents} Agents`)
      
      // Refresh project status
      setProject(prev => prev ? { ...prev, status: 'discovery' } : null)
      
      // Reload pipeline runs
      if (supabase) {
        try {
          const { data: runsData } = await supabase
            .from('pipeline_runs')
            .select('id, status, trigger_source, total_tokens, total_cost_usd, started_at, completed_at, error_message')
            .eq('project_id', id)
            .order('started_at', { ascending: false })
            .limit(10)
          
          setPipelineRuns(runsData ?? [])
        } catch {
          // Ignore
        }
      }

    } catch (err) {
      console.error('Stop pipeline error:', err)
      alert(`Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
    }
  }, [id])

  // Update status
  const updateStatus = useCallback(async (newStatus: string) => {
    if (!supabase || !id) return
    
    setUpdatingStatus(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('projects').update({ status: newStatus }).eq('id', id)
      setProject(prev => prev ? { ...prev, status: newStatus } : null)
    } catch (err) {
      console.error('Status update error:', err)
    } finally {
      setUpdatingStatus(false)
    }
  }, [id])

  // Toggle preview visibility
  const togglePreviewVisibility = useCallback(async () => {
    if (!supabase || !id || !project) return
    
    setSavingChanges(true)
    try {
      const newValue = !project.preview_visible
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('projects').update({ preview_visible: newValue }).eq('id', id)
      setProject(prev => prev ? { ...prev, preview_visible: newValue } : null)
    } catch (err) {
      console.error('Toggle preview error:', err)
    } finally {
      setSavingChanges(false)
    }
  }, [id, project])

  // Resolve pending changes
  const resolvePendingChanges = useCallback(async () => {
    if (!supabase || !id) return
    
    setSavingChanges(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('projects').update({ has_pending_changes: false }).eq('id', id)
      setProject(prev => prev ? { ...prev, has_pending_changes: false } : null)
    } catch (err) {
      console.error('Resolve changes error:', err)
    } finally {
      setSavingChanges(false)
    }
  }, [id])

  // Save URLs
  const saveUrls = useCallback(async () => {
    if (!supabase || !id) return
    
    setSavingChanges(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('projects').update({
        preview_url: previewUrl || null,
        deployment_url: deploymentUrl || null,
        sanity_studio_url: sanityUrl || null,
      }).eq('id', id)
      
      setProject(prev => prev ? { 
        ...prev, 
        preview_url: previewUrl || null,
        deployment_url: deploymentUrl || null,
        sanity_studio_url: sanityUrl || null,
      } : null)
      setEditingUrls(false)
    } catch (err) {
      console.error('Save URLs error:', err)
    } finally {
      setSavingChanges(false)
    }
  }, [id, previewUrl, deploymentUrl, sanityUrl])

  // Copy link to clipboard
  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedLink(label)
      setTimeout(() => setCopiedLink(null), 2000)
    } catch (err) {
      console.error('Copy error:', err)
    }
  }, [])

  // Get shareable client link
  const getClientLink = useCallback(() => {
    return `${window.location.origin}/projekt/${id}`
  }, [id])

  // Send admin message
  const sendMessage = useCallback(async () => {
    if (!supabase || !id || !newMessage.trim()) return
    
    setSendingMessage(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('project_messages').insert({
        project_id: id,
        sender_type: 'admin',
        sender_id: null,
        message_type: 'text',
        content: newMessage.trim(),
      })
      setNewMessage('')
    } catch (err) {
      console.error('Send message error:', err)
    } finally {
      setSendingMessage(false)
    }
  }, [id, newMessage])

  if (loading) {
    return (
      <Section className="py-20">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </Section>
    )
  }

  if (error || !project) {
    return (
      <Section className="py-20">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-xl font-semibold text-red-600">Fehler</h2>
          <p className="mt-2 text-secondary">{error || 'Projekt nicht gefunden.'}</p>
          <Link to="/admin/kunden" className="mt-4 inline-block text-accent hover:underline">
            ← Zurück zur Übersicht
          </Link>
        </Card>
      </Section>
    )
  }

  return (
    <Section className="py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin/kunden" className="text-sm text-accent hover:underline">
            ← Alle Projekte
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-primary">{project.name}</h1>
          <p className="text-secondary">ID: {project.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => copyToClipboard(getClientLink(), 'client')}
          >
            {copiedLink === 'client' ? 'Kopiert!' : 'Kunden-Link kopieren'}
          </Button>
          {project.status === 'generating' && (
            <Button
              variant="outline"
              onClick={stopPipeline}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              Pipeline stoppen
            </Button>
          )}
          <Button
            variant="primary"
            onClick={triggerGeneration}
            disabled={generating || project.status === 'generating'}
          >
            {generating ? 'Generierung läuft...' : 'Website generieren'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Project Info & Controls */}
        <div className="space-y-6">
          {/* Status Control */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-primary">Status</h3>
            <select
              value={project.status}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={updatingStatus}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-accent focus:outline-none"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Card>

          {/* Preview Control */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary">Links & Zugang</h3>
              <button
                onClick={() => setEditingUrls(!editingUrls)}
                className="text-sm text-accent hover:underline"
              >
                {editingUrls ? 'Abbrechen' : 'Bearbeiten'}
              </button>
            </div>
            
            {/* Preview Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <span className="text-sm font-medium text-primary">Vorschau für Kunde</span>
                <p className="text-xs text-secondary">Kunde kann Website-Preview sehen</p>
              </div>
              <button
                onClick={togglePreviewVisibility}
                disabled={savingChanges}
                className={`relative h-6 w-11 rounded-full transition ${
                  project.preview_visible ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    project.preview_visible ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* URL Fields */}
            {editingUrls ? (
              <div className="mt-4 space-y-3">
                <Input
                  label="Preview URL"
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  placeholder="https://preview.example.com/..."
                />
                <Input
                  label="Deployment URL (Live)"
                  value={deploymentUrl}
                  onChange={(e) => setDeploymentUrl(e.target.value)}
                  placeholder="https://kunde.de"
                />
                <Input
                  label="Sanity Studio URL"
                  value={sanityUrl}
                  onChange={(e) => setSanityUrl(e.target.value)}
                  placeholder="https://sanity.studio/..."
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={saveUrls}
                  disabled={savingChanges}
                  className="w-full"
                >
                  {savingChanges ? 'Speichern...' : 'URLs speichern'}
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {/* Preview URL */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-secondary">Preview</p>
                    {project.preview_url ? (
                      <p className="truncate text-sm text-primary">{project.preview_url}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Nicht gesetzt</p>
                    )}
                  </div>
                  {project.preview_url && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyToClipboard(project.preview_url!, 'preview')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Kopieren"
                      >
                        {copiedLink === 'preview' ? (
                          <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                      </button>
                      <button
                        onClick={() => window.open(project.preview_url!, '_blank')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Öffnen"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Deployment URL */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-secondary">Live Website</p>
                    {project.deployment_url ? (
                      <p className="truncate text-sm text-primary">{project.deployment_url}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Nicht deployed</p>
                    )}
                  </div>
                  {project.deployment_url && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyToClipboard(project.deployment_url!, 'deployment')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Kopieren"
                      >
                        {copiedLink === 'deployment' ? (
                          <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                      </button>
                      <button
                        onClick={() => window.open(project.deployment_url!, '_blank')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Öffnen"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Sanity URL */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-secondary">CMS (Sanity)</p>
                    {project.sanity_studio_url ? (
                      <p className="truncate text-sm text-primary">{project.sanity_studio_url}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Nicht eingerichtet</p>
                    )}
                  </div>
                  {project.sanity_studio_url && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyToClipboard(project.sanity_studio_url!, 'sanity')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Kopieren"
                      >
                        {copiedLink === 'sanity' ? (
                          <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                      </button>
                      <button
                        onClick={() => window.open(project.sanity_studio_url!, '_blank')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Öffnen"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Client Dashboard Link */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-secondary">Kunden-Dashboard</p>
                      <p className="truncate text-sm text-primary">{getClientLink()}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(getClientLink(), 'dashboard')}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Kopieren"
                    >
                      {copiedLink === 'dashboard' ? (
                        <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Pending Changes */}
          {project.has_pending_changes && (
            <Card className="border-amber-200 bg-amber-50">
              <h3 className="mb-2 font-semibold text-amber-800">Offene Änderungen</h3>
              <p className="mb-4 text-sm text-amber-700">
                Der Kunde hat Änderungswünsche eingereicht.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={resolvePendingChanges}
                disabled={savingChanges}
              >
                Als erledigt markieren
              </Button>
            </Card>
          )}

          {/* Project Details */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-primary">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary">Paket</span>
                <span className="font-medium capitalize">{project.package_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">E-Mail</span>
                <span className="font-medium">{project.contact_email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Branche</span>
                <span className="font-medium">{project.industry || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Stil</span>
                <span className="font-medium">{project.website_style || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Brand Voice</span>
                <span className="font-medium">
                  {project.brand_voice 
                    ? typeof project.brand_voice === 'object' 
                      ? `${project.brand_voice.tone || ''} / ${project.brand_voice.formality || ''}`
                      : project.brand_voice
                    : '-'}
                </span>
              </div>
              {project.google_pixel_id && (
                <div className="flex justify-between">
                  <span className="text-secondary">GA4</span>
                  <span className="font-mono text-xs">{project.google_pixel_id}</span>
                </div>
              )}
              {project.meta_pixel_id && (
                <div className="flex justify-between">
                  <span className="text-secondary">Meta Pixel</span>
                  <span className="font-mono text-xs">{project.meta_pixel_id}</span>
                </div>
              )}
            </div>
            {project.selected_addons && project.selected_addons.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-sm font-medium text-secondary">Add-ons:</p>
                <div className="flex flex-wrap gap-1">
                  {project.selected_addons.map((addon) => (
                    <span key={addon} className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">
                      {addon}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Pipeline Runs */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-primary">Pipeline History</h3>
            {pipelineRuns.length === 0 ? (
              <p className="text-sm text-secondary">Keine Runs vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {pipelineRuns.map((run) => (
                  <div
                    key={run.id}
                    className={`rounded-lg border p-2 text-xs ${
                      run.status === 'completed'
                        ? 'border-green-200 bg-green-50'
                        : run.status === 'failed'
                          ? 'border-red-200 bg-red-50'
                          : 'border-blue-200 bg-blue-50'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">{run.status}</span>
                      <span className="text-gray-500">
                        {new Date(run.started_at).toLocaleString('de-DE', { 
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                        })}
                      </span>
                    </div>
                    {run.total_cost_usd && (
                      <p className="mt-1 text-gray-600">
                        ${run.total_cost_usd.toFixed(4)} • {run.total_tokens?.toLocaleString()} tokens
                      </p>
                    )}
                    {run.error_message && (
                      <p className="mt-1 text-red-600">{run.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Chat */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <h3 className="mb-4 text-lg font-semibold text-primary">Kundenkommunikation</h3>
            
            {/* Messages */}
            <div className="mb-4 h-[500px] overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-secondary py-8">
                  Noch keine Nachrichten.
                </p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          msg.sender_type === 'admin'
                            ? 'bg-accent text-white'
                            : 'bg-white border border-gray-200 text-primary'
                        }`}
                      >
                        {msg.message_type === 'change_request' && (
                          <div className={`mb-2 text-xs ${msg.sender_type === 'admin' ? 'opacity-80' : 'text-amber-600'}`}>
                            {changeCategories[msg.change_category || 'other'] || 'Änderung'}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {msg.screenshot_url && (
                          <a
                            href={msg.screenshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`mt-2 block text-xs underline ${
                              msg.sender_type === 'admin' ? 'opacity-80' : 'text-accent'
                            }`}
                          >
                            Screenshot
                          </a>
                        )}
                        <p className={`mt-1 text-xs ${msg.sender_type === 'admin' ? 'opacity-70' : 'text-gray-400'}`}>
                          {msg.sender_type === 'admin' ? 'Admin' : 'Kunde'} •{' '}
                          {new Date(msg.created_at).toLocaleString('de-DE', { 
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Antwort schreiben..."
                rows={2}
                className="flex-1"
              />
              <Button
                variant="primary"
                onClick={sendMessage}
                disabled={sendingMessage || !newMessage.trim()}
                className="self-end"
              >
                {sendingMessage ? '...' : 'Senden'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Brief */}
      {project.brief && (
        <Card className="mt-6">
          <h3 className="mb-4 text-lg font-semibold text-primary">Briefing</h3>
          <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-secondary">
            {project.brief}
          </pre>
        </Card>
      )}
    </Section>
  )
}
