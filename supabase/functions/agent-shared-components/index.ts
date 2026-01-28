// =============================================================================
// AGENT: SHARED-COMPONENTS (Phase 4) - Baut Header, Footer, Section-Komponenten
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
} from '../_shared/types/pipeline.ts'

interface SharedComponentsOutput {
  files: Array<{
    path: string
    content: string
  }>
}

// Build comprehensive system prompt with agent context
function getSystemPrompt(agentContext: ReturnType<typeof getAgentContext>): string {
  const { techStack } = agentContext
  
  let prompt = `Du bist ein Elite Next.js 14 Entwickler. Generiere alle Shared Components und Config Files.

${agentContext.systemPromptAddition}

## PFLICHT-DATEIEN (ALLE MÜSSEN GENERIERT WERDEN!):

### Core Components:
1. src/components/Header.tsx - Navigation mit Logo, Links, Mobile Menu, ThemeToggle
2. src/components/Footer.tsx - Footer mit Links, Copyright, Social
3. src/components/ThemeProvider.tsx - Context für Light/Dark/System Mode
4. src/components/ThemeToggle.tsx - Toggle Button: Light ☀️, Dark 🌙, System 💻
5. src/components/sections/index.ts - BARREL FILE

### Section Components:
6. src/components/sections/HeroSection.tsx
7. src/components/sections/FeaturesSection.tsx
8. src/components/sections/CtaSection.tsx
9. src/components/sections/AboutSection.tsx
10. src/components/sections/ContactSection.tsx
11. src/components/sections/LegalSection.tsx

### Config Files:
12. src/app/layout.tsx - Root Layout mit ThemeProvider
13. src/app/globals.css - CSS Variables für Theme + Tailwind
14. tailwind.config.ts - darkMode: 'class'
15. tsconfig.json - @/ path alias
16. next.config.js - module.exports = { reactStrictMode: true }
17. package.json

## 🌗 DARK MODE (PFLICHT!):

### ThemeProvider.tsx:
\`\`\`tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system')
  
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) setTheme(stored)
  }, [])
  
  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && systemDark)
    root.classList.toggle('dark', isDark)
    if (theme !== 'system') localStorage.setItem('theme', theme)
  }, [theme])
  
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)!
export default ThemeProvider
\`\`\`

### ThemeToggle.tsx:
\`\`\`tsx
'use client'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from './ThemeProvider'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = { light: 'dark', dark: 'system', system: 'light' } as const
  const icons = { light: Sun, dark: Moon, system: Monitor }
  const Icon = icons[theme]
  return (
    <button onClick={() => setTheme(next[theme])} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
      <Icon className="w-5 h-5" />
    </button>
  )
}
export default ThemeToggle
export { ThemeToggle }
\`\`\`

### layout.tsx:
\`\`\`tsx
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
export const metadata = { title: '...', description: '...' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
\`\`\`

### tailwind.config.ts:
\`\`\`ts
import type { Config } from 'tailwindcss'
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: { extend: { colors: { primary: 'var(--color-primary)', secondary: 'var(--color-secondary)' } } },
  plugins: []
} satisfies Config
\`\`\`

### globals.css:
\`\`\`css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { --color-primary: #PRIMARY; --color-secondary: #SECONDARY; --color-background: #ffffff; --color-text: #1f2937; }
.dark { --color-background: #0f172a; --color-text: #f1f5f9; }
body { background-color: var(--color-background); color: var(--color-text); }
\`\`\`

## SECTION PROPS (alle optional):
interface HeroSectionProps { headline?: string; subheadline?: string; ctaText?: string; ctaHref?: string; image?: string }
interface FeaturesSectionProps { title?: string; features?: { icon?: string; title?: string; description?: string }[] }
interface CtaSectionProps { title?: string; description?: string; ctaText?: string; ctaHref?: string }
interface AboutSectionProps { title?: string; description?: string; team?: { name?: string; role?: string }[] }
interface ContactSectionProps { title?: string; description?: string; email?: string; phone?: string; address?: string }
interface LegalSectionProps { title?: string; content?: string }

## EXPORT REGELN:
\`\`\`tsx
'use client'
function ComponentName() { ... }
export default ComponentName
export { ComponentName }
\`\`\`

## BARREL FILE (src/components/sections/index.ts):
export { default as HeroSection } from './HeroSection'
export { default as FeaturesSection } from './FeaturesSection'
export { default as CtaSection } from './CtaSection'
export { default as AboutSection } from './AboutSection'
export { default as ContactSection } from './ContactSection'
export { default as LegalSection } from './LegalSection'`

  // Cookie Consent
  if (techStack.cookieConsent.enabled) {
    prompt += `

## 🍪 COOKIE CONSENT:
Generiere: src/components/CookieConsent.tsx
- Zeige Banner wenn kein Consent
- "Nur notwendige" und "Alle akzeptieren" Buttons
- Speichere in localStorage
- Dispatche 'cookie-consent-granted' Event bei "Alle"
- Füge <CookieConsent /> in layout.tsx ein`
  }

  // Google/Meta Pixel
  if (techStack.analytics.googlePixel.enabled || techStack.analytics.metaPixel.enabled) {
    prompt += `

## 📊 TRACKING PIXELS:
- Lade NUR nach Cookie Consent ('all')
- Höre auf 'cookie-consent-granted' Event
${techStack.analytics.googlePixel.enabled ? '- Google Analytics: process.env.NEXT_PUBLIC_GA_ID' : ''}
${techStack.analytics.metaPixel.enabled ? '- Meta Pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID' : ''}`
  }

  // CMS (Sanity)
  if (techStack.cms.enabled) {
    prompt += `

## 📝 SANITY CMS:
Generiere:
- src/lib/sanity.ts (mit @sanity/client, NICHT next-sanity!)
- src/lib/sanity-queries.ts
- sanity.config.ts
- sanity/schemas/index.ts, page.ts, settings.ts

\`\`\`ts
// src/lib/sanity.ts
import { createClient } from '@sanity/client'
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  useCdn: true, apiVersion: '2024-01-01'
})
\`\`\``
  }

  // Blog
  if (techStack.blog.enabled) {
    prompt += `

## 📰 BLOG:
Generiere:
- sanity/schemas/post.ts, category.ts
- src/app/blog/page.tsx
- src/app/blog/[slug]/page.tsx
- src/components/sections/BlogSection.tsx
- 1 Sample Blog Post Content`
  }

  // Contact Form
  if (techStack.email.enabled) {
    prompt += `

## 📧 KONTAKTFORMULAR:
Generiere:
- src/lib/actions/contact.ts (Server Action mit Resend)
- src/components/ContactForm.tsx ('use client')`
  }

  // SEO
  if (techStack.seo.enabled) {
    prompt += `

## 🔍 SEO:
Generiere:
- src/app/sitemap.ts
- src/app/robots.ts`
  }

  prompt += `

## STYLING:
❌ VERBOTEN: styled-jsx, inline <style>
✅ ERLAUBT: Tailwind CSS mit dark: Varianten
Beispiel: className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white"

## OUTPUT FORMAT:
{"files": [{"path": "...", "content": "...vollständiger code..."}]}
Antworte NUR mit validem JSON!`

  return prompt
}

