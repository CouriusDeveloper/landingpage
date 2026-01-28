// =============================================================================
// AGENT UTILITIES
// Shared functions for all agents to interact with pipeline/agent_runs tables
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import type {
  AgentName,
  AgentEnvelope,
  AgentResponse,
  AgentStatus,
  PipelineStatus,
  PHASE_CONFIG,
} from './types/pipeline.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// =============================================================================
// CANCELLATION CHECK
// =============================================================================

export async function isPipelineCancelled(pipelineRunId: string): Promise<boolean> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('status')
    .eq('id', pipelineRunId)
    .single()
  
  if (error || !data) return false
  return data.status === 'cancelled'
}

export async function checkCancelledOrThrow(pipelineRunId: string, agentName: string): Promise<void> {
  if (await isPipelineCancelled(pipelineRunId)) {
    console.log(`[${agentName}] Pipeline cancelled, aborting`)
    throw new Error('PIPELINE_CANCELLED')
  }
}

// =============================================================================
// AGENT RUN MANAGEMENT
// =============================================================================

export async function createAgentRun(
  pipelineRunId: string,
  projectId: string,
  agentName: AgentName,
  phase: number,
  sequence: number,
  inputData: Record<string, unknown>,
  attempt = 1
): Promise<string> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_runs')
    .insert({
      pipeline_run_id: pipelineRunId,
      project_id: projectId,
      agent_name: agentName,
      phase,
      sequence,
      input_data: inputData,
      status: 'running',
      attempt,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  
  if (error) throw new Error(`Failed to create agent run: ${error.message}`)
  return data.id
}

export async function updateAgentRun(
  agentRunId: string,
  updates: {
    status?: AgentStatus
    output_data?: Record<string, unknown>
    model_used?: string
    input_tokens?: number
    output_tokens?: number
    duration_ms?: number
    cost_usd?: number
    quality_score?: number
    validation_passed?: boolean
    validation_errors?: string[]
    error_code?: string
    error_message?: string
    completed_at?: string
  }
): Promise<void> {
  const supabase = getSupabase()
  
  const { error } = await supabase
    .from('agent_runs')
    .update(updates)
    .eq('id', agentRunId)
  
  if (error) throw new Error(`Failed to update agent run: ${error.message}`)
}

export async function loadAgentOutput<T>(
  pipelineRunId: string,
  agentName: AgentName
): Promise<T | null> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_runs')
    .select('output_data')
    .eq('pipeline_run_id', pipelineRunId)
    .eq('agent_name', agentName)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error || !data) return null
  return data.output_data as T
}

export async function loadMultipleAgentOutputs(
  pipelineRunId: string,
  agentNames: AgentName[]
): Promise<Partial<Record<AgentName, unknown>>> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_runs')
    .select('agent_name, output_data')
    .eq('pipeline_run_id', pipelineRunId)
    .in('agent_name', agentNames)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
  
  if (error || !data) return {}
  
  const outputs: Partial<Record<AgentName, unknown>> = {}
  for (const row of data) {
    if (!outputs[row.agent_name as AgentName]) {
      outputs[row.agent_name as AgentName] = row.output_data
    }
  }
  return outputs
}

export async function checkPhaseComplete(
  pipelineRunId: string,
  phase: number,
  requiredAgents: AgentName[]
): Promise<boolean> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('agent_runs')
    .select('agent_name, status')
    .eq('pipeline_run_id', pipelineRunId)
    .eq('phase', phase)
    .in('agent_name', requiredAgents)
  
  if (error || !data) return false
  
  const completedAgents = new Set(
    data.filter(r => r.status === 'completed').map(r => r.agent_name)
  )
  
  return requiredAgents.every(agent => completedAgents.has(agent))
}

// Special helper for Phase 5 - conditional agents
export async function checkPhase5Complete(
  pipelineRunId: string,
  project: { addons: string[]; packageType: string }
): Promise<boolean> {
  const supabase = getSupabase()
  
  // Determine which Phase 5 agents are required based on project config
  const requiredAgents: AgentName[] = []
  
  if (project.addons.includes('cms_base')) {
    requiredAgents.push('cms')
  }
  if (project.addons.includes('booking_form')) {
    requiredAgents.push('email')
  }
  if (project.packageType === 'enterprise') {
    requiredAgents.push('analytics')
  }
  
  // If no Phase 5 agents are required, it's complete
  if (requiredAgents.length === 0) {
    return true
  }
  
  // Check which of the required agents have completed
  const { data, error } = await supabase
    .from('agent_runs')
    .select('agent_name, status')
    .eq('pipeline_run_id', pipelineRunId)
    .eq('phase', 5)
    .in('agent_name', requiredAgents)
  
  if (error || !data) return false
  
  const completedAgents = new Set(
    data.filter(r => r.status === 'completed').map(r => r.agent_name)
  )
  
  return requiredAgents.every(agent => completedAgents.has(agent))
}

