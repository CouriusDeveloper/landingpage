// =============================================================================
// PIPELINE STOP
// Stops all running pipelines and agent runs
// Sets status to 'cancelled' for all active processes
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/agent-utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId } = await req.json().catch(() => ({}))
    
    console.log('[PIPELINE-STOP] Stopping pipelines', projectId ? `for project ${projectId}` : 'globally')
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const now = new Date().toISOString()
    
    // Active pipeline statuses
    const activeStatuses = ['pending', 'phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6', 'needs_human']
    
    // Build pipeline query
    let pipelineQuery = supabase
      .from('pipeline_runs')
      .update({
        status: 'cancelled',
        completed_at: now,
        error_message: 'Manually stopped by admin',
      })
      .in('status', activeStatuses)
    
    if (projectId) {
      pipelineQuery = pipelineQuery.eq('project_id', projectId)
    }
    
    const { data: stoppedPipelines, error: pipelineError } = await pipelineQuery.select('id')
    
    if (pipelineError) {
      console.error('[PIPELINE-STOP] Error stopping pipelines:', pipelineError)
      throw pipelineError
    }
    
    const stoppedPipelineCount = stoppedPipelines?.length || 0
    console.log(`[PIPELINE-STOP] Stopped ${stoppedPipelineCount} pipelines`)
    
    // Stop all running agent runs
    let agentQuery = supabase
      .from('agent_runs')
      .update({
        status: 'cancelled',
        completed_at: now,
        error_message: 'Pipeline stopped by admin',
      })
      .eq('status', 'running')
    
    if (projectId) {
      agentQuery = agentQuery.eq('project_id', projectId)
    }
    
    const { data: stoppedAgents, error: agentError } = await agentQuery.select('id')
    
    if (agentError) {
      console.error('[PIPELINE-STOP] Error stopping agents:', agentError)
      // Don't throw - pipelines already stopped
    }
    
    const stoppedAgentCount = stoppedAgents?.length || 0
    console.log(`[PIPELINE-STOP] Stopped ${stoppedAgentCount} agent runs`)
    
    // Reset project status if specified
    if (projectId) {
      await supabase
        .from('projects')
        .update({ status: 'discovery' })
        .eq('id', projectId)
        .eq('status', 'generating')
      
      console.log('[PIPELINE-STOP] Reset project status to discovery')
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Stopped ${stoppedPipelineCount} pipelines and ${stoppedAgentCount} agent runs`,
        stoppedPipelines: stoppedPipelineCount,
        stoppedAgents: stoppedAgentCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
    
  } catch (error) {
    console.error('[PIPELINE-STOP] Error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
