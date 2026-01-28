// =============================================================================
// AGENT: PAGE-BUILDER (Phase 4) - Baut eine einzelne Seite
// Fire-and-Forget: Antwortet sofort, OpenAI läuft im Hintergrund
// UNTERSTÜTZT: CMS (Sanity), Booking Form (Resend), Analytics, Blog, Dark Mode
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
  LegalOutput,
} from '../_shared/types/pipeline.ts'

interface PageBuilderInput {
  pageSlug: string
  pageIndex: number
  totalPages: number
}

interface PageBuilderOutput {
  pageSlug: string
  files: Array<{
    path: string
    content: string
  }>
}

// Build system prompt using agent context
function getSystemPrompt(agentContext: ReturnType<typeof getAgentContext>): string {
  const { techStack } = agentContext
  
  let prompt = `Du bist ein Elite Next.js 14 Entwickler. Generiere eine komplette Page mit Dark Mode Support.

${agentContext.systemPromptAddition}

## TECH STACK:
- Next.js 14 App Router mit TypeScript
- Tailwind CSS für Styling (mit dark: Varianten!)
- Lucide-react für Icons

## VERFÜGBARE IMPORTS (NUR IMPORTIEREN WAS DU AUCH VERWENDEST!):
// Layout - immer benötigt:
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

// Sections - nur importieren was auf der Seite verwendet wird:
import { HeroSection, FeaturesSection, CtaSection, AboutSection, ContactSection, LegalSection } from '@/components/sections/landing'

// Animationen - nur importieren was verwendet wird:
import { FadeIn, SlideIn, StaggerContainer, StaggerItem, ScaleOnHover } from '@/components/ui/Motion'

⚠️ WICHTIG: Importiere NUR Komponenten die du auch verwendest! Ungenutzte Imports verursachen Build-Fehler!

## ANIMATIONEN (PFLICHT FÜR PREMIUM-QUALITÄT!):
Verwende Motion-Komponenten für alle Sektionen:
- Hero: <FadeIn> für Headline, <FadeIn delay={0.2}> für Subline, <FadeIn delay={0.4}> für Buttons
- Features/Services: <StaggerContainer><StaggerItem> pro Card</StaggerItem></StaggerContainer>
- About: <SlideIn direction="left"> für Text, <SlideIn direction="right"> für Bild
- CTA: <FadeIn className="text-center"> für den gesamten Block
- Cards: <ScaleOnHover> für clickable Cards

## VERFÜGBARE SECTIONS:
- HeroSection: props={{ headline, subheadline, ctaText, ctaHref, image }}
- FeaturesSection: props={{ title, features: [{ icon, title, description }] }}
- CtaSection: props={{ title, description, ctaText, ctaHref }}
- AboutSection: props={{ title, description, team?: [] }}
- ContactSection: props={{ title, description, email, phone, address }}
- LegalSection: props={{ title, content }} - Für Impressum/Datenschutz

⚠️ WICHTIG: Verwende NIEMALS null für Props! Wenn ein Wert nicht vorhanden ist, lasse die Property weg oder verwende undefined.`

  if (techStack.cms.enabled) {
    prompt += `

## SANITY CMS:
- Importiere: import { client } from '@/lib/sanity'
- Fetch mit GROQ in async Server Component
- Props aus Sanity-Daten befüllen`
  }
  
  if (techStack.email.enabled) {
    prompt += `

## KONTAKTFORMULAR:
- Importiere ContactForm aus '@/components/sections/contact/ContactForm'
- Server Action für Email ist bereits in '@/lib/actions/contact'`
  }

  if (techStack.blog.enabled) {
    prompt += `

## BLOG:
- Blog-Seiten fetchen Posts aus Sanity
- Import BlogSection aus '@/components/sections/blog/BlogSection'`
  }

  prompt += `

## 🌗 DARK MODE (PFLICHT!):
Alle Seiten MÜSSEN Dark Mode unterstützen!
- Nutze Tailwind dark: Varianten überall
- Beispiel: className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
- ThemeProvider ist bereits in layout.tsx eingebunden

## OUTPUT FORMAT (JSON):
{
  "pageSlug": "slug",
  "files": [
    {"path": "src/app/slug/page.tsx", "content": "...kompletter code..."}
  ]
}

WICHTIG: Nutze NUR die oben genannten Imports! Keine anderen Pfade!
Antworte NUR mit validem JSON.`

  return prompt
}