// =============================================================================
// PIPELINE RUN MANAGEMENT
// =============================================================================

export async function updatePipelineStatus(
  pipelineRunId: string,
  status: PipelineStatus,
  additionalUpdates: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getSupabase()
  
  const updates: Record<string, unknown> = {
    status,
    current_phase: status.startsWith('phase_') ? parseInt(status.split('_')[1]) : null,
    ...additionalUpdates,
  }
  
  if (status === 'completed' || status === 'failed' || status === 'needs_human') {
    updates.completed_at = new Date().toISOString()
  }
  
  const { error } = await supabase
    .from('pipeline_runs')
    .update(updates)
    .eq('id', pipelineRunId)
  
  if (error) throw new Error(`Failed to update pipeline: ${error.message}`)
}

export async function getPipelineRun(pipelineRunId: string) {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('*')
    .eq('id', pipelineRunId)
    .single()
  
  if (error) throw new Error(`Failed to get pipeline run: ${error.message}`)
  return data
}

export async function incrementPipelineRetries(pipelineRunId: string): Promise<number> {
  const supabase = getSupabase()
  
  const { data, error } = await supabase
    .rpc('increment_pipeline_retries', { pipeline_id: pipelineRunId })
  
  if (error) {
    // Fallback: manual increment
    const pipeline = await getPipelineRun(pipelineRunId)
    const newCount = (pipeline.total_retries || 0) + 1
    await supabase
      .from('pipeline_runs')
      .update({ total_retries: newCount })
      .eq('id', pipelineRunId)
    return newCount
  }
  
  return data
}

export async function updatePipelineMetrics(
  pipelineRunId: string,
  tokens: number,
  costUsd: number
): Promise<void> {
  const supabase = getSupabase()
  
  // Get current values and add
  const { data: current } = await supabase
    .from('pipeline_runs')
    .select('total_tokens, total_cost_usd')
    .eq('id', pipelineRunId)
    .single()
  
  await supabase
    .from('pipeline_runs')
    .update({
      total_tokens: (current?.total_tokens || 0) + tokens,
      total_cost_usd: (current?.total_cost_usd || 0) + costUsd,
    })
    .eq('id', pipelineRunId)
}

// =============================================================================
// AGENT TRIGGERING
// =============================================================================

export async function triggerAgent(
  agentName: AgentName,
  envelope: AgentEnvelope
): Promise<void> {
  const url = `${SUPABASE_URL}/functions/v1/agent-${agentName}`
  
  console.log(`[TRIGGER] Starting agent: ${agentName}`)
  
  // Fire and forget - don't await
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(envelope),
  }).catch(err => {
    console.error(`[TRIGGER] Failed to trigger ${agentName}:`, err)
  })
}

export async function triggerNextPhase(
  pipelineRunId: string,
  nextPhase: number,
  envelope: AgentEnvelope
): Promise<void> {
  const phaseConfig = (await import('./types/pipeline.ts')).PHASE_CONFIG[nextPhase as keyof typeof PHASE_CONFIG]
  if (!phaseConfig) {
    console.log(`[TRIGGER] No phase ${nextPhase}, pipeline complete`)
    await updatePipelineStatus(pipelineRunId, 'completed', {
      completed_at: new Date().toISOString(),
    })
    return
  }
  
  await updatePipelineStatus(pipelineRunId, `phase_${nextPhase}` as PipelineStatus)
  
  const agents = phaseConfig.agents
  
  for (let i = 0; i < agents.length; i++) {
    const agentName = agents[i]
    const agentEnvelope: AgentEnvelope = {
      ...envelope,
      meta: {
        ...envelope.meta,
        agentName,
        phase: nextPhase,
        sequence: i + 1,
        timestamp: new Date().toISOString(),
      },
    }
    
    await triggerAgent(agentName, agentEnvelope)
    
    // If not parallel, wait for this agent to complete before next
    if (!phaseConfig.parallel && i < agents.length - 1) {
      // The agent itself will trigger the next one
      break
    }
  }
}

