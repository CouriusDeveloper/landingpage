// =============================================================================
// AGENT: CONTENT-PACK (Phase 2)
// Merges all Phase 1 outputs into a complete Content Pack
// v3: Fast model (gpt-4o-mini) + minimal prompt for <30s response
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  callOpenAI,
  calculateCost,
  updatePipelineMetrics,
  loadMultipleAgentOutputs,
  loadAgentOutput,
  triggerAgent,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import type { 
  AgentEnvelope, 
  AgentResponse, 
  ContentPackOutput,
  StrategistOutput,
  SeoOutput,
  LegalOutput,
  VisualOutput,
  ImageOutput,
  EditorOutput,
} from '../_shared/types/pipeline.ts'

// =============================================================================
// ADDON-SPECIFIC CONTENT INSTRUCTIONS
// =============================================================================
function buildAddonInstructions(addons: string[]): string {
  const instructions: string[] = []
  
  if (addons.length === 0) {
    return 'Keine Addons gebucht - nur Standard-Inhalte erstellen.'
  }
  
  if (addons.includes('cookie_consent') || addons.includes('google_pixel') || addons.includes('meta_pixel')) {
    instructions.push(`### Cookie Consent Banner
Erstelle im siteSettings einen "cookieConsent" Block:
{
  "cookieConsent": {
    "headline": "Wir respektieren Ihre Privatsphäre",
    "text": "Diese Website verwendet Cookies für Analyse und verbesserte Nutzererfahrung.",
    "acceptAll": "Alle akzeptieren",
    "rejectAll": "Nur notwendige",
    "customize": "Einstellungen",
    "privacyLink": "/datenschutz"
  }
}`)
  }
  
  if (addons.includes('google_pixel')) {
    instructions.push(`### Google Analytics
Im cookieConsent.categories Array hinzufügen:
{ "id": "analytics", "name": "Analyse", "description": "Hilft uns die Nutzung zu verstehen (Google Analytics)" }`)
  }
  
  if (addons.includes('meta_pixel')) {
    instructions.push(`### Meta Pixel
Im cookieConsent.categories Array hinzufügen:
{ "id": "marketing", "name": "Marketing", "description": "Personalisierte Werbung (Meta/Facebook)" }`)
  }
  
  if (addons.includes('booking_form')) {
    instructions.push(`### Kontaktformular
Auf der Kontakt-Seite eine "contact" Section mit:
- headline: Kurze Überschrift
- text: 1 Satz warum Kontakt aufnehmen
- form: { fields: ["name", "email", "message"], submitText: "Nachricht senden", successMessage: "Danke! Wir melden uns." }`)
  }
  
  if (addons.includes('blog_addon')) {
    instructions.push(`### Blog
Erstelle eine Blog-Seite mit:
- headline: "Blog" oder branchenspezifisch
- text: 1 Satz was Leser erwarten können
- Hinweis: Artikel werden später im CMS gepflegt`)
  }
  
  if (addons.includes('seo_package')) {
    instructions.push(`### SEO-Paket
- Jede Seite MUSS unique metaDescription haben (140-155 Zeichen)
- structuredData im siteSettings für Schema.org:
{ "structuredData": { "type": "LocalBusiness", "name": "...", "description": "..." } }`)
  }
  
  return instructions.join('\n\n')
}

