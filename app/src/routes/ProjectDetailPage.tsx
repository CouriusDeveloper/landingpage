import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Section } from '../components/ui/Section'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ============================================================================
// CLIENT PORTAL - Projekt-Detailansicht
// ============================================================================
// ❌ Keine AI-Erwähnung, keine "Generate" Buttons
// ❌ Keine Datei-Downloads für Kunden
// ✅ 5-Schritt Progress Bar
// ✅ Change Request System mit Kategorien + Screenshot
// ✅ Preview nur wenn Admin es aktiviert hat
// ✅ Realtime Chat

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
  selected_addons?: string[] | null
  preview_url?: string | null
  preview_visible?: boolean
  has_pending_changes?: boolean
  // Sanity CMS
  sanity_project_id?: string | null
  sanity_studio_url?: string | null
  // Contact
  contact_email?: string | null
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

// 5-Step Progress
const progressSteps = [
  { key: 'pending_payment', label: 'Bezahlung', description: 'Anzahlung wird erwartet' },
  { key: 'discovery', label: 'Analyse', description: 'Wir analysieren Ihr Briefing' },
  { key: 'design', label: 'Design', description: 'Ihre Website wird gestaltet' },
  { key: 'review', label: 'Review', description: 'Ihre Feedback-Phase' },
  { key: 'launched', label: 'Live', description: 'Ihre Website ist online' },
]

// Change Request Categories
const changeCategories = [
  { value: 'design', label: 'Design', description: 'Farben, Layout, Bilder' },
  { value: 'text', label: 'Text', description: 'Inhalte, Texte, Überschriften' },
  { value: 'functionality', label: 'Funktion', description: 'Features, Verhalten' },
  { value: 'bug', label: 'Fehler', description: 'Etwas funktioniert nicht' },
  { value: 'other', label: 'Sonstiges', description: 'Andere Anliegen' },
]

const statusToStep: Record<string, number> = {
  pending_payment: 0,
  discovery: 1,
  generating: 2,
  design: 2,
  development: 2,
  review: 3,
  ready_for_launch: 4,
  launched: 4,
  completed: 4,
}