// =============================================================================
// OPENAI API HELPER
// =============================================================================

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

// Models that use Chat Completions API (not Responses API)
const CHAT_API_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model = 'gpt-4o-mini',
  maxTokens = 4000
): Promise<{
  content: string
  inputTokens: number
  outputTokens: number
  model: string
}> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  
  const useChatApi = CHAT_API_MODELS.some(m => model.startsWith(m))
  
  if (useChatApi) {
    // Use Chat Completions API for standard models
    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI Chat API error: ${error}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const usage = data.usage || {}
    
    return {
      content,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      model,
    }
  }
  
  // Use Responses API for newer models (gpt-5.2, etc.)
  // Note: JSON mode requires the word "json" in the input message
  const inputWithJsonHint = userPrompt.toLowerCase().includes('json') 
    ? userPrompt 
    : `${userPrompt}\n\nRespond with valid JSON only.`
  
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
      input: inputWithJsonHint,
      max_output_tokens: maxTokens,
      text: { format: { type: 'json_object' } },
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }
  
  const data = await response.json()
  const content = extractText(data)
  
  // Extract usage if available
  const usage = data.usage || {}
  
  return {
    content,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    model,
  }
}

function extractText(response: any): string {
  if (typeof response.output === 'string') return response.output
  if (response.output_text) return response.output_text
  if (Array.isArray(response.output)) {
    const textPart = response.output.find((p: any) => p.type === 'text' || p.content)
    if (textPart?.text) return textPart.text
    if (textPart?.content?.[0]?.text) return textPart.content[0].text
  }
  return ''
}

// =============================================================================
// COST CALCULATION
// =============================================================================

// Prices per 1K tokens (Standard tier, January 2026)
// Source: https://platform.openai.com/docs/pricing
const TOKEN_COSTS: Record<string, { input: number; output: number; cachedInput?: number }> = {
  // GPT-5 Series
  'gpt-5.2': { input: 0.00175, output: 0.014, cachedInput: 0.000175 },
  'gpt-5.2-pro': { input: 0.021, output: 0.168 },
  'gpt-5.2-pro-2025-12-11': { input: 0.021, output: 0.168 },
  'gpt-5.2-codex': { input: 0.00175, output: 0.014, cachedInput: 0.000175 },
  'gpt-5.2-chat-latest': { input: 0.00175, output: 0.014, cachedInput: 0.000175 },
  'gpt-5.1': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5.1-codex': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5.1-codex-max': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5.1-codex-mini': { input: 0.00025, output: 0.002, cachedInput: 0.000025 },
  'gpt-5.1-chat-latest': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5-codex': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5-chat-latest': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-5-pro': { input: 0.015, output: 0.12 },
  'gpt-5-mini': { input: 0.00025, output: 0.002, cachedInput: 0.000025 },
  'gpt-5-nano': { input: 0.00005, output: 0.0004, cachedInput: 0.000005 },
  // GPT-4 Series
  'gpt-4.1': { input: 0.002, output: 0.008, cachedInput: 0.0005 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016, cachedInput: 0.0001 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004, cachedInput: 0.000025 },
  'gpt-4o': { input: 0.0025, output: 0.01, cachedInput: 0.00125 },
  'gpt-4o-2024-05-13': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006, cachedInput: 0.000075 },
  // o-Series (Reasoning Models)
  'o1': { input: 0.015, output: 0.06, cachedInput: 0.0075 },
  'o1-pro': { input: 0.15, output: 0.6 },
  'o1-mini': { input: 0.0011, output: 0.0044, cachedInput: 0.00055 },
  'o3': { input: 0.002, output: 0.008, cachedInput: 0.0005 },
  'o3-pro': { input: 0.02, output: 0.08 },
  'o3-mini': { input: 0.0011, output: 0.0044, cachedInput: 0.00055 },
  'o3-deep-research': { input: 0.01, output: 0.04, cachedInput: 0.0025 },
  'o4-mini': { input: 0.0011, output: 0.0044, cachedInput: 0.000275 },
  'o4-mini-deep-research': { input: 0.002, output: 0.008, cachedInput: 0.0005 },
  // Realtime & Audio
  'gpt-realtime': { input: 0.004, output: 0.016, cachedInput: 0.0004 },
  'gpt-realtime-mini': { input: 0.0006, output: 0.0024, cachedInput: 0.00006 },
  'gpt-4o-realtime-preview': { input: 0.005, output: 0.02, cachedInput: 0.0025 },
  'gpt-4o-mini-realtime-preview': { input: 0.0006, output: 0.0024, cachedInput: 0.0003 },
  'gpt-audio': { input: 0.0025, output: 0.01 },
  'gpt-audio-mini': { input: 0.0006, output: 0.0024 },
  // Search Models
  'gpt-5-search-api': { input: 0.00125, output: 0.01, cachedInput: 0.000125 },
  'gpt-4o-search-preview': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini-search-preview': { input: 0.00015, output: 0.0006 },
  // Image Models (text tokens)
  'gpt-image-1.5': { input: 0.005, output: 0.01, cachedInput: 0.00125 },
  'chatgpt-image-latest': { input: 0.005, output: 0.01, cachedInput: 0.00125 },
  'gpt-image-1': { input: 0.005, cachedInput: 0.00125, output: 0 },
  'gpt-image-1-mini': { input: 0.002, cachedInput: 0.0002, output: 0 },
  // Computer Use
  'computer-use-preview': { input: 0.003, output: 0.012 },
  // Codex Mini
  'codex-mini-latest': { input: 0.0015, output: 0.006, cachedInput: 0.000375 },
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number = 0
): number {
  // Find exact match or partial match (for versioned models like gpt-5.2-chat-latest)
  let costs = TOKEN_COSTS[model]
  if (!costs) {
    // Try to find a partial match (e.g., 'gpt-5.2-codex' matches 'gpt-5.2-codex-something')
    const baseModel = Object.keys(TOKEN_COSTS).find(key => model.startsWith(key))
    costs = baseModel ? TOKEN_COSTS[baseModel] : { input: 0.00125, output: 0.01 } // Default to gpt-5 prices
  }
  
  const regularInputTokens = inputTokens - cachedInputTokens
  const cachedCost = cachedInputTokens * (costs.cachedInput ?? costs.input * 0.1)
  const inputCost = regularInputTokens * costs.input
  const outputCost = outputTokens * costs.output
  
  return (cachedCost + inputCost + outputCost) / 1000
}

