// =============================================================================
// AGENT: CMS (Phase 5) - Optional
// Generates CMS schema and admin panel config
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  callOpenAI,
  calculateCost,
  updatePipelineMetrics,
  loadAgentOutput,
  checkPhase5Complete,
  triggerAgent,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import type { 
  AgentEnvelope, 
  AgentResponse, 
  CmsOutput,
  ContentPackOutput,
} from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist ein CMS-Architekt der Supabase-basierte Content Management Systeme designed.

Erstelle ein CMS-Schema basierend auf dem Content Pack:
- Supabase Tables für editierbare Inhalte
- Row Level Security Policies
- TypeScript Types für das Frontend
- Admin Panel Konfiguration

## Output-Format (JSON):
{
  "tables": [
    {
      "name": "site_settings",
      "columns": [
        {"name": "id", "type": "uuid", "primaryKey": true},
        {"name": "name", "type": "text", "nullable": false},
        {"name": "tagline", "type": "text", "nullable": true},
        {"name": "updated_at", "type": "timestamptz", "default": "now()"}
      ],
      "rls": {
        "selectPolicy": "true",
        "insertPolicy": "auth.role() = 'authenticated'",
        "updatePolicy": "auth.role() = 'authenticated'"
      }
    }
  ],
  "migrationSql": "-- SQL Migration\\nCREATE TABLE...",
  "types": "// TypeScript types\\nexport interface SiteSettings {...}",
  "adminConfig": {
    "collections": [
      {
        "name": "site_settings",
        "label": "Website Einstellungen",
        "fields": [...]
      }
    ]
  }
}

Antworte NUR mit validem JSON.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[CMS] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'cms',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')

    const userPrompt = `Respond with valid JSON only.

## CONTENT PACK
${JSON.stringify(contentPack, null, 2)}

## SEITEN
${project.pages.map(p => `- ${p.name}: ${p.sections.join(', ')}`).join('\n')}

Erstelle ein CMS-Schema das alle editierbaren Inhalte abdeckt als JSON.`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-pro-2025-12-11',
      8000
    )

    const output: CmsOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[CMS] Generated ${output.tables.length} tables in ${durationMs}ms`)

    // Save CMS migration to generated_files
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('generated_files').upsert({
      project_id: meta.projectId,
      file_path: 'supabase/migrations/cms_schema.sql',
      content: output.migrationSql,
      created_at: new Date().toISOString(),
    }, { onConflict: 'project_id,file_path' })

    await supabase.from('generated_files').upsert({
      project_id: meta.projectId,
      file_path: 'src/types/cms.ts',
      content: output.types,
      created_at: new Date().toISOString(),
    }, { onConflict: 'project_id,file_path' })

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      cost_usd: costUsd,
      quality_score: 8.5,
      validation_passed: true,
      completed_at: new Date().toISOString(),
    })

    await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

    // Check if Phase 5 is complete
    const phase5Complete = await checkPhase5Complete(meta.pipelineRunId, project)
    
    if (phase5Complete) {
      console.log('[CMS] Phase 5 complete, triggering Phase 6 (Deployer)...')
      await updatePipelineStatus(meta.pipelineRunId, 'phase_6')
      
      const deployerEnvelope: AgentEnvelope = {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      }
      await triggerAgent('deployer', deployerEnvelope)
    } else {
      console.log('[CMS] Waiting for other Phase 5 agents...')
    }

    const response: AgentResponse<CmsOutput> = {
      success: true,
      agentRunId,
      agentName: 'cms',
      output,
      quality: { score: 8.5, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: phase5Complete ? 6 : null,
        nextAgents: phase5Complete ? ['deployer'] : [],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs, inputTokens, outputTokens, model, costUsd },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[CMS] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'CMS_ERROR',
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