const SYSTEM_PROMPT = `Du erstellst das finale Website Content Pack durch Zusammenführung aller Agent-Outputs.

## KRITISCHE QUALITÄTSREGELN

### Texte
- Headlines: Max 8 Wörter, branchenspezifisch, KEINE Marketing-Floskeln
- Body: 1-2 präzise Sätze, konkret, mit Fakten wenn möglich
- KEINE Wiederholungen! Jede Seite hat eigenen Fokus
- KEINE generischen Phrasen wie "Willkommen", "Wir bieten...", "Qualität ist unser..."

### CTAs
- Max 5 Wörter, aktionsorientiert
- EINE klare Handlung: "Angebot anfordern" nicht "Kontaktieren Sie uns für ein unverbindliches Angebot"
- Primary CTA auf jeder Seite identisch

### SEO
- metaDescription: UNIQUE pro Seite, 140-155 Zeichen, Keyword + CTA
- Title: Keyword vorne, Markenname hinten

### Legal/Impressum
- Nutze EXAKT die bereitgestellten Daten aus ## LEGAL/IMPRESSUM
- Bei "[nicht angegeben]": Feld weglassen oder "[BITTE ERGÄNZEN]"
- NIEMALS erfinden: Keine "Musterstraße", "DE123456789", "Max Mustermann"

## OUTPUT (JSON):
{
  "siteSettings": {
    "name": "Firmenname",
    "tagline": "Aus Strategist übernehmen",
    "colors": {"primary": "#hex", "secondary": "#hex", "accent": "#hex"},
    "fonts": {"heading": "Font", "body": "Font"},
    "contact": {"email": "...", "phone": "+49 XXX XXXXXXX", "address": "..."}
  },
  "pages": [{
    "slug": "url-slug",
    "title": "SEO Title (50-60 Z.)",
    "metaDescription": "Unique, 140-155 Z., mit Keyword + CTA",
    "sections": [
      {"type": "hero|features|cta|about|contact|legal", "content": {"headline": "...", "text": "..."}}
    ]
  }],
  "navigation": {"main": [{"label": "Kurz", "href": "/slug"}]},
  "footer": {"copyright": "© 2026 Firmenname", "links": []}
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
    
    console.log(`[CONTENT-PACK] Starting (Pipeline: ${meta.pipelineRunId}, Attempt: ${meta.attempt})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'content-pack',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    // Load all Phase 1 agent outputs
    console.log('[CONTENT-PACK] Loading Phase 1 agent outputs...')
    const previousOutputs = await loadMultipleAgentOutputs(
      meta.pipelineRunId,
      ['strategist', 'seo', 'legal', 'visual', 'image']
    )

    // Bei Retry: Lade Editor-Feedback UND vorherigen Content Pack
    let editorFeedback: EditorOutput | null = null
    let previousContentPack: ContentPackOutput | null = null
    if (meta.attempt > 1) {
      console.log(`[CONTENT-PACK] Attempt ${meta.attempt} - Loading Editor feedback & previous output...`)
      editorFeedback = await loadAgentOutput<EditorOutput>(meta.pipelineRunId, 'editor')
      previousContentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
      if (editorFeedback) {
        console.log(`[CONTENT-PACK] Editor feedback loaded: Score ${editorFeedback.qualityScore?.overall}, ${editorFeedback.issues?.length || 0} issues`)
      }
      if (previousContentPack) {
        console.log(`[CONTENT-PACK] Previous output loaded: ${previousContentPack.pages?.length || 0} pages`)
      }
    }

    const strategistOutput = previousOutputs.strategist as StrategistOutput | undefined
    const seoOutput = previousOutputs.seo as SeoOutput | undefined
    const legalOutput = previousOutputs.legal as LegalOutput | undefined
    const visualOutput = previousOutputs.visual as VisualOutput | undefined
    const imageOutput = previousOutputs.image as ImageOutput | undefined

    if (!strategistOutput) {
      throw new Error('Strategist output not found - cannot proceed')
    }

    console.log('[CONTENT-PACK] Loaded outputs:', {
      strategist: !!strategistOutput,
      seo: !!seoOutput,
      legal: !!legalOutput,
      visual: !!visualOutput,
      image: !!imageOutput,
    })

    // Kompakte User Prompt - alle Agent-Outputs nutzen
    const colors = visualOutput?.colorScheme || { primary: project.primaryColor, secondary: project.secondaryColor }
    const fonts = visualOutput?.typography || { headingFont: 'Inter', bodyFont: 'Inter' }
    const messaging = strategistOutput.messaging || {}
    const keywords = seoOutput?.keywordStrategy?.primaryKeywords?.slice(0, 5) || []
    const metaTitle = seoOutput?.metaTags?.title || ''
    const metaDesc = seoOutput?.metaTags?.description || ''
    const impressum = legalOutput?.impressum || null
    const datenschutz = legalOutput?.datenschutz || null
    const images = imageOutput?.images?.slice(0, 5) || []
    
    // Seitenzahl basierend auf Paket: basic=4, professional=8, enterprise=11
    const PAGE_LIMITS: Record<string, number> = {
      basic: 4,        // 3 Seiten + Landing Page
      professional: 8, // 7 Seiten + Landing Page
      enterprise: 11,  // 10 Seiten + Landing Page
    }
    const maxPages = PAGE_LIMITS[project.packageType] || 4
    const pagesToGenerate = project.pages.slice(0, maxPages)
    
    console.log(`[CONTENT-PACK] Package: ${project.packageType}, generating ${pagesToGenerate.length}/${project.pages.length} pages`)
    
    const userPrompt = `Respond with valid JSON only.

## FIRMA
Name: ${project.name}
Tagline: ${messaging.tagline || strategistOutput.brandStrategy?.positioning || ''}
Branche: ${project.industry || ''}

## DESIGN
Farben: ${JSON.stringify(colors)}
Fonts: heading=${fonts.headingFont || 'Inter'}, body=${fonts.bodyFont || 'Inter'}

## SEO
Keywords: ${keywords.join(', ')}
Meta Title: ${metaTitle}
Meta Description: ${metaDesc}

## KONTAKT
Email: ${project.contact?.email || ''}
Telefon: ${project.contact?.phone || ''} (Format: +49 XXX XXXXXXX)
Adresse: ${project.contact?.address || ''}

## BILDER (verwende diese URLs)
${images.map((img: any) => `- ${img.usage || 'hero'}: ${img.url}`).join('\n') || 'Keine Bilder verfügbar'}

## LEGAL/IMPRESSUM (NUR diese Daten verwenden - KEINE Platzhalter erfinden!)
${project.legal?.status === 'complete' ? `
Firmenname: ${project.legal.companyName}
Rechtsform: ${project.legal.form}
Vertreten durch: ${project.legal.representative}
USt-IdNr: ${project.legal.vatId || '[nicht angegeben]'}
Registergericht: ${project.legal.registryCourt || '[nicht angegeben]'}
Registernummer: ${project.legal.registryNumber || '[nicht angegeben]'}
Verantwortlich (§18 MStV): ${project.legal.responsiblePerson || '[nicht angegeben]'}
Datenschutzbeauftragter: ${project.legal.dataProtectionOfficer || '[nicht benannt]'}
` : `⚠️ LEGAL-DATEN FEHLEN! User hat Impressum-Formular nicht ausgefüllt.
Für Impressum/Datenschutz: Schreibe "[BITTE IM DASHBOARD ERGÄNZEN]" statt Platzhalter!`}

${legalOutput ? `## LEGAL AGENT OUTPUT (Texte für Impressum/Datenschutz)
${JSON.stringify(legalOutput, null, 2).slice(0, 2000)}` : ''}

## SEITEN (nur diese erstellen)
${pagesToGenerate.map(p => `- ${p.slug}: ${p.sections.slice(0, 3).join(', ')}`).join('\n')}

## GEBUCHTE ADDONS
${buildAddonInstructions(project.addons || [])}

${previousContentPack && editorFeedback ? `## 🔄 VORHERIGER OUTPUT (ZU VERBESSERN!)
${JSON.stringify(previousContentPack, null, 2)}