export function ProjectDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Chat state
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  
  // Change Request state
  const [showChangeRequest, setShowChangeRequest] = useState(false)
  const [changeCategory, setChangeCategory] = useState<string>('design')
  const [changeDescription, setChangeDescription] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [submittingChange, setSubmittingChange] = useState(false)

  // Load project and messages
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
          .select('id, name, status, package_type, brief, created_at, primary_color, secondary_color, logo_url, selected_addons, preview_url, preview_visible, has_pending_changes, sanity_project_id, sanity_studio_url, contact_email')
          .eq('id', id)
          .single()
        
        if (projectError) throw projectError
        setProject(projectData)

        // Load messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: messagesData } = await (client as any)
          .from('project_messages')
          .select('*')
          .eq('project_id', id)
          .order('created_at', { ascending: true })
        
        setMessages(messagesData ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Projekt konnte nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  // Realtime subscription for messages
  useEffect(() => {
    if (!supabase || !id) return

    const client = supabase
    const channel = client
      .channel(`project_messages:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `project_id=eq.${id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [id])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send a text message
  const sendMessage = useCallback(async () => {
    if (!supabase || !id || !newMessage.trim()) return
    
    setSendingMessage(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('project_messages').insert({
        project_id: id,
        sender_type: 'client',
        sender_id: user?.id,
        message_type: 'text',
        content: newMessage.trim(),
      })
      
      if (error) throw error
      setNewMessage('')
    } catch (err) {
      console.error('Send message error:', err)
      alert('Nachricht konnte nicht gesendet werden.')
    } finally {
      setSendingMessage(false)
    }
  }, [id, newMessage, user?.id])

  // Submit change request
  const submitChangeRequest = useCallback(async () => {
    if (!supabase || !id || !changeDescription.trim()) return
    
    setSubmittingChange(true)
    try {
      let screenshotUrl: string | null = null
      
      // Upload screenshot if provided
      if (screenshotFile) {
        const fileExt = screenshotFile.name.split('.').pop()
        const fileName = `${id}/${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('change-screenshots')
          .upload(fileName, screenshotFile)
        
        if (!uploadError) {
          const { data } = supabase.storage.from('change-screenshots').getPublicUrl(fileName)
          screenshotUrl = data.publicUrl
        }
      }
      
      // Insert change request as message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('project_messages').insert({
        project_id: id,
        sender_type: 'client',
        sender_id: user?.id,
        message_type: 'change_request',
        content: changeDescription.trim(),
        change_category: changeCategory,
        screenshot_url: screenshotUrl,
      })
      
      if (error) throw error
      
      // Reset form
      setShowChangeRequest(false)
      setChangeDescription('')
      setChangeCategory('design')
      setScreenshotFile(null)
      
      // Update has_pending_changes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('projects').update({ has_pending_changes: true }).eq('id', id)
      setProject(prev => prev ? { ...prev, has_pending_changes: true } : null)
      
    } catch (err) {
      console.error('Submit change request error:', err)
      alert('Änderungswunsch konnte nicht gesendet werden.')
    } finally {
      setSubmittingChange(false)
    }
  }, [id, changeDescription, changeCategory, screenshotFile, user?.id])

  // Get current step
  const currentStep = project ? (statusToStep[project.status] ?? 0) : 0

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
        </Card>
      </Section>
    )
  }

  return (
    <Section className="py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary">{project.name}</h1>
        <p className="mt-2 text-secondary">Projekt #{project.id.slice(0, 8)}</p>
      </div>

      {/* 5-Step Progress Bar */}
      <Card className="mb-8">
        <h2 className="mb-6 text-lg font-semibold text-primary">Projektstatus</h2>
        <div className="relative">
          {/* Progress Line */}
          <div className="absolute left-0 top-4 h-1 w-full bg-gray-200" />
          <div 
            className="absolute left-0 top-4 h-1 bg-gradient-to-r from-accent to-emerald-500 transition-all duration-500"
            style={{ width: `${(currentStep / (progressSteps.length - 1)) * 100}%` }}
          />
          
          {/* Steps */}
          <div className="relative flex justify-between">
            {progressSteps.map((step, index) => {
              const isCompleted = index < currentStep
              const isCurrent = index === currentStep
              
              return (
                <div key={step.key} className="flex flex-col items-center">
                  <div 
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                      isCompleted 
                        ? 'border-emerald-500 bg-emerald-500 text-white' 
                        : isCurrent 
                          ? 'border-accent bg-accent text-white animate-pulse' 
                          : 'border-gray-300 bg-white text-gray-400'
                    }`}
                  >
                    {isCompleted ? <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : index + 1}
                  </div>
                  <span className={`mt-2 text-sm font-medium ${isCurrent ? 'text-accent' : 'text-secondary'}`}>
                    {step.label}
                  </span>
                  <span className="mt-1 hidden text-xs text-gray-400 md:block">
                    {step.description}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Preview Section */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-primary">Website Vorschau</h2>
            {project.preview_visible && project.preview_url ? (
              <div className="space-y-4">
                <div className="aspect-video overflow-hidden rounded-lg border border-gray-200">
                  <iframe
                    src={project.preview_url}
                    className="h-full w-full"
                    title="Website Vorschau"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    onClick={() => window.open(project.preview_url!, '_blank')}
                  >
                    Vorschau öffnen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowChangeRequest(true)}
                  >
                    Änderungswunsch
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg bg-gray-50 py-12 text-center">
                <svg className="h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-lg font-medium text-primary">Vorschau wird vorbereitet</p>
                <p className="mt-2 text-sm text-secondary">
                  Sobald Ihre Website fertig ist, erscheint hier die Vorschau.
                </p>
              </div>
            )}
          </Card>

          {/* Change Request Form */}
          {showChangeRequest && (
            <Card className="border-2 border-accent/20 bg-accent/5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-primary">Änderungswunsch einreichen</h2>
                <button 
                  onClick={() => setShowChangeRequest(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              
              {/* Category Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-primary mb-2">Kategorie</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {changeCategories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setChangeCategory(cat.value)}
                      className={`rounded-lg border-2 p-3 text-center transition-all ${
                        changeCategory === cat.value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-gray-200 hover:border-accent/50'
                      }`}
                    >
                      <span className="text-lg">{cat.label.split(' ')[0]}</span>
                      <span className="mt-1 block text-xs">{cat.label.split(' ')[1]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <Textarea
                  label="Beschreiben Sie Ihren Änderungswunsch"
                  value={changeDescription}
                  onChange={(e) => setChangeDescription(e.target.value)}
                  placeholder="Was möchten Sie ändern? Je detaillierter, desto besser..."
                  rows={4}
                />
              </div>

              {/* Screenshot Upload */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-primary mb-2">
                  Screenshot (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-gray-200 p-2 text-sm"
                />
                {screenshotFile && (
                  <p className="mt-1 text-xs text-green-600">Ausgewählt: {screenshotFile.name}</p>
                )}
              </div>

              <Button
                variant="primary"
                onClick={submitChangeRequest}
                disabled={submittingChange || !changeDescription.trim()}
                className="w-full"
              >
                {submittingChange ? 'Wird gesendet...' : 'Änderungswunsch absenden'}
              </Button>
            </Card>
          )}

          {/* Chat / Messages */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-primary">Nachrichten</h2>
            
            {/* Messages List */}
            <div className="mb-4 max-h-96 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-secondary py-8">
                  Noch keine Nachrichten. Schreiben Sie uns!
                </p>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === 'client' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          msg.sender_type === 'client'
                            ? 'bg-accent text-white'
                            : 'bg-white border border-gray-200 text-primary'
                        }`}
                      >
                        {msg.message_type === 'change_request' && (
                          <div className="mb-2 flex items-center gap-2 text-xs opacity-80">
                            <span className="rounded bg-white/20 px-2 py-0.5">
                              {changeCategories.find(c => c.value === msg.change_category)?.label || 'Änderung'}
                            </span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {msg.screenshot_url && (
                          <a
                            href={msg.screenshot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 block text-xs underline opacity-80"
                          >
                            Screenshot ansehen
                          </a>
                        )}
                        <p className={`mt-1 text-xs ${msg.sender_type === 'client' ? 'opacity-70' : 'text-gray-400'}`}>
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

            {/* Message Input */}
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Nachricht schreiben..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                className="flex-1"
              />
              <Button
                variant="primary"
                onClick={sendMessage}
                disabled={sendingMessage || !newMessage.trim()}
              >
                {sendingMessage ? '...' : 'Senden'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Project Info */}
          <Card>
            <h3 className="mb-4 text-lg font-semibold text-primary">Projektdetails</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary">Paket</span>
                <span className="font-medium capitalize">{project.package_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Erstellt</span>
                <span className="font-medium">
                  {new Date(project.created_at).toLocaleDateString('de-DE')}
                </span>
              </div>
              {project.selected_addons && project.selected_addons.length > 0 && (
                <div>
                  <span className="text-secondary">Zusatzleistungen</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {project.selected_addons.map((addon) => (
                      <span key={addon} className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                        {addon.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* CMS Access (if available) */}
          {project.sanity_studio_url && (
            <Card>
              <h3 className="mb-4 text-lg font-semibold text-primary">Inhalte bearbeiten</h3>
              <p className="mb-4 text-sm text-secondary">
                Bearbeiten Sie Texte und Bilder direkt im Content-Management-System.
              </p>
              <Button
                variant="outline"
                onClick={() => window.open(project.sanity_studio_url!, '_blank')}
                className="w-full"
              >
                CMS öffnen
              </Button>
            </Card>
          )}

          {/* Pending Changes Notice */}
          {project.has_pending_changes && (
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <svg className="h-6 w-6 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <h3 className="font-semibold text-amber-800">Änderungen in Bearbeitung</h3>
                  <p className="mt-1 text-sm text-amber-700">
                    Wir arbeiten an Ihren gewünschten Änderungen. Sie werden benachrichtigt, sobald diese umgesetzt sind.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Help */}
          <Card className="bg-gradient-to-br from-accent/5 to-accent/10">
            <h3 className="mb-2 text-lg font-semibold text-primary">Hilfe benötigt?</h3>
            <p className="text-sm text-secondary">
              Unser Team steht Ihnen jederzeit zur Verfügung. Nutzen Sie den Chat oder schreiben Sie uns eine E-Mail.
            </p>
            <a 
              href="mailto:support@example.com" 
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              support@example.com
            </a>
          </Card>
        </div>
      </div>
    </Section>
  )
}
