// =============================================================================
// PIPELINE ORCHESTRATOR
// Creates pipeline run and triggers Phase 1 agents in parallel
// Returns immediately to avoid timeout - agents coordinate themselves
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createHash } from 'https://deno.land/std@0.208.0/crypto/mod.ts'
import {
  corsHeaders,
  loadProjectData,
  triggerAgent,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, ProjectData, PHASE_CONFIG } from '../_shared/types/pipeline.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  
  try {
    const { projectId, forceRegenerate = false } = await req.json()
    
    if (!projectId) {
      throw new Error('projectId is required')
    }
    
    console.log('[ORCHESTRATOR] Starting pipeline for project:', projectId)
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    // Load project data
    const projectData = await loadProjectData(projectId)
    console.log('[ORCHESTRATOR] Project loaded:', projectData.name)
    
    // Create input snapshot and hash for caching
    const inputSnapshot = {
      project: projectData,
      timestamp: new Date().toISOString(),
    }
    const inputHash = await hashObject(inputSnapshot)
    
    // Check for existing pipeline with same input (cache hit)
    if (!forceRegenerate) {
      const { data: existingPipeline } = await supabase
        .from('pipeline_runs')
        .select('id, status, preview_url')
        .eq('project_id', projectId)
        .eq('input_hash', inputHash)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (existingPipeline) {
        console.log('[ORCHESTRATOR] Cache hit! Using existing pipeline:', existingPipeline.id)
        return new Response(JSON.stringify({
          success: true,
          pipelineRunId: existingPipeline.id,
          status: 'completed',
          cached: true,
          previewUrl: existingPipeline.preview_url,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    
    // Generate correlation ID for logging
    const correlationId = `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    
    // Create pipeline run record
    const { data: pipelineRun, error: pipelineError } = await supabase
      .from('pipeline_runs')
      .insert({
        project_id: projectId,
        correlation_id: correlationId,
        status: 'phase_1',
        current_phase: 1,
        input_snapshot: inputSnapshot,
        input_hash: inputHash,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    
    if (pipelineError) {
      throw new Error(`Failed to create pipeline run: ${pipelineError.message}`)
    }
    
    const pipelineRunId = pipelineRun.id
    console.log('[ORCHESTRATOR] Pipeline created:', pipelineRunId)
    
    // Update project status
    await supabase
      .from('projects')
      .update({ status: 'generating' })
      .eq('id', projectId)
    
    // Prepare base envelope for agents
    const baseEnvelope: Omit<AgentEnvelope, 'meta'> & { meta: Omit<AgentEnvelope['meta'], 'agentName' | 'sequence'> } = {
      meta: {
        pipelineRunId,
        projectId,
        correlationId,
        phase: 1,
        attempt: 1,
        maxAttempts: 3,
        timestamp: new Date().toISOString(),
      },
      project: projectData as ProjectData,
    }
    
    // Trigger Phase 1 agents in parallel (fire and forget)
    const phase1Agents = ['strategist', 'seo', 'legal', 'visual', 'image'] as const
    
    console.log('[ORCHESTRATOR] 🚀 Triggering Phase 1 agents:', phase1Agents.join(', '))
    
    for (let i = 0; i < phase1Agents.length; i++) {
      const agentName = phase1Agents[i]
      const envelope: AgentEnvelope = {
        ...baseEnvelope,
        meta: {
          ...baseEnvelope.meta,
          agentName,
          sequence: i + 1,
        },
      } as AgentEnvelope
      
      // Fire and forget - don't await
      triggerAgent(agentName, envelope)
    }
    
    const duration = Date.now() - startTime
    console.log(`[ORCHESTRATOR] ✅ Pipeline started in ${duration}ms, returning immediately`)
    
    // Return immediately - agents will coordinate themselves
    return new Response(JSON.stringify({
      success: true,
      pipelineRunId,
      correlationId,
      status: 'phase_1',
      message: 'Pipeline started. Phase 1 agents triggered.',
      agents: phase1Agents,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    
  } catch (error) {
    console.error('[ORCHESTRATOR] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function hashObject(obj: unknown): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(obj))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