// Declare EdgeRuntime for Supabase
declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    const pageInput = meta.pageInput as PageBuilderInput
    const { pageSlug, pageIndex, totalPages } = pageInput
    
    console.log(`[PAGE-BUILDER] Starting /${pageSlug} (${pageIndex + 1}/${totalPages})`)

    // Create agent run record
    const agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'page-builder',
      meta.phase,
      meta.sequence + pageIndex,
      { pageSlug, pageIndex },
      meta.attempt
    )

    // Load required data (fast DB queries)
    const [contentPack, visual, legal] = await Promise.all([
      loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack'),
      loadAgentOutput<VisualOutput>(meta.pipelineRunId, 'visual'),
      loadAgentOutput<LegalOutput>(meta.pipelineRunId, 'legal'),
    ])

    if (!contentPack) {
      throw new Error('Content Pack not found')
    }

    const pageContent = contentPack.pages?.find(p => p.slug === pageSlug)
    if (!pageContent) {
      throw new Error(`Page "${pageSlug}" not found in Content Pack`)
    }

    const colors = visual?.colorScheme || {
      primary: project.primaryColor,
      secondary: project.secondaryColor,
    }

    // Get agent context with all addon info
    const agentContext = getAgentContext(project)
    
    console.log(`[PAGE-BUILDER] /${pageSlug} - Addons: ${Object.entries(agentContext.addons).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}`)

    // Build prompt with addon context AND full project info
    const userPrompt = `Respond with valid JSON only.

## UNTERNEHMEN:
- Name: ${project.name}
- Branche: ${project.industry || 'Nicht angegeben'}
- Zielgruppe: ${project.targetAudience || 'Allgemein'}
- USPs: ${project.usps?.join(', ') || 'Keine'}
- Brand Voice: ${project.brandVoice || 'professional'}
- Standort: ${project.location?.city || ''}, ${project.location?.country || 'Deutschland'}

## PAGE:
- Slug: ${pageSlug}
- Path: ${pageSlug === 'home' || pageSlug === '' ? 'src/app/page.tsx' : `src/app/${pageSlug}/page.tsx`}

## PAGE CONTENT:
${JSON.stringify(pageContent, null, 2)}

## SITE SETTINGS:
${JSON.stringify(contentPack.siteSettings, null, 2)}

## COLORS:
${JSON.stringify(colors, null, 2)}

## NAVIGATION:
${JSON.stringify(contentPack.navigation, null, 2)}

${pageSlug === 'impressum' && legal?.imprint ? `## IMPRESSUM:\n${JSON.stringify(legal.imprint, null, 2)}` : ''}
${pageSlug === 'datenschutz' && legal?.privacy ? `## DATENSCHUTZ:\n${JSON.stringify(legal.privacy, null, 2)}` : ''}

## TECH STACK:
${agentContext.techStack.cms.enabled ? '- CMS: Sanity - fetch data with GROQ, use async Server Component' : '- CMS: KEINS'}
${agentContext.techStack.email.enabled && (pageSlug === 'kontakt' || pageSlug === 'contact') ? '- KONTAKTFORMULAR: Include contact form with Server Action using Resend API' : ''}
${agentContext.techStack.blog.enabled && pageSlug === 'blog' ? '- BLOG: Fetch blog posts from Sanity, display grid of posts' : ''}

## WICHTIG:
- DARK MODE: Alle Komponenten müssen dark: Varianten nutzen!
- Passe Texte an die Branche "${project.industry || 'Allgemein'}" an
- Berücksichtige die Zielgruppe: ${project.targetAudience || 'Allgemein'}
- Hebe die USPs hervor: ${project.usps?.join(', ') || 'Keine'}

