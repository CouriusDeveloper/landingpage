// =============================================================================
// AGENT: EDITOR (Phase 3) - Quality Gate
// Reviews Content Pack, can trigger retry of Phase 2 if score < 8
// =============================================================================

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
  incrementPipelineRetries,
  getPipelineRun,
} from '../_shared/agent-utils.ts'
import type { 
  AgentEnvelope, 
  AgentResponse, 
  EditorOutput,
  ContentPackOutput,
  StrategistOutput,
} from '../_shared/types/pipeline.ts'

const QUALITY_THRESHOLD = 7.0
const MAX_RETRIES = 3

const SYSTEM_PROMPT = `Du bist ein erfahrener Content-Editor und Qualitätssicherungs-Experte.

Bewerte das Content Pack nach diesen Kriterien (je 1-10):
1. brandConsistency: Passt alles zur Markenstrategie?
2. contentQuality: Sind Texte professionell, überzeugend, fehlerfrei?
3. seoOptimization: Meta-Tags, Keywords, Struktur korrekt?
4. userExperience: Logischer Aufbau, klare CTAs, guter Flow?
5. technicalAccuracy: Alle Felder korrekt ausgefüllt, keine Platzhalter?

## Output-Format (JSON):
{
  "qualityScore": {
    "overall": 8.5,
    "categories": {
      "brandConsistency": 9,
      "contentQuality": 8,
      "seoOptimization": 8,
      "userExperience": 9,
      "technicalAccuracy": 8
    }
  },
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "brandConsistency|contentQuality|seoOptimization|userExperience|technicalAccuracy",
      "description": "Beschreibung des Problems",
      "location": "pages[0].sections[1].content.headline",
      "suggestion": "Konkreter Verbesserungsvorschlag"
    }
  ],
  "improvements": {
    "specificFixes": [
      {
        "path": "pages[0].sections[0].content.headline",
        "currentValue": "Aktueller Text",
        "suggestedValue": "Verbesserter Text",
        "reason": "Grund für Änderung"
      }
    ]
  },
  "approved": true
}

WICHTIG:
- overall Score >= 8.0 = approved: true
- Bei critical issues: approved: false
- Gib konkrete, umsetzbare Verbesserungsvorschläge

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
    
    console.log(`[EDITOR] Starting Quality Review (Pipeline: ${meta.pipelineRunId}, Attempt: ${meta.attempt})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'editor',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    // Load Content Pack and Strategist outputs
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    const strategist = await loadAgentOutput<StrategistOutput>(meta.pipelineRunId, 'strategist')

    if (!contentPack) {
      throw new Error('Content Pack not found - cannot review')
    }

    const userPrompt = `Respond with valid JSON only.

## MARKENSTRATEGIE (Referenz)
${strategist ? JSON.stringify(strategist.brandStrategy, null, 2) : 'Nicht verfügbar'}

## CONTENT PACK ZU BEWERTEN
${JSON.stringify(contentPack, null, 2)}

Bewerte das Content Pack und erstelle einen Quality Report als JSON.
Overall Score >= ${QUALITY_THRESHOLD} = approved: true`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-pro-2025-12-11',
      4000
    )

    const output: EditorOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    const score = output.qualityScore.overall
    const criticalIssues = output.issues.filter(i => i.severity === 'critical').length
    
    // WIR entscheiden ob approved - nur basierend auf Score!
    // GPT's "approved" Feld wird ignoriert, da es oft falsch ist
    const approved = score >= QUALITY_THRESHOLD

    console.log(`[EDITOR] Review complete: Score ${score}, Approved: ${approved}, Critical: ${criticalIssues}`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      cost_usd: costUsd,
      quality_score: score,
      validation_passed: approved,
      validation_errors: output.issues.map(i => `[${i.severity}] ${i.description}`),
      completed_at: new Date().toISOString(),
    })

    await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

    // Decision: Approve, Retry, or Needs Human
    if (approved) {
      // Quality passed - trigger Phase 4 (Code Renderer)
      console.log('[EDITOR] ✅ Quality passed, triggering Phase 4 (Code Renderer)...')
      await updatePipelineStatus(meta.pipelineRunId, 'phase_4', {
        quality_score: score,
      })
      
      const codeRendererEnvelope: AgentEnvelope = {
        ...envelope,
        meta: {
          ...meta,
          agentName: 'code-renderer',
          phase: 4,
          sequence: 1,
          timestamp: new Date().toISOString(),
        },
      }
      await triggerAgent('code-renderer', codeRendererEnvelope)
      
    } else {
      // Quality failed - check if we can retry
      const pipeline = await getPipelineRun(meta.pipelineRunId)
      const totalRetries = pipeline.total_retries || 0
      
      if (totalRetries < MAX_RETRIES) {
        // Retry Phase 2 with improvements
        console.log(`[EDITOR] ⚠️ Quality failed (${score}), retrying Phase 2 (attempt ${totalRetries + 2})...`)
        await incrementPipelineRetries(meta.pipelineRunId)
        await updatePipelineStatus(meta.pipelineRunId, 'phase_2')
        
        const retryEnvelope: AgentEnvelope = {
          ...envelope,
          meta: {
            ...meta,
            agentName: 'content-pack',
            phase: 2,
            sequence: 1,
            attempt: totalRetries + 2,
            timestamp: new Date().toISOString(),
          },
        }
        await triggerAgent('content-pack', retryEnvelope)
        
      } else {
        // Max retries reached - needs human intervention
        console.log('[EDITOR] ❌ Max retries reached, marking as needs_human')
        await updatePipelineStatus(meta.pipelineRunId, 'needs_human', {
          quality_score: score,
          error_code: 'QUALITY_THRESHOLD_NOT_MET',
          error_message: `Quality score ${score} below threshold ${QUALITY_THRESHOLD} after ${MAX_RETRIES} retries`,
          error_agent: 'editor',
        })
      }
    }

    const response: AgentResponse<EditorOutput> = {
      success: true,
      agentRunId,
      agentName: 'editor',
      output,
      quality: { 
        score, 
        passed: approved, 
        issues: output.issues.map(i => i.description), 
        criticalCount: criticalIssues 
      },
      control: {
        nextPhase: approved ? 4 : (meta.attempt < MAX_RETRIES ? 2 : null),
        nextAgents: approved ? ['code-renderer'] : (meta.attempt < MAX_RETRIES ? ['content-pack'] : []),
        shouldRetry: !approved && meta.attempt < MAX_RETRIES,
        retryAgent: !approved ? 'content-pack' : null,
        retryReason: !approved ? `Score ${score} < ${QUALITY_THRESHOLD}` : null,
        isComplete: false,
        abort: !approved && meta.attempt >= MAX_RETRIES,
        abortReason: !approved && meta.attempt >= MAX_RETRIES ? 'Max retries reached' : null,
      },
      metrics: { durationMs, inputTokens, outputTokens, model, costUsd },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[EDITOR] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'EDITOR_ERROR',
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