// =============================================================================
// PROJECT DATA LOADER
// =============================================================================

export async function loadProjectData(projectId: string) {
  const supabase = getSupabase()
  
  const { data: project, error } = await supabase
    .from('projects')
    .select(`
      *,
      pages:project_pages(
        id,
        name,
        slug,
        sections:page_sections(section_type)
      )
    `)
    .eq('id', projectId)
    .single()
  
  if (error) throw new Error(`Failed to load project: ${error.message}`)
  
  return {
    id: project.id,
    name: project.name,
    brief: project.brief || '',
    targetAudience: project.target_audience || '',
    websiteStyle: project.website_style || 'modern',
    packageType: project.package_type || 'basic',
    primaryColor: project.primary_color || '#0F172A',
    secondaryColor: project.secondary_color || '#059669',
    brandVoice: project.brand_voice || 'professional',
    industry: project.industry || '',
    companySize: project.company_size || '',
    foundedYear: project.founded_year,
    location: {
      city: project.location_city || '',
      country: project.location_country || 'Deutschland',
    },
    contact: {
      email: project.contact_email || '',
      phone: project.contact_phone || '',
      address: project.contact_address || '',
    },
    // Legal/Impressum Daten
    legal: {
      companyName: project.legal_company_name || project.name || '',
      form: project.legal_form || '', // GmbH, UG, etc.
      representative: project.legal_representative || '',
      vatId: project.legal_vat_id || '',
      registryCourt: project.legal_registry_court || '',
      registryNumber: project.legal_registry_number || '',
      responsiblePerson: project.legal_responsible_person || '',
      dataProtectionOfficer: project.legal_data_protection_officer || '',
      status: project.legal_status || 'incomplete',
    },
    pages: (project.pages || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sections: (p.sections || []).map((s: any) => s.section_type),
    })),
    addons: project.selected_addons || [],
    competitors: project.competitors || [],
    usps: project.unique_selling_points || [],
    existingContent: project.existing_content,
    seoPreferences: project.seo_preferences,
  }
}

// =============================================================================
// CORS HEADERS
// =============================================================================

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