Generate complete page.tsx with full dark mode support.`

    // Get dynamic system prompt based on agent context
    const systemPrompt = getSystemPrompt(agentContext)

    // FIRE AND FORGET: Start OpenAI call
    const backgroundTask = (async () => {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      try {
        console.log(`[PAGE-BUILDER] /${pageSlug} - Calling Codex...`)
        
        const { content, inputTokens, outputTokens, model } = await callOpenAI(
          systemPrompt,
          userPrompt,
          'gpt-5.2-codex',
          20000
        )

        const output: PageBuilderOutput = JSON.parse(content)
        const durationMs = Date.now() - startTime
        const costUsd = calculateCost(model, inputTokens, outputTokens)

        console.log(`[PAGE-BUILDER] /${pageSlug}: ${output.files.length} files in ${durationMs}ms`)

        // Save files to DB
        for (const file of output.files) {
          await supabase.from('generated_files').upsert({
            project_id: meta.projectId,
            file_path: file.path,
            content: file.content,
            created_at: new Date().toISOString(),
          }, { onConflict: 'project_id,file_path' })
        }

        // Update agent run
        await updateAgentRun(agentRunId, {
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

        // Check coordination - count only completed page-builder runs
        const expectedCount = (meta.expectedAgentCount as number) || 1
        
        // Count ONLY completed page-builder runs for this pipeline (NOT shared-components!)
        const { count } = await supabase
          .from('agent_runs')
          .select('*', { count: 'exact', head: true })
          .eq('pipeline_run_id', meta.pipelineRunId)
          .eq('agent_name', 'page-builder')
          .eq('status', 'completed')

        console.log(`[PAGE-BUILDER] /${pageSlug} Coordination: ${count}/${expectedCount} page-builders completed`)

        if (count && count >= expectedCount) {
          console.log('[PAGE-BUILDER] All Phase 4 complete! Triggering Phase 5/6...')
          
          // Determine next agent based on addons
          const addons = project.addons || []
          const packageType = project.packageType || 'starter'
          const hasCms = addons.includes('cms_base')
          const hasBooking = addons.includes('booking_form')
          const hasAnalytics = packageType === 'enterprise' || addons.includes('analytics')

          if (hasCms) {
            // CMS gebucht → sanity-setup
            console.log('[PAGE-BUILDER] CMS addon detected, triggering sanity-setup...')
            await supabase.from('pipeline_runs').update({ status: 'phase_5' }).eq('id', meta.pipelineRunId)
            await triggerAgent('sanity-setup', {
              ...envelope,
              meta: { ...meta, agentName: 'cms', phase: 5, sequence: 1, timestamp: new Date().toISOString() },
            })
          } else if (hasBooking) {
            // Kein CMS, aber Booking → resend-setup
            console.log('[PAGE-BUILDER] Booking addon detected (no CMS), triggering resend-setup...')
            await supabase.from('pipeline_runs').update({ status: 'phase_5' }).eq('id', meta.pipelineRunId)
            await triggerAgent('resend-setup', {
              ...envelope,
              meta: { ...meta, agentName: 'email', phase: 5, sequence: 2, timestamp: new Date().toISOString() },
            })
          } else if (hasAnalytics) {
            // Kein CMS/Booking, aber Analytics → analytics
            console.log('[PAGE-BUILDER] Analytics addon detected (no CMS/Booking), triggering analytics...')
            await supabase.from('pipeline_runs').update({ status: 'phase_5' }).eq('id', meta.pipelineRunId)
            await triggerAgent('analytics', {
              ...envelope,
              meta: { ...meta, agentName: 'analytics', phase: 5, sequence: 3, timestamp: new Date().toISOString() },
            })
          } else {
            // Keine Phase 5 Agents → direkt deployer
            console.log('[PAGE-BUILDER] No Phase 5 addons, triggering deployer...')
            await supabase.from('pipeline_runs').update({ status: 'phase_6' }).eq('id', meta.pipelineRunId)
            await triggerAgent('deployer', {
              ...envelope,
              meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
            })
          }
        }
      } catch (error) {
        console.error(`[PAGE-BUILDER] /${pageSlug} Background error:`, error)
        await updateAgentRun(agentRunId, {
          status: 'failed',
          error_code: 'PAGE_BUILDER_BACKGROUND_ERROR',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
      }
    })()

    // WICHTIG: Task am Leben halten mit EdgeRuntime.waitUntil
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundTask)
    }

    // Sofort antworten - OpenAI läuft im Hintergrund weiter
    return new Response(JSON.stringify({
      success: true,
      agentRunId,
      agentName: 'page-builder',
      message: `Building /${pageSlug} in background`,
      status: 'processing',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[PAGE-BUILDER] Init error:', error)

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