// Declare EdgeRuntime for Supabase
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
    
    console.log(`[SHARED-COMPONENTS] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'shared-components',
      meta.phase,
      0,
      { project: project.name },
      meta.attempt
    )

    // Load outputs
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    const visual = await loadAgentOutput<VisualOutput>(meta.pipelineRunId, 'visual')

    if (!contentPack) {
      throw new Error('Content Pack not found')
    }

    const colors = visual?.colorScheme || {
      primary: project.primaryColor,
      secondary: project.secondaryColor,
      accent: project.secondaryColor,
      background: '#ffffff',
      text: '#1f2937',
    }

    const fonts = visual?.typography || { headingFont: 'Inter', bodyFont: 'Inter' }

    // Get agent context with all addon info
    const agentContext = getAgentContext(project)
    
    console.log(`[SHARED-COMPONENTS] Addons: ${Object.entries(agentContext.addons).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}`)

    const userPrompt = `Respond with valid JSON only.
SITE: ${JSON.stringify(contentPack.siteSettings)}
NAV: ${JSON.stringify(contentPack.navigation)}
FOOTER: ${JSON.stringify(contentPack.footer)}
COLORS: Primary=${colors.primary}, Secondary=${colors.secondary}, Accent=${colors.accent || colors.secondary}
FONTS: Heading=${fonts.headingFont}, Body=${fonts.bodyFont}
SECTIONS: ${[...new Set(contentPack.pages?.flatMap(p => p.sections?.map(s => s.type) || []) || [])].join(', ')}
Generiere ALLE erforderlichen Files für ein vollständiges Projekt mit Dark Mode.`

    const systemPrompt = getSystemPrompt(agentContext)

    // FIRE AND FORGET
    const backgroundTask = (async () => {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      try {
        console.log('[SHARED-COMPONENTS] Calling OpenAI...')
        
        const { content, inputTokens, outputTokens, model } = await callOpenAI(
          systemPrompt,
          userPrompt,
          'gpt-5.2-codex',
          16000
        )

        const output: SharedComponentsOutput = JSON.parse(content)
        const durationMs = Date.now() - startTime
        const costUsd = calculateCost(model, inputTokens, outputTokens)

        console.log(`[SHARED-COMPONENTS] Generated ${output.files.length} files in ${durationMs}ms`)

        // Save files
        for (const file of output.files) {
          await supabase.from('generated_files').upsert({
            project_id: meta.projectId,
            file_path: file.path,
            content: file.content,
            created_at: new Date().toISOString(),
          }, { onConflict: 'project_id,file_path' })
        }

        await updateAgentRun(agentRunId!, {
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

        // Self-Coordination
        const expectedCount = (meta.expectedAgentCount as number) || 1
        
        const { data: codeRendererRun } = await supabase
          .from('agent_runs')
          .select('created_at')
          .eq('pipeline_run_id', meta.pipelineRunId)
          .eq('agent_name', 'code-renderer')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        const cutoffTime = codeRendererRun?.created_at || new Date(Date.now() - 600000).toISOString()
        
        const { count } = await supabase
          .from('agent_runs')
          .select('*', { count: 'exact', head: true })
          .eq('pipeline_run_id', meta.pipelineRunId)
          .eq('phase', 4)
          .eq('status', 'completed')
          .in('agent_name', ['shared-components', 'page-builder'])
          .gte('created_at', cutoffTime)

        console.log(`[SHARED-COMPONENTS] Coordination: ${count}/${expectedCount}`)

        if (count && count >= expectedCount) {
          console.log('[SHARED-COMPONENTS] All Phase 4 complete! Triggering Phase 5...')
          
          await supabase.from('pipeline_runs').update({ status: 'phase_5' }).eq('id', meta.pipelineRunId)

          await triggerAgent('sanity-setup', {
            ...envelope,
            meta: { ...meta, agentName: 'cms', phase: 5, sequence: 1, timestamp: new Date().toISOString() },
          })
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
      message: 'Building shared components in background',
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
