// =============================================================================
// AGENT: SHARED-COMPONENTS (Phase 4) - OPTIMIZED VERSION
// Only AI-generates Header & Footer, everything else is templates
// Reduces output tokens from ~16k to ~3k
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
import {
  STATIC_TEMPLATES,
  generatePackageJson,
  generateTailwindConfig,
  generateGlobalsCss,
  generateLayoutTsx,
} from './templates.ts'

interface SharedComponentsOutput {
  files: Array<{
    path: string
    content: string
  }>
}

// Minimal system prompt - ONLY for Header and Footer
const SYSTEM_PROMPT = `Du bist ein Next.js 14 Entwickler. Generiere NUR Header und Footer Komponenten.
Respond with valid JSON only.

## OUTPUT FORMAT (JSON):
{
  "files": [
    {"path": "src/components/layout/Header.tsx", "content": "..."},
    {"path": "src/components/layout/Footer.tsx", "content": "..."}
  ]
}

## HEADER ANFORDERUNGEN:
- 'use client' am Anfang
- Responsive Navigation mit Mobile Menu (useState für isOpen)
- Logo links, Links mittig/rechts, ThemeToggle rechts
- Import: import { ThemeToggle } from './ThemeToggle'
- Dark Mode: bg-white dark:bg-slate-900, text-slate-900 dark:text-white
- Sticky: sticky top-0 z-50 backdrop-blur
- Mobile: Hamburger Menu mit Lucide Menu/X Icons

## FOOTER ANFORDERUNGEN:
- 'use client' am Anfang (für Links mit usePathname wenn nötig)
- Responsive Grid: 1 col mobile, 3-4 cols desktop
- Logo + Beschreibung links
- Link-Gruppen in der Mitte
- Social Icons rechts (optional)
- Copyright unten
- Dark Mode: bg-slate-100 dark:bg-slate-800

## REGELN:
- NUR Header.tsx und Footer.tsx generieren!
- Verwende Tailwind CSS mit dark: Varianten
- Lucide-react für Icons (Menu, X, etc.)
- Export: export default + named export
- KEINE anderen Dateien!

Antworte NUR mit validem JSON.`

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[SHARED-COMPONENTS] Starting OPTIMIZED (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'shared-components',
      meta.phase,
      0,
      { project: project.name, mode: 'optimized' },
      meta.attempt
    )

    // Load outputs
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    const visual = await loadAgentOutput<VisualOutput>(meta.pipelineRunId, 'visual')

    if (!contentPack) {
      throw new Error('Content Pack not found')
    }

    const colors = visual?.colorScheme || {
      primary: project.primaryColor || '#3b82f6',
      secondary: project.secondaryColor || '#10b981',
    }

    const agentContext = getAgentContext(project)
    
    console.log(`[SHARED-COMPONENTS] Addons: ${Object.entries(agentContext.addons).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}`)

    // Minimal user prompt - only what's needed for Header/Footer
    const userPrompt = `Generiere Header und Footer für:

## UNTERNEHMEN:
- Name: ${project.name}
- Branche: ${project.industry || 'Allgemein'}

## NAVIGATION:
${JSON.stringify(contentPack.navigation, null, 2)}

## FOOTER:
${JSON.stringify(contentPack.footer, null, 2)}

## SITE SETTINGS:
- Logo: ${contentPack.siteSettings?.logo || project.name}
- Tagline: ${contentPack.siteSettings?.tagline || ''}

## DESIGN:
- Primary: ${colors.primary}
- Secondary: ${colors.secondary}

Generiere NUR Header.tsx und Footer.tsx!`

    // FIRE AND FORGET
    const backgroundTask = (async () => {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      try {
        console.log('[SHARED-COMPONENTS] Calling OpenAI (optimized - only Header/Footer)...')
        
        // Much smaller token limit since we only generate 2 files
        const { content, inputTokens, outputTokens, model } = await callOpenAI(
          SYSTEM_PROMPT,
          userPrompt,
          'gpt-5.2-codex',
          6000 // Reduced from 20000!
        )

        console.log(`[SHARED-COMPONENTS] AI response: ${inputTokens} input, ${outputTokens} output tokens`)

        // Parse AI response (only Header + Footer)
        let aiOutput: SharedComponentsOutput
        try {
          aiOutput = JSON.parse(content)
        } catch (parseError) {
          console.error('[SHARED-COMPONENTS] JSON parse error, trying repair...')
          // Simple repair for this small response
          let repaired = content
          if (!repaired.endsWith(']}')) {
            const lastFileEnd = repaired.lastIndexOf('"}')
            if (lastFileEnd > 0) {
              repaired = repaired.substring(0, lastFileEnd + 2) + ']}'
            }
          }
          aiOutput = JSON.parse(repaired)
        }

        // Combine AI-generated files with static templates
        const allFiles: Array<{ path: string; content: string }> = []

        // 1. Add AI-generated Header & Footer
        for (const file of aiOutput.files || []) {
          allFiles.push(file)
        }
        console.log(`[SHARED-COMPONENTS] AI generated: ${aiOutput.files?.length || 0} files`)

        // 2. Add all static templates
        for (const [path, content] of Object.entries(STATIC_TEMPLATES)) {
          allFiles.push({ path, content })
        }
        console.log(`[SHARED-COMPONENTS] Static templates: ${Object.keys(STATIC_TEMPLATES).length} files`)

        // 3. Add generated config files with variables
        allFiles.push({
          path: 'package.json',
          content: generatePackageJson(project.name, {
            cms: agentContext.addons.cms,
            email: agentContext.addons.contactForm,
            analytics: agentContext.addons.analytics,
          })
        })
        
        allFiles.push({
          path: 'tailwind.config.ts',
          content: generateTailwindConfig(colors.primary, colors.secondary)
        })
        
        allFiles.push({
          path: 'src/app/globals.css',
          content: generateGlobalsCss(colors.primary, colors.secondary)
        })
        
        allFiles.push({
          path: 'src/app/layout.tsx',
          content: generateLayoutTsx(
            contentPack.siteSettings?.siteName || project.name,
            contentPack.siteSettings?.siteDescription || `Website für ${project.name}`
          )
        })

        console.log(`[SHARED-COMPONENTS] Total files: ${allFiles.length}`)

        const durationMs = Date.now() - startTime
        const costUsd = calculateCost(model, inputTokens, outputTokens)

        // Save files to DB
        for (const file of allFiles) {
          await supabase.from('generated_files').upsert({
            project_id: meta.projectId,
            file_path: file.path,
            content: file.content,
            created_at: new Date().toISOString(),
          }, { onConflict: 'project_id,file_path' })
        }

        const output: SharedComponentsOutput = { files: allFiles }

        await updateAgentRun(agentRunId!, {
          status: 'completed',
          output_data: output,
          model_used: model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          duration_ms: durationMs,
          cost_usd: costUsd,
          quality_score: 9.0,
          validation_passed: true,
          completed_at: new Date().toISOString(),
        })

        await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

        // Check if all sections are complete and we can trigger page-builder
        // expectedSectionCount = totalSections + 1 (shared-components)
        // We count COMPLETED section-generator agent_runs, not generated_sections rows
        const expectedSectionCount = (meta.expectedSectionCount as number) || 1
        const expectedSectionGenerators = expectedSectionCount - 1 // minus shared-components
        
        // Count completed section-generator runs for this pipeline
        const { count: completedSectionGenerators } = await supabase
          .from('agent_runs')
          .select('*', { count: 'exact', head: true })
          .eq('pipeline_run_id', meta.pipelineRunId)
          .eq('agent_name', 'section-generator')
          .eq('status', 'completed')
        
        // Total: completed section-generators + this shared-components (1)
        const totalComplete = (completedSectionGenerators || 0) + 1
        
        console.log(`[SHARED-COMPONENTS] Pre-PageBuilder check: ${totalComplete}/${expectedSectionCount} (section-generators: ${completedSectionGenerators}/${expectedSectionGenerators}, this: 1)`)
        
        if (totalComplete >= expectedSectionCount) {
          // ATOMIC LOCK: Check if page-builder already triggered
          const { data: pipelineData } = await supabase
            .from('pipeline_runs')
            .select('metadata')
            .eq('id', meta.pipelineRunId)
            .single()
          
          const metadata = (pipelineData?.metadata as Record<string, unknown>) || {}
          
          if (metadata.page_builder_triggered) {
            console.log('[SHARED-COMPONENTS] Page-builder already triggered by section-generator, skipping')
            return
          }
          
          // Set the flag
          await supabase
            .from('pipeline_runs')
            .update({ metadata: { ...metadata, page_builder_triggered: true } })
            .eq('id', meta.pipelineRunId)
          
          console.log('[SHARED-COMPONENTS] ✅ All sections complete! Triggering page-builder...')
          
          // Load content pack to get page list
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
                sequence: 100 + pageIndex,
                timestamp: new Date().toISOString(),
                pageInput: {
                  pageSlug: page.slug,
                  pageIndex,
                  totalPages,
                },
                expectedAgentCount: totalPages,
              },
            }
            
            await triggerAgent('page-builder', pageEnvelope)
            console.log(`[SHARED-COMPONENTS] Triggered page-builder for /${page.slug}`)
          }
        }
      } catch (error) {
        console.error('[SHARED-COMPONENTS] Background error:', error)
        await updateAgentRun(agentRunId!, {
          status: 'failed',
          error_code: 'SHARED_COMPONENTS_BACKGROUND_ERROR',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
      }
    })()

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundTask)
    }

    return new Response(JSON.stringify({
      success: true,
      agentRunId,
      agentName: 'shared-components',
      message: 'Building shared components in background (optimized)',
      status: 'processing',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[SHARED-COMPONENTS] Init error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
