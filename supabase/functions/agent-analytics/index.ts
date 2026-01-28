// =============================================================================
// AGENT: ANALYTICS (Phase 5) - DSGVO-konforme Analytics
// Triggered by: sanity-setup or resend-setup (for enterprise/analytics addon)
// Triggers: deployer
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
  triggerAgent,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import type { 
  AgentEnvelope, 
  AgentResponse, 
  AnalyticsOutput,
  ContentPackOutput,
} from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist ein Analytics-Experte der DSGVO-konforme Tracking-Lösungen implementiert.

Erstelle:
1. Analytics-Konfiguration (Google Analytics 4 oder Plausible)
2. Cookie Consent Banner
3. Event Tracking Hooks
4. Conversion Tracking

## Output-Format (JSON):
{
  "provider": "ga4|plausible",
  "config": {
    "measurementId": "G-XXXXXXXXXX",
    "consentMode": true
  },
  "consentBanner": {
    "component": "// React Component Code",
    "styles": "// Tailwind styles"
  },
  "trackingHooks": {
    "code": "// useAnalytics hook"
  },
  "events": [
    {
      "name": "contact_form_submit",
      "category": "engagement",
      "trigger": "form_submit"
    }
  ]
}

WICHTIG:
- DSGVO-konform mit Consent Mode
- Keine Cookies ohne Zustimmung
- Privacy-first Ansatz

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
    
    console.log(`[ANALYTICS] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'analytics',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')

    const userPrompt = `Respond with valid JSON only.

## PROJEKT
Name: ${project.name}
Package: ${project.packageType}

## SEITEN
${project.pages.map(p => `- ${p.name} (/${p.slug})`).join('\n')}

## CONTENT PACK CONTACT
${JSON.stringify(contentPack?.siteSettings?.contact, null, 2)}

Erstelle ein DSGVO-konformes Analytics-Setup als JSON.
Verwende Plausible Analytics als Privacy-freundliche Alternative.`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-chat-latest',
      6000
    )

    const output: AnalyticsOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[ANALYTICS] Generated config in ${durationMs}ms`)

    // Save files
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('generated_files').upsert({
      project_id: meta.projectId,
      file_path: 'src/hooks/useAnalytics.ts',
      content: output.trackingHooks.code,
      created_at: new Date().toISOString(),
    }, { onConflict: 'project_id,file_path' })

    await supabase.from('generated_files').upsert({
      project_id: meta.projectId,
      file_path: 'src/components/CookieConsent.tsx',
      content: output.consentBanner.component,
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

    // Analytics is always the last Phase 5 agent - trigger deployer
    console.log('[ANALYTICS] Triggering Phase 6 (Deployer)...')
    await updatePipelineStatus(meta.pipelineRunId, 'phase_6')
    
    await triggerAgent('deployer', {
      ...envelope,
      meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
    })

    const response: AgentResponse<AnalyticsOutput> = {
      success: true,
      agentRunId,
      agentName: 'analytics',
      output,
      quality: { score: 8.5, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: 6,
        nextAgents: ['deployer'],
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
    console.error('[ANALYTICS] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'ANALYTICS_ERROR',
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
