// =============================================================================
// AGENT: COLLECTOR (Phase 1.5)
// Wartet auf alle Phase 1 Agents und triggert dann Content-Pack
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  loadMultipleAgentOutputs,
  triggerAgent,
  updatePipelineStatus,
  getSupabase,
  isPipelineCancelled,
} from '../_shared/agent-utils.ts'
import type { 
  AgentEnvelope, 
  AgentResponse,
  AgentName,
} from '../_shared/types/pipeline.ts'

const PHASE_1_AGENTS: AgentName[] = ['strategist', 'seo', 'legal', 'visual', 'image']
const MAX_WAIT_MS = 55000 // 55 Sekunden (unter 60s Timeout)
const POLL_INTERVAL_MS = 2000 // Alle 2 Sekunden prüfen

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[COLLECTOR] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'collector',
      1, // Still Phase 1
      99, // Last in sequence
      { project },
      meta.attempt
    )

    const supabase = getSupabase()

    // Poll until all Phase 1 agents are complete or timeout
    let allComplete = false
    let completedAgents: string[] = []
    let failedAgents: string[] = []
    
    while (Date.now() - startTime < MAX_WAIT_MS) {
      // Check if pipeline was cancelled
      if (await isPipelineCancelled(meta.pipelineRunId)) {
        console.log('[COLLECTOR] Pipeline cancelled, aborting')
        await updateAgentRun(agentRunId, {
          status: 'cancelled',
          error_message: 'Pipeline cancelled',
          completed_at: new Date().toISOString(),
        })
        return new Response(JSON.stringify({ cancelled: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: agentRuns } = await supabase
        .from('agent_runs')
        .select('agent_name, status')
        .eq('pipeline_run_id', meta.pipelineRunId)
        .eq('phase', 1)
        .in('agent_name', PHASE_1_AGENTS)

      if (agentRuns) {
        completedAgents = agentRuns
          .filter(r => r.status === 'completed')
          .map(r => r.agent_name)
        
        failedAgents = agentRuns
          .filter(r => r.status === 'failed')
          .map(r => r.agent_name)

        console.log(`[COLLECTOR] Progress: ${completedAgents.length}/${PHASE_1_AGENTS.length} complete, ${failedAgents.length} failed`)

        // Check if all required agents completed (strategist is mandatory)
        const strategistComplete = completedAgents.includes('strategist')
        const allFinished = completedAgents.length + failedAgents.length >= PHASE_1_AGENTS.length
        
        if (strategistComplete && allFinished) {
          allComplete = true
          break
        }
        
        // If strategist failed, abort
        if (failedAgents.includes('strategist')) {
          throw new Error('Strategist agent failed - cannot proceed')
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    if (!allComplete) {
      console.log(`[COLLECTOR] Timeout waiting for Phase 1 agents`)
      // Continue anyway if strategist is done
      if (!completedAgents.includes('strategist')) {
        throw new Error('Timeout: Strategist not complete')
      }
    }

    const durationMs = Date.now() - startTime
    console.log(`[COLLECTOR] All Phase 1 agents ready in ${durationMs}ms`)
    console.log(`[COLLECTOR] Completed: ${completedAgents.join(', ')}`)
    if (failedAgents.length > 0) {
      console.log(`[COLLECTOR] Failed (non-critical): ${failedAgents.join(', ')}`)
    }

    // Load all outputs for summary
    const outputs = await loadMultipleAgentOutputs(meta.pipelineRunId, PHASE_1_AGENTS)

    const output = {
      completedAgents,
      failedAgents,
      outputsAvailable: Object.keys(outputs),
      collectedAt: new Date().toISOString(),
    }

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: null,
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: durationMs,
      cost_usd: 0,
      quality_score: 10,
      validation_passed: true,
      completed_at: new Date().toISOString(),
    })

    // Trigger Phase 2 (Content-Pack)
    console.log('[COLLECTOR] ✅ Triggering Phase 2 (Content-Pack)...')
    await updatePipelineStatus(meta.pipelineRunId, 'phase_2')
    
    const contentPackEnvelope: AgentEnvelope = {
      ...envelope,
      meta: {
        ...meta,
        agentName: 'content-pack',
        phase: 2,
        sequence: 1,
        timestamp: new Date().toISOString(),
      },
    }
    await triggerAgent('content-pack', contentPackEnvelope)

    const response: AgentResponse<typeof output> = {
      success: true,
      agentRunId,
      agentName: 'collector',
      output,
      quality: { score: 10, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: 2,
        nextAgents: ['content-pack'],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs, inputTokens: 0, outputTokens: 0, model: null, costUsd: 0 },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[COLLECTOR] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'COLLECTOR_ERROR',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
