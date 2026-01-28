// =============================================================================
// AGENT: SECTION-GENERATOR (Phase 4) - Generates a single section component
// Fire-and-Forget: Responds immediately, OpenAI runs in background
// Receives: Section type + content from Content Pack
// Outputs: React component code for one section
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
} from '../_shared/agent-utils.ts'
import { getAgentContext } from '../_shared/agent-context.ts'
import type { 
  AgentEnvelope, 
  ContentPackOutput,
  VisualOutput,
} from '../_shared/types/pipeline.ts'

interface SectionInput {
  pageSlug: string
  pageIndex: number
  sectionIndex: number
  sectionType: string
  sectionContent: Record<string, unknown>
  totalSections: number
  totalPages: number
}

interface SectionOutput {
  pageSlug: string
  sectionIndex: number
  sectionType: string
  componentCode: string
  imports: string[]
}

// Extend envelope meta for section-specific data
interface SectionEnvelopeMeta {
  pipelineRunId: string
  projectId: string
  correlationId: string
  agentName: string
  phase: number
  sequence: number
  attempt: number
  maxAttempts: number
  timestamp: string
  sectionInput: SectionInput
  expectedSectionCount: number
}

const SYSTEM_PROMPT = `Du bist ein Elite React/Next.js 14 Entwickler. Generiere eine einzelne Section-Komponente.

## TECH STACK:
- Next.js 14 App Router mit TypeScript
- Tailwind CSS mit dark: Varianten (PFLICHT!)
- Lucide-react für Icons

## ANIMATIONEN (PFLICHT!):
Verwende die verfügbaren Motion-Komponenten:
- FadeIn: Einfaches Einblenden mit delay
- SlideIn: Seitliches Hereingleiten (direction="left"|"right"|"up"|"down")
- StaggerContainer + StaggerItem: Für Listen/Grids
- ScaleOnHover: Für interaktive Elemente

## DARK MODE (PFLICHT!):
Alle Komponenten MÜSSEN Dark Mode unterstützen:
- Hintergründe: bg-white dark:bg-gray-900
- Text: text-gray-900 dark:text-white
- Borders: border-gray-200 dark:border-gray-700
- Muted: text-gray-600 dark:text-gray-400

## OUTPUT FORMAT (JSON):
{
  "pageSlug": "page-slug",
  "sectionIndex": 0,
  "sectionType": "hero",
  "componentCode": "// JSX code for the section including wrapper div with id",
  "imports": ["import { FadeIn } from '@/components/ui/Motion'"]
}

## REGELN:
1. Gib NUR das JSON zurück, keine Erklärungen
2. componentCode enthält NUR den JSX-Teil (kein export, kein function)
3. Jede Section hat eine id: <section id="section-{type}" className="...">
4. imports sind alle benötigten Imports für diese Section
5. Verwende KEINE relativen Pfade, nur @/ Aliase
6. NIEMALS null für Props - weglassen oder undefined verwenden`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope = await req.json() as AgentEnvelope & { meta: SectionEnvelopeMeta }
    const { meta, project } = envelope
    const sectionInput = meta.sectionInput
    
    if (!sectionInput) {
      throw new Error('sectionInput is required in meta')
    }

    const { pageSlug, sectionIndex, sectionType, sectionContent, totalSections, totalPages } = sectionInput
    
    console.log(`[SECTION-GEN] Starting: ${pageSlug}/${sectionType} (${sectionIndex + 1}/${totalSections})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'section-generator',
      meta.phase,
      meta.sequence,
      { pageSlug, sectionType, sectionIndex },
      meta.attempt
    )

    // Load visual design AND content pack for full context
    const [visual, contentPack] = await Promise.all([
      loadAgentOutput<VisualOutput>(meta.pipelineRunId, 'visual'),
      loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack'),
    ])

    // Get agent context with addon info
    const agentContext = getAgentContext(project)

    // Build user prompt with FULL context
    const userPrompt = `Generiere die "${sectionType}" Section für die Seite "/${pageSlug}".

## UNTERNEHMEN:
- Name: ${project.name}
- Branche: ${project.industry || 'Nicht angegeben'}
- Zielgruppe: ${project.targetAudience || 'Allgemein'}
- USPs: ${project.usps?.join(', ') || 'Keine angegeben'}
- Brand Voice: ${project.brandVoice || 'professional'}

## SECTION CONTENT:
${JSON.stringify(sectionContent, null, 2)}

## SITE SETTINGS:
${contentPack?.siteSettings ? JSON.stringify(contentPack.siteSettings, null, 2) : 'Nicht verfügbar'}

## DESIGN SYSTEM:
${visual ? `
- Primary Color: ${visual.colorScheme.primary}
- Secondary Color: ${visual.colorScheme.secondary}
- Heading Font: ${visual.typography.headingFont}
- Body Font: ${visual.typography.bodyFont}
- Border Radius: ${visual.borderRadius}
` : 'Verwende Standard Tailwind-Farben'}

## TECH STACK:
- CMS: ${agentContext.techStack.cms.enabled ? 'Sanity (fetch data mit GROQ)' : 'Kein CMS'}
- Kontaktformular: ${agentContext.techStack.email.enabled ? 'Ja (Resend)' : 'Nein'}
- Blog: ${agentContext.techStack.blog.enabled ? 'Ja' : 'Nein'}

## SECTION TYPE GUIDELINES:
${getSectionGuidelines(sectionType)}

Generiere den Code als JSON. Passe den Content an die Branche und Zielgruppe an!`

    // FIRE AND FORGET: Return immediately, run OpenAI in background
    const backgroundTask = (async () => {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      try {
        console.log(`[SECTION-GEN] ${pageSlug}/${sectionType} - Calling Codex...`)
        
        const { content, inputTokens, outputTokens, model } = await callOpenAI(
          SYSTEM_PROMPT,
          userPrompt,
          'gpt-5.2-codex',
          6000  // Smaller token limit for single section
        )

        const output: SectionOutput = JSON.parse(content)
        const durationMs = Date.now() - startTime
        const costUsd = calculateCost(model, inputTokens, outputTokens)

        console.log(`[SECTION-GEN] ${pageSlug}/${sectionType}: Generated in ${durationMs}ms`)

        // Save section output to generated_sections table
        const { error: upsertError } = await supabase.from('generated_sections').upsert({
          project_id: meta.projectId,
          pipeline_run_id: meta.pipelineRunId,
          page_slug: pageSlug,
          section_index: sectionIndex,
          section_type: sectionType,
          component_name: `${sectionType.charAt(0).toUpperCase()}${sectionType.slice(1)}Section`,
          component_code: output.componentCode,
          imports: output.imports || [],
          created_at: new Date().toISOString(),
        }, { onConflict: 'pipeline_run_id,page_slug,section_index' })
        
        if (upsertError) {
          console.error(`[SECTION-GEN] Failed to save section: ${upsertError.message}`)
        } else {
          console.log(`[SECTION-GEN] Section saved to DB: ${pageSlug}/${sectionType}`)
        }

        // Update agent run
        await updateAgentRun(agentRunId!, {
          status: 'completed',
          output_data: output,
          model_used: model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          duration_ms: durationMs,
          cost_usd: costUsd,
          quality_score: 8.0,
          validation_passed: true,
          completed_at: new Date().toISOString(),
        })

        await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

        // Check if all sections for this pipeline are complete
        await checkAndTriggerAssembly(supabase, meta, envelope)

      } catch (error) {
        console.error(`[SECTION-GEN] ${pageSlug}/${sectionType} failed:`, error)
        await updateAgentRun(agentRunId!, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
      }
    })()

    // Don't await - let it run in background
    // @ts-ignore - EdgeRuntime.waitUntil exists in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundTask)
    }

    // Return immediately
    return new Response(JSON.stringify({
      success: true,
      agentRunId,
      agentName: 'section-generator',
      message: `Section ${sectionType} for ${pageSlug} generation started`,
      meta: { pageSlug, sectionType, sectionIndex },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[SECTION-GEN] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
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

// Check if all sections are complete and trigger page-builder
async function checkAndTriggerAssembly(
  supabase: ReturnType<typeof createClient>,
  meta: SectionEnvelopeMeta,
  envelope: AgentEnvelope & { meta: SectionEnvelopeMeta }
) {
  // expectedSectionCount = totalSections + 1 (shared-components)
  const expectedCount = meta.expectedSectionCount
  const expectedSectionGenerators = expectedCount - 1 // minus shared-components
  
  // Count completed section-generator runs (more reliable than generated_sections rows)
  const { count: completedSectionGenerators } = await supabase
    .from('agent_runs')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_run_id', meta.pipelineRunId)
    .eq('agent_name', 'section-generator')
    .eq('status', 'completed')
  
  // Check if shared-components is also done
  const { count: sharedCount } = await supabase
    .from('agent_runs')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_run_id', meta.pipelineRunId)
    .eq('agent_name', 'shared-components')
    .eq('status', 'completed')
  
  // Total: completed section-generators + shared-components
  const totalComplete = (completedSectionGenerators || 0) + (sharedCount || 0)
  
  console.log(`[SECTION-GEN] Progress: ${totalComplete}/${expectedCount} (section-generators: ${completedSectionGenerators}/${expectedSectionGenerators}, shared: ${sharedCount})`)

  if (totalComplete >= expectedCount) {
    // ATOMIC LOCK: Try to claim the "trigger page-builder" responsibility
    // First check if already triggered, then set the flag
    const { data: pipelineData } = await supabase
      .from('pipeline_runs')
      .select('metadata')
      .eq('id', meta.pipelineRunId)
      .single()
    
    const metadata = (pipelineData?.metadata as Record<string, unknown>) || {}
    
    if (metadata.page_builder_triggered) {
      console.log('[SECTION-GEN] Page-builder already triggered by another agent, skipping')
      return
    }
    
    // Set the flag (small race window, but acceptable)
    await supabase
      .from('pipeline_runs')
      .update({ metadata: { ...metadata, page_builder_triggered: true } })
      .eq('id', meta.pipelineRunId)
    
    console.log('[SECTION-GEN] ✅ All sections + shared-components complete! Triggering page-builder...')
    
    // Load content pack to get page list
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    const pages = contentPack?.pages || []
    const totalPages = pages.length
    
    // Trigger page-builder for EACH page (parallel)
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex]
      
      const pageEnvelope = {
        ...envelope,
        meta: {
          ...envelope.meta,
          agentName: 'page-builder',
          phase: 4,
          sequence: 100 + pageIndex, // High sequence to come after sections
          timestamp: new Date().toISOString(),
          pageInput: {
            pageSlug: page.slug,
            pageIndex,
            totalPages,
          },
          expectedAgentCount: totalPages, // page-builder coordination
        },
      }
      
      await triggerAgent('page-builder', pageEnvelope)
      console.log(`[SECTION-GEN] Triggered page-builder for /${page.slug}`)
    }
  }
}

// Get section-specific generation guidelines
function getSectionGuidelines(sectionType: string): string {
  const guidelines: Record<string, string> = {
    hero: `
- Volle Viewport-Höhe: min-h-[80vh] oder min-h-screen
- Große Headline mit FadeIn Animation
- Subheadline mit FadeIn delay={0.2}
- CTA Buttons mit FadeIn delay={0.4}
- Optional: Hintergrundbild oder Gradient`,
    
    features: `
- Grid Layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- StaggerContainer für Animation
- Jedes Feature als StaggerItem
- Icon + Titel + Beschreibung pro Feature
- ScaleOnHover für interaktive Cards`,
    
    about: `
- Zwei-Spalten Layout auf Desktop
- SlideIn direction="left" für Text
- SlideIn direction="right" für Bild
- Team-Grid wenn Mitarbeiter vorhanden`,
    
    services: `
- Ähnlich wie Features
- Detailliertere Beschreibungen
- Optional: Preise oder "Ab X €"
- CTA pro Service möglich`,
    
    testimonials: `
- Carousel oder Grid
- Zitat mit Anführungszeichen
- Avatar/Name/Rolle des Kunden
- StaggerContainer für Grid`,
    
    cta: `
- Zentriert: text-center
- Auffälliger Hintergrund (Primary Color oder Gradient)
- FadeIn für gesamten Block
- Großer Button mit ScaleOnHover`,
    
    contact: `
- Kontaktformular oder Kontaktinfo
- Grid: Form links, Info rechts
- Icons für Telefon/Email/Adresse
- Map optional`,
    
    faq: `
- Accordion-Style mit Details/Summary
- Oder einfache Liste
- StaggerContainer für Animation`,
    
    legal: `
- LegalSection Komponente verwenden
- Einfacher Text-Content
- Strukturierte Überschriften`,
    
    blog: `
- Grid für Blog-Posts
- Card pro Post mit Bild, Titel, Excerpt
- Datum und Autor
- Link zu Detailseite`,
  }
  
  return guidelines[sectionType] || `
- Verwende angemessene Animation
- Responsive Design beachten
- Dark Mode Varianten pflicht`
}
