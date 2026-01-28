// Multi-Agent Orchestrator - Calls the first agent in the chain
// CHAIN: strategist -> content-pack -> editor -> code-renderer
// Each agent calls the next one, code-renderer saves to DB

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

interface ProjectData {
  id: string
  name: string
  brief: string
  target_audience: string
  website_style: string
  package_type: string
  primary_color: string
  secondary_color: string
  industry?: string
  brand_voice?: string
  pages?: Array<{ name: string; slug: string; sections?: string[] }>
  selected_addons?: string[]
  sanity_project_id?: string
  sanity_dataset?: string
  sanity_api_token?: string
  contact_email?: string
  resend_domain_id?: string
}

interface OrchestrationResult {
  success: boolean
  contentPack: any | null
  codeFiles: Array<{ path: string; content: string }>
  qualityScore: number
  error?: string
}

// =============================================================================
// ORCHESTRATE - Simply starts the chain by calling the first agent
// =============================================================================

export async function orchestrateMultiAgent(
  project: ProjectData
): Promise<OrchestrationResult> {
  console.log('[ORCHESTRATOR] Starting agent chain', {
    projectId: project.id,
    projectName: project.name,
    addons: project.selected_addons,
  })
  
  const startTime = Date.now()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  try {
    // Create pipeline_run record
    const { data: pipelineRun, error: pipelineError } = await supabase
      .from('pipeline_runs')
      .insert({
        project_id: project.id,
        status: 'running',
        phase: 1,
        current_agent: 'strategist',
      })
      .select('id')
      .single()
    
    if (pipelineError || !pipelineRun) {
      throw new Error(`Failed to create pipeline run: ${pipelineError?.message}`)
    }
    
    const pipelineRunId = pipelineRun.id
    console.log(`[ORCHESTRATOR] Created pipeline run: ${pipelineRunId}`)
    
    // Build proper AgentEnvelope
    const envelope = {
      meta: {
        pipelineRunId,
        projectId: project.id,
        agentName: 'strategist',
        phase: 1,
        sequence: 1,
        attempt: 1,
        timestamp: new Date().toISOString(),
      },
      project: {
        id: project.id,
        name: project.name,
        brief: project.brief,
        targetAudience: project.target_audience,
        websiteStyle: project.website_style,
        packageType: project.package_type,
        primaryColor: project.primary_color,
        secondaryColor: project.secondary_color,
        industry: project.industry,
        brandVoice: project.brand_voice,
        pages: project.pages,
        // WICHTIG: Addons für CMS, Booking, etc.
        addons: project.selected_addons || [],
        // Sanity CMS Config (falls aktiviert)
        sanityProjectId: project.sanity_project_id,
        sanityDataset: project.sanity_dataset,
        sanityApiToken: project.sanity_api_token,
        // Email Config (falls booking_form aktiviert)
        contactEmail: project.contact_email,
        resendDomainId: project.resend_domain_id,
      },
    }
    
    const url = `${SUPABASE_URL}/functions/v1/agent-strategist`
    
    console.log('[ORCHESTRATOR] 🚀 Starting chain: strategist -> content-pack -> editor -> code-renderer')
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify(envelope),
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Chain failed: ${error}`)
    }
    
    const result = await response.json()
    
    const duration = Date.now() - startTime
    console.log(`[ORCHESTRATOR] ✅ Chain complete in ${duration}ms`)
    console.log(`[ORCHESTRATOR] Files generated: ${result.codeFiles?.length || 0}`)
    console.log(`[ORCHESTRATOR] Quality score: ${result.qualityScore || 'N/A'}`)
    
    return {
      success: result.success !== false,
      contentPack: result.contentPack || null,
      codeFiles: result.codeFiles || [],
      qualityScore: result.qualityScore || 8.0,
      error: result.error,
    }
    
  } catch (error) {
    console.error('[ORCHESTRATOR] Chain failed:', error)
    return {
      success: false,
      contentPack: null,
      codeFiles: [],
      qualityScore: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
