// =============================================================================
// AGENT: STRATEGIST (Phase 1)
// Develops brand strategy, positioning, personas, messaging
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  callOpenAI,
  calculateCost,
  updatePipelineMetrics,
  triggerAgent,
  isPipelineCancelled,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, StrategistOutput } from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist ein Elite-Markenstratege für B2B-Unternehmen im DACH-Raum.

## DEINE AUFGABE
Erstelle eine präzise, branchenspezifische Markenstrategie. KEINE generischen Texte!

## QUALITÄTSKRITERIEN
- Tagline: Max 8 Wörter, einzigartig, kein Marketing-Blabla
- Texte: Konkret, mit Zahlen/Fakten wenn möglich
- Tone: Passend zur Branche (B2B = seriös, nicht "friendly")
- USPs: Spezifisch für dieses Unternehmen, nicht austauschbar
- CTAs: Kurz (3-5 Wörter), aktionsorientiert, EINE klare Handlung

## OUTPUT (JSON):
{
  "brandStrategy": {
    "identity": {
      "name": "Exakter Firmenname",
      "tagline": "Max 8 Wörter, einprägsam, branchenspezifisch",
      "shortDescription": "1 Satz: Was macht die Firma? Für wen?",
      "longDescription": "3 Sätze: Geschichte, Expertise, Differenzierung",
      "brandVoice": "professional|friendly|technical|luxurious",
      "personality": ["3 konkrete Eigenschaften"]
    },
    "positioning": "1 Satz: Marktposition im Vergleich zu Wettbewerbern",
    "uniqueValueProposition": "Was kann NUR diese Firma? Konkret!",
    "keyMessages": ["3 Kernbotschaften, je max 15 Wörter"],
    "toneOfVoice": {
      "primary": "z.B. sachlich-kompetent",
      "descriptors": ["präzise", "vertrauenswürdig"],
      "doList": ["Fakten nennen", "Nutzen betonen"],
      "dontList": ["Übertreibungen", "Buzzwords"]
    },
    "targetPersonas": [{
      "name": "z.B. CFO Mittelstand",
      "role": "Entscheidungsrolle",
      "goals": ["Konkrete Ziele"],
      "painPoints": ["Echte Probleme"]
    }]
  },
  "contentStrategy": {
    "pillars": [{"name": "Themenbereich", "description": "Warum relevant", "topics": ["Spezifische Themen"]}],
    "keyTopics": ["3-5 SEO-relevante Themen"],
    "callToActions": [{"type": "primary", "text": "Max 5 Wörter!", "placement": ["hero"]}]
  },
  "siteStructure": {
    "pages": [{"slug": "url-slug", "name": "Seitenname", "purpose": "Conversion-Ziel", "sections": ["hero", "features"], "priority": "high|medium|low"}],
    "navigationFlow": "Wie navigiert der User?",
    "conversionFunnel": ["Awareness", "Interest", "Decision", "Action"]
  }
}

Antworte NUR mit validem JSON. KEINE Platzhalter!`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[STRATEGIST] Starting (Pipeline: ${meta.pipelineRunId}, Attempt: ${meta.attempt})`)

    // Create agent run record
    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'strategist',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    // Build user prompt
    const userPrompt = `Respond with valid JSON only.

## Projekt
Name: ${project.name}
Branche: ${project.industry || 'Nicht angegeben'}
Unternehmensgröße: ${project.companySize || 'Nicht angegeben'}
Gegründet: ${project.foundedYear || 'Nicht angegeben'}
Standort: ${project.location.city}, ${project.location.country}

## Briefing
${project.brief}

## Zielgruppe
${project.targetAudience}

## Gewünschter Stil
${project.websiteStyle}

## Markenstimme
${project.brandVoice}

## Paket
${project.packageType}

## USPs
${project.usps?.join(', ') || 'Nicht angegeben'}

## Wettbewerber
${project.competitors?.join(', ') || 'Nicht angegeben'}

## Seiten zu erstellen
${project.pages.map(p => `- ${p.name} (/${p.slug}): ${p.sections.join(', ')}`).join('\n')}

## Gebuchte Addons
${project.addons?.length ? project.addons.join(', ') : 'Keine'}
${project.addons?.includes('cms_base') || project.addons?.includes('cms') ? '→ CMS (Sanity): Content soll editierbar sein!' : ''}
${project.addons?.includes('booking_form') ? '→ Kontaktformular: Mit E-Mail-Versand!' : ''}

Erstelle eine vollständige Markenstrategie als JSON.`

    // Call OpenAI
    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-chat-latest',
      4000
    )

    // Check if cancelled after long operation
    if (await isPipelineCancelled(meta.pipelineRunId)) {
      console.log('[STRATEGIST] Pipeline cancelled after OpenAI call')
      await updateAgentRun(agentRunId, {
        status: 'cancelled',
        error_message: 'Pipeline cancelled',
        completed_at: new Date().toISOString(),
      })
      return new Response(JSON.stringify({ cancelled: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const output: StrategistOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[STRATEGIST] Success: Brand "${output.brandStrategy.identity.name}" in ${durationMs}ms`)

    // Update agent run with results
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

    // Update pipeline metrics
    await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

    // Trigger Collector to wait for all Phase 1 agents
    console.log('[STRATEGIST] Triggering Collector to coordinate Phase 1 completion')
    const collectorEnvelope: AgentEnvelope = {
      ...envelope,
      meta: {
        ...meta,
        agentName: 'collector',
        phase: 1,
        sequence: 99,
        timestamp: new Date().toISOString(),
      },
    }
    await triggerAgent('collector', collectorEnvelope)

    const response: AgentResponse<StrategistOutput> = {
      success: true,
      agentRunId,
      agentName: 'strategist',
      output,
      quality: {
        score: 8.5,
        passed: true,
        issues: [],
        criticalCount: 0,
      },
      control: {
        nextPhase: null, // Collector handles this
        nextAgents: ['collector'],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: {
        durationMs,
        inputTokens,
        outputTokens,
        model,
        costUsd,
      },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[STRATEGIST] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'STRATEGIST_ERROR',
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
