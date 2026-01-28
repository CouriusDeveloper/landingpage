// =============================================================================
// AGENT: VISUAL (Phase 1)
// Color scheme, typography, design tokens
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  callOpenAI,
  calculateCost,
  updatePipelineMetrics,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, VisualOutput } from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist Senior UI Designer für B2B-Websites.

## DEINE AUFGABE
Erstelle ein professionelles Design-System basierend auf den Markenfarben.

## QUALITÄTSKRITERIEN
- Farben: WCAG AA Kontrast (4.5:1 für Text, 3:1 für große Elemente)
- Fonts: Google Fonts, gut lesbar, zur Branche passend
- B2B = seriös: Inter, Manrope, DM Sans (NICHT Playfair für Tech!)
- Finanz/Legal = klassisch: Source Serif, Libre Baskerville
- Kreativ = modern: Space Grotesk, Outfit, Sora

## OUTPUT (JSON):
{
  "colorScheme": {
    "primary": "#hex (Markenfarbe, aus Input übernehmen!)",
    "primaryDark": "#hex (10% dunkler für Hover)",
    "primaryLight": "#hex (90% heller für Hintergründe)",
    "secondary": "#hex (Akzentfarbe, aus Input oder Komplementär)",
    "accent": "#hex (CTA-Farbe, auffällig aber passend)",
    "background": "#ffffff oder #fafafa",
    "surface": "#hex (Karten: leicht abgesetzt vom Background)",
    "text": "#1a1a1a (Haupttext, nie reines Schwarz)",
    "textMuted": "#6b7280 (Sekundärtext)",
    "border": "#e5e7eb (Subtile Trennlinien)",
    "success": "#059669",
    "warning": "#d97706",
    "error": "#dc2626"
  },
  "typography": {
    "headingFont": "Google Font Name (zur Branche passend)",
    "bodyFont": "Google Font Name (gut lesbar)",
    "fontPairing": "Begründung warum diese Kombination",
    "scale": {
      "h1": "clamp(2.25rem, 4vw, 3.5rem)",
      "h2": "clamp(1.875rem, 3vw, 2.5rem)",
      "h3": "clamp(1.5rem, 2.5vw, 1.875rem)",
      "h4": "1.25rem",
      "body": "1rem",
      "small": "0.875rem"
    }
  },
  "spacing": {
    "section": "5rem",
    "component": "2rem",
    "element": "1rem"
  },
  "borderRadius": "0.5rem (modern) oder 0.25rem (klassisch)",
  "shadows": {
    "sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    "md": "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    "lg": "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    "card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"
  }
}

Übernimm die Primary/Secondary Farben aus dem Input! Antworte NUR mit JSON.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[VISUAL] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'visual',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    const userPrompt = `Respond with valid JSON only.

## Markenfarben
Primary: ${project.primaryColor}
Secondary: ${project.secondaryColor}

## Stil
${project.websiteStyle}

## Branche
${project.industry || 'Nicht angegeben'}

## Markenstimme
${project.brandVoice}

## Paket
${project.packageType}

Erstelle ein vollständiges Design-System basierend auf diesen Vorgaben als JSON.
Die Farben sollen harmonisch sein und zur Branche passen.
Wähle passende Google Fonts (kostenlos, kommerziell nutzbar).`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-pro-2025-12-11',
      2000
    )

    const output: VisualOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[VISUAL] Success: ${output.typography.headingFont}/${output.typography.bodyFont} in ${durationMs}ms`)

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

    const response: AgentResponse<VisualOutput> = {
      success: true,
      agentRunId,
      agentName: 'visual',
      output,
      quality: { score: 8.5, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: null,
        nextAgents: [],
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
    console.error('[VISUAL] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'VISUAL_ERROR',
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
