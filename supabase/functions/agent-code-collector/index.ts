// =============================================================================
// AGENT: CODE-COLLECTOR (Phase 4) - Wartet auf alle Page-Builders + Shared Components
// Dann triggert Deployer
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  triggerAgent,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse } from '../_shared/types/pipeline.ts'

const MAX_WAIT_MS = 55000 // 55s max (unter 60s Timeout)
const POLL_INTERVAL_MS = 2000 // Alle 2s prüfen

interface CodeCollectorOutput {
  totalFiles: number
  pagesBuilt: string[]
  sharedComponents: string[]
  waitTimeMs: number
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
    
    const expectedPages = meta.expectedPages as string[] || []
    console.log(`[CODE-COLLECTOR] Waiting for ${expectedPages.length} pages + shared components...`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'code-collector',
      meta.phase,
      99, // High sequence = runs after page-builders
      { expectedPages },
      meta.attempt
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Warte auf alle Agents
    let allComplete = false
    let iterations = 0
    const maxIterations = Math.floor(MAX_WAIT_MS / POLL_INTERVAL_MS)
    
    while (!allComplete && iterations < maxIterations) {
      iterations++
      
      // Check shared-components agent
      const { data: sharedRun } = await supabase
        .from('agent_runs')
        .select('status')
        .eq('pipeline_run_id', meta.pipelineRunId)
        .eq('agent_name', 'shared-components')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Check all page-builder agents
      const { data: pageRuns } = await supabase
        .from('agent_runs')
        .select('status, input_data')
        .eq('pipeline_run_id', meta.pipelineRunId)
        .eq('agent_name', 'page-builder')
        .order('created_at', { ascending: false })

      const sharedComplete = sharedRun?.status === 'completed'
      const completedPages = pageRuns?.filter(r => r.status === 'completed').length || 0
      const failedAgents = pageRuns?.filter(r => r.status === 'failed').length || 0

      console.log(`[CODE-COLLECTOR] Poll ${iterations}: shared=${sharedComplete}, pages=${completedPages}/${expectedPages.length}, failed=${failedAgents}`)

      if (failedAgents > 0) {
        throw new Error(`${failedAgents} page-builder(s) failed`)
      }

      if (sharedComplete && completedPages >= expectedPages.length) {
        allComplete = true
        console.log('[CODE-COLLECTOR] All code generation complete!')
      } else {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    if (!allComplete) {
      throw new Error(`Timeout after ${MAX_WAIT_MS}ms waiting for code generation`)
    }

    const waitTimeMs = Date.now() - startTime

    // Count total files generated
    const { count: totalFiles } = await supabase
      .from('generated_files')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', meta.projectId)

    // Get list of generated files for output
    const { data: files } = await supabase
      .from('generated_files')
      .select('file_path')
      .eq('project_id', meta.projectId)

    const filePaths = files?.map(f => f.file_path) || []
    const pagesBuilt = filePaths.filter(p => p.includes('/app/') && p.endsWith('page.tsx'))
    const sharedComponents = filePaths.filter(p => p.includes('/components/'))

    const output: CodeCollectorOutput = {
      totalFiles: totalFiles || 0,
      pagesBuilt,
      sharedComponents,
      waitTimeMs,
    }

    console.log(`[CODE-COLLECTOR] Complete: ${totalFiles} files in ${waitTimeMs}ms`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      duration_ms: waitTimeMs,
      completed_at: new Date().toISOString(),
    })

    // Update pipeline files count
    await supabase
      .from('pipeline_runs')
      .update({ files_generated: totalFiles })
      .eq('id', meta.pipelineRunId)

    // Trigger Phase 5 or 6 based on addons
    const needsIntegrations = project.addons?.includes('cms_base') || 
                              project.addons?.includes('booking_form') ||
                              project.packageType === 'enterprise'

    if (needsIntegrations) {
      console.log('[CODE-COLLECTOR] Triggering Phase 5 (Integrations)...')
      await updatePipelineStatus(meta.pipelineRunId, 'phase_5')
      // TODO: Trigger integration agents
    } else {
      console.log('[CODE-COLLECTOR] Triggering Phase 6 (Deployer)...')
      await updatePipelineStatus(meta.pipelineRunId, 'phase_6')
      
      const deployerEnvelope: AgentEnvelope = {
        ...envelope,
        meta: {
          ...meta,
          agentName: 'deployer',
          phase: 6,
          sequence: 1,
          timestamp: new Date().toISOString(),
        },
      }
      await triggerAgent('deployer', deployerEnvelope)
    }

    const response: AgentResponse<CodeCollectorOutput> = {
      success: true,
      agentRunId,
      agentName: 'code-collector',
      output,
      quality: { score: 10, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: needsIntegrations ? 5 : 6,
        nextAgents: needsIntegrations ? ['cms', 'email', 'analytics'] : ['deployer'],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs: waitTimeMs, inputTokens: 0, outputTokens: 0, model: 'collector', costUsd: 0 },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[CODE-COLLECTOR] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'CODE_COLLECTOR_ERROR',
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
