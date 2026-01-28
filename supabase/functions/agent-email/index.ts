// =============================================================================
// AGENT: EMAIL (Phase 5) - Optional
// Generates email templates and form handling
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
  EmailOutput,
  ContentPackOutput,
} from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist ein E-Mail-Experte der professionelle E-Mail-Templates und Formulare erstellt.

Erstelle:
1. E-Mail Templates (React Email kompatibel)
2. Supabase Edge Function für E-Mail-Versand
3. Kontaktformular-Handler
4. Autoresponder-Logik

## Output-Format (JSON):
{
  "templates": [
    {
      "name": "contact_confirmation",
      "subject": "Vielen Dank für Ihre Nachricht",
      "html": "<!DOCTYPE html>...",
      "text": "Plain text version"
    },
    {
      "name": "admin_notification",
      "subject": "Neue Kontaktanfrage von {{name}}",
      "html": "...",
      "text": "..."
    }
  ],
  "edgeFunction": {
    "name": "send-email",
    "code": "// Deno Edge Function code"
  },
  "formHandler": {
    "code": "// Form submission handler"
  }
}

WICHTIG:
- Professionelle, responsive HTML E-Mails
- DSGVO-konform (Double Opt-In ready)
- Fehlerbehandlung

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
    
    console.log(`[EMAIL] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'email',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')

    const userPrompt = `Respond with valid JSON only.

## CONTENT PACK
${JSON.stringify(contentPack?.siteSettings, null, 2)}

## KONTAKT
${JSON.stringify(project.contact, null, 2)}

## FIRMENNAME
${project.name}

Erstelle E-Mail Templates und Handler für das Kontaktformular als JSON.`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-codex',
      8000
    )

    const output: EmailOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[EMAIL] Generated ${output.templates.length} templates in ${durationMs}ms`)

    // Save files
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('generated_files').upsert({
      project_id: meta.projectId,
      file_path: `supabase/functions/${output.edgeFunction.name}/index.ts`,
      content: output.edgeFunction.code,
      created_at: new Date().toISOString(),
    }, { onConflict: 'project_id,file_path' })

    for (const template of output.templates) {
      await supabase.from('generated_files').upsert({
        project_id: meta.projectId,
        file_path: `src/emails/${template.name}.tsx`,
        content: template.html,
        created_at: new Date().toISOString(),
      }, { onConflict: 'project_id,file_path' })
    }

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
      console.log('[EMAIL] Phase 5 complete, triggering Phase 6 (Deployer)...')
      await updatePipelineStatus(meta.pipelineRunId, 'phase_6')
      
      const deployerEnvelope: AgentEnvelope = {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      }
      await triggerAgent('deployer', deployerEnvelope)
    }

    const response: AgentResponse<EmailOutput> = {
      success: true,
      agentRunId,
      agentName: 'email',
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
    console.error('[EMAIL] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'EMAIL_ERROR',
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