## ⚠️ EDITOR FEEDBACK - MUSS BEHOBEN WERDEN!
Letzter Score: ${editorFeedback.qualityScore?.overall}/10 - Ziel: mindestens 7.0

### Probleme und Lösungen:
${editorFeedback.issues?.map(i => `${i.severity === 'critical' ? '❌' : '⚠️'} [${i.category}] ${i.description}
   Stelle: ${i.location || 'allgemein'}
   Fix: ${i.suggestion}`).join('\n\n') || 'Keine Issues'}

### Konkrete Änderungen (EXAKT umsetzen!):
${editorFeedback.improvements?.specificFixes?.map(f => `• ${f.path}
  ALT: "${f.currentValue}"
  NEU: "${f.suggestedValue}"
  Grund: ${f.reason}`).join('\n\n') || 'Keine spezifischen Fixes'}

WICHTIG: Behebe ALLE oben genannten Probleme im neuen Content Pack!` : ''}

Erstelle Content Pack als JSON. Max 3 Sections pro Seite, kurze Texte.`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-pro-2025-12-11',
      8000
    )

    // Try to parse JSON, with fallback repair
    let output: ContentPackOutput
    try {
      output = JSON.parse(content)
    } catch (parseError) {
      console.error('[CONTENT-PACK] JSON parse failed, attempting repair...')
      // Try to repair truncated JSON
      let repairedContent = content
      // Count open braces and brackets
      const openBraces = (content.match(/{/g) || []).length
      const closeBraces = (content.match(/}/g) || []).length
      const openBrackets = (content.match(/\[/g) || []).length
      const closeBrackets = (content.match(/]/g) || []).length
      
      // Add missing closing characters
      repairedContent += ']'.repeat(Math.max(0, openBrackets - closeBrackets))
      repairedContent += '}'.repeat(Math.max(0, openBraces - closeBraces))
      
      try {
        output = JSON.parse(repairedContent)
        console.log('[CONTENT-PACK] JSON repair successful')
      } catch {
        throw new Error(`JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown'}`)
      }
    }
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[CONTENT-PACK] Success: ${output.pages.length} pages in ${durationMs}ms`)

    // Save to project_content_packs table
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    const contentPackHash = `${meta.pipelineRunId}-${Date.now()}`
    const { data: contentPackRecord } = await supabase
      .from('project_content_packs')
      .upsert({
        project_id: meta.projectId,
        version: '1.0.0',
        hash: contentPackHash,
        content: output,
        quality_score: null, // Editor will set this
        iterations: meta.attempt,
        input_fingerprint: { pipelineRunId: meta.pipelineRunId },
        status: 'draft',
      }, { onConflict: 'project_id' })
      .select('id')
      .single()

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      cost_usd: costUsd,
      quality_score: null, // Editor will assess
      validation_passed: true,
      completed_at: new Date().toISOString(),
    })

    await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

    // Trigger Phase 3 (Editor)
    console.log('[CONTENT-PACK] Triggering Phase 3 (Editor)...')
    await updatePipelineStatus(meta.pipelineRunId, 'phase_3')
    
    const editorEnvelope: AgentEnvelope = {
      ...envelope,
      meta: {
        ...meta,
        agentName: 'editor',
        phase: 3,
        sequence: 1,
        timestamp: new Date().toISOString(),
      },
    }
    await triggerAgent('editor', editorEnvelope)

    const response: AgentResponse<ContentPackOutput> = {
      success: true,
      agentRunId,
      agentName: 'content-pack',
      output,
      quality: { score: 0, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: 3,
        nextAgents: ['editor'],
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
    console.error('[CONTENT-PACK] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'CONTENT_PACK_ERROR',
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
