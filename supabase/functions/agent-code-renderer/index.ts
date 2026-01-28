// =============================================================================
// AGENT: CODE-RENDERER (Phase 4) - Orchestrator für Code-Generierung
// Triggert: shared-components + page-builder (parallel) → code-collector
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  loadAgentOutput,
  triggerAgent,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import type { 
  AgentEnvelope, 
  AgentResponse, 
  ContentPackOutput,
} from '../_shared/types/pipeline.ts'

interface CodeRendererOutput {
  triggeredAgents: string[]
  pageCount: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[CODE-RENDERER] Starting orchestration (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'code-renderer',
      meta.phase,
      0,
      { project: project.name },
      meta.attempt
    )

    // Load Content Pack to get pages
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    
    if (!contentPack) {
      throw new Error('Content Pack not found - cannot generate code')
    }

    const pages = contentPack.pages || []
    const pageSlugs = pages.map(p => p.slug)
    
    console.log(`[CODE-RENDERER] Found ${pages.length} pages: ${pageSlugs.join(', ')}`)

    const triggeredAgents: string[] = []

    // 1. Trigger shared-components (Header, Footer, Section-Komponenten)
    console.log('[CODE-RENDERER] Triggering shared-components...')
    const sharedEnvelope: AgentEnvelope = {
      ...envelope,
      meta: {
        ...meta,
        agentName: 'shared-components',
        phase: 4,
        sequence: 0,
        timestamp: new Date().toISOString(),
        // Für Self-Coordination
        expectedAgentCount: pages.length + 1, // pages + shared-components
      },
    }
    await triggerAgent('shared-components', sharedEnvelope)
    triggeredAgents.push('shared-components')

    // 2. Trigger page-builder für jede Seite (parallel!)
    console.log(`[CODE-RENDERER] Triggering ${pages.length} page-builders...`)
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const pageEnvelope: AgentEnvelope = {
        ...envelope,
        meta: {
          ...meta,
          agentName: 'page-builder',
          phase: 4,
          sequence: i + 1,
          timestamp: new Date().toISOString(),
          pageInput: {
            pageSlug: page.slug,
            pageIndex: i,
            totalPages: pages.length,
          },
          // Für Self-Coordination: Wie viele Agents müssen fertig sein?
          expectedAgentCount: pages.length + 1, // pages + shared-components
        },
      }
      await triggerAgent('page-builder', pageEnvelope)
      triggeredAgents.push(`page-builder:${page.slug}`)
    }

    // NOTE: KEIN code-collector mehr! Jeder Agent prüft selbst ob alle fertig sind

    const durationMs = Date.now() - startTime

    const output: CodeRendererOutput = {
      triggeredAgents,
      pageCount: pages.length,
    }

    console.log(`[CODE-RENDERER] Orchestration complete: ${triggeredAgents.length} agents triggered in ${durationMs}ms`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })

    const response: AgentResponse<CodeRendererOutput> = {
      success: true,
      agentRunId,
      agentName: 'code-renderer',
      output,
      quality: { score: 10, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: null, // code-collector handles next phase
        nextAgents: triggeredAgents,
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs, inputTokens: 0, outputTokens: 0, model: 'orchestrator', costUsd: 0 },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[CODE-RENDERER] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'CODE_RENDERER_ERROR',
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
