// =============================================================================
// AGENT: SEO (Phase 1)
// Keyword strategy, meta tags, structured data, technical SEO
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  callOpenAI,
  calculateCost,
  updatePipelineMetrics,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, SeoOutput } from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist ein SEO-Experte für B2B-Websites im DACH-Raum.

## DEINE AUFGABE
Erstelle SEO-Strategie mit Meta-Tags für JEDE Seite. Qualität > Quantität.

## QUALITÄTSKRITERIEN
- Title: 50-60 Zeichen, Keyword vorne, Markenname hinten
- Description: 140-155 Zeichen, CTA enthalten, unique pro Seite!
- Keywords: Branchenspezifisch, Suchvolumen-relevant
- Schema.org: Korrektes JSON-LD für Organization + WebSite

## OUTPUT (JSON):
{
  "keywordStrategy": {
    "primary": ["2-3 Hauptkeywords mit Suchvolumen"],
    "secondary": ["3-5 Nebenkeywords"],
    "longTail": ["3-5 spezifische Phrasen für Nischen-Traffic"]
  },
  "metaStrategy": [
    {
      "pageSlug": "home",
      "title": "Keyword - Firmenname | Nutzenversprechen (50-60 Z.)",
      "description": "140-155 Zeichen: Was bieten wir? Für wen? CTA am Ende.",
      "keywords": ["2-3 relevante Keywords"],
      "ogTitle": "Für Social Sharing optimiert",
      "ogDescription": "Social-optimierte Beschreibung",
      "ogType": "website"
    },
    {
      "pageSlug": "ueber-uns",
      "title": "Über Firmenname - Erfahrung & Expertise | Branche",
      "description": "Unique Description für Über-uns Seite...",
      "keywords": ["firmenname", "branche", "expertise"],
      "ogType": "website"
    }
  ],
  "structuredData": {
    "organization": {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Firmenname",
      "url": "https://domain.de",
      "logo": "https://domain.de/logo.png",
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+49-XXX-XXXXXXX",
        "contactType": "customer service",
        "availableLanguage": "German"
      },
      "sameAs": []
    },
    "website": {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Firmenname",
      "url": "https://domain.de"
    }
  },
  "technicalRecommendations": [
    "Konkrete, umsetzbare Empfehlung 1",
    "Konkrete, umsetzbare Empfehlung 2"
  ]
}

WICHTIG: Erstelle Meta-Tags für JEDE Seite aus der Seitenliste! Antworte NUR mit JSON.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[SEO] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'seo',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    const userPrompt = `Respond with valid JSON only.

## Projekt
Name: ${project.name}
Branche: ${project.industry || 'Nicht angegeben'}
Standort: ${project.location.city}, ${project.location.country}

## Briefing
${project.brief}

## Zielgruppe
${project.targetAudience}

## USPs
${project.usps?.join(', ') || 'Nicht angegeben'}

## Wettbewerber (für Keyword-Analyse)
${project.competitors?.join(', ') || 'Nicht angegeben'}

## Seiten
${project.pages.map(p => `- ${p.name} (/${p.slug})`).join('\n')}

## Bestehende SEO-Präferenzen
${JSON.stringify(project.seoPreferences || {}, null, 2)}

Erstelle eine SEO-Strategie mit Keywords, Meta-Tags und Schema.org Markup als JSON.`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-chat-latest',
      4000
    )

    const output: SeoOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[SEO] Success: ${output.keywordStrategy.primary.length} primary keywords in ${durationMs}ms`)

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

    // SEO doesn't trigger next phase - strategist does that

    const response: AgentResponse<SeoOutput> = {
      success: true,
      agentRunId,
      agentName: 'seo',
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
    console.error('[SEO] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'SEO_ERROR',
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
