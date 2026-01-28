// =============================================================================
// AGENT: CODE-RENDERER (Phase 4) - Orchestrator für Chunked Code-Generierung
// NEW ARCHITECTURE: Triggers section-generator per section → assembly
// Much faster: Parallel small API calls instead of one large call per page
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
  totalSections: number
  pageCount: number
  architecture: 'chunked'
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
    
    console.log(`[CODE-RENDERER] Starting CHUNKED orchestration (Pipeline: ${meta.pipelineRunId})`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'code-renderer',
      meta.phase,
      0,
      { mode: 'chunked' },
      meta.attempt
    )

    // Load Content Pack to get pages and sections
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    
    if (!contentPack) {
      throw new Error('Content Pack not found - cannot generate code')
    }

    const pages = contentPack.pages || []
    
    // Count total sections across all pages
    let totalSections = 0
    for (const page of pages) {
      totalSections += (page.sections?.length || 0)
    }
    
    // Add 1 for shared-components (Header, Footer, etc.)
    const expectedSectionCount = totalSections + 1
    
    console.log(`[CODE-RENDERER] Found ${pages.length} pages with ${totalSections} total sections`)

    const triggeredAgents: string[] = []

    // 1. Trigger shared-components (Header, Footer, Motion, etc.)
    console.log('[CODE-RENDERER] Triggering shared-components...')
    const sharedEnvelope = {
      ...envelope,
      meta: {
        ...meta,
        agentName: 'shared-components',
        phase: 4,
        sequence: 0,
        timestamp: new Date().toISOString(),
        expectedSectionCount,
      },
    }
    await triggerAgent('shared-components', sharedEnvelope)
    triggeredAgents.push('shared-components')

    // 2. Trigger section-generator for EACH section of EACH page (massively parallel!)
    console.log(`[CODE-RENDERER] Triggering ${totalSections} section-generators...`)
    
    let sectionSequence = 1
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex]
      const sections = page.sections || []
      
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        const section = sections[sectionIndex]
        
        const sectionEnvelope = {
          ...envelope,
          meta: {
            ...meta,
            agentName: 'section-generator',
            phase: 4,
            sequence: sectionSequence++,
            timestamp: new Date().toISOString(),
            sectionInput: {
              pageSlug: page.slug,
              pageIndex,
              sectionIndex,
              sectionType: section.type,
              sectionContent: section.content,
              totalSections: sections.length,
              totalPages: pages.length,
            },
            expectedSectionCount,
          },
        }
        
        await triggerAgent('section-generator', sectionEnvelope)
        triggeredAgents.push(`section:${page.slug}/${section.type}`)
      }
    }

    // NOTE: No assembly trigger here!
    // Each section-generator checks if all sections are complete
    // The last one to finish triggers the assembly agent

    const durationMs = Date.now() - startTime

    const output: CodeRendererOutput = {
      triggeredAgents,
      totalSections,
      pageCount: pages.length,
      architecture: 'chunked',
    }

    console.log(`[CODE-RENDERER] ✅ Orchestration complete: ${triggeredAgents.length} agents triggered in ${durationMs}ms`)
    console.log(`[CODE-RENDERER] Architecture: CHUNKED (${totalSections} sections parallel)`)

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
        nextPhase: null, // assembly handles next phase
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
