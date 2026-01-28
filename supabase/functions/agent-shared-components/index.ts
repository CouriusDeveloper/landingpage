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

### Layout Components (src/components/layout/):
1. src/components/layout/Header.tsx - Navigation mit Logo, Links, Mobile Menu, ThemeToggle
2. src/components/layout/Footer.tsx - Footer mit Links, Copyright, Social
3. src/components/layout/ThemeProvider.tsx - Context für Light/Dark/System Mode
4. src/components/layout/ThemeToggle.tsx - Toggle Button: Light ☀️, Dark 🌙, System 💻

### Section Components (src/components/sections/landing/):
5. src/components/sections/landing/index.ts - BARREL FILE
6. src/components/sections/landing/HeroSection.tsx
7. src/components/sections/landing/FeaturesSection.tsx
8. src/components/sections/landing/CtaSection.tsx
9. src/components/sections/landing/AboutSection.tsx
10. src/components/sections/landing/ContactSection.tsx
11. src/components/sections/landing/LegalSection.tsx

### UI Components (src/components/ui/):
12. src/components/ui/Motion.tsx - FadeIn, SlideIn, StaggerContainer, StaggerItem, ScaleOnHover
13. src/components/ui/ScrollProgress.tsx - Scroll progress bar
14. src/components/ui/BackToTop.tsx - Back to top button

### Config Files:
15. src/app/layout.tsx - Root Layout mit ThemeProvider
16. src/app/globals.css - CSS Variables für Theme + Tailwind
17. tailwind.config.ts - darkMode: 'class'
18. tsconfig.json - @/ path alias
19. next.config.js - module.exports = { reactStrictMode: true }
20. postcss.config.js - PostCSS Config für Tailwind (PFLICHT!)
21. package.json

## 🌗 DARK MODE (PFLICHT!):

### ThemeProvider.tsx (src/components/layout/ThemeProvider.tsx):
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

### ThemeToggle.tsx (src/components/layout/ThemeToggle.tsx):
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
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { ScrollProgress } from '@/components/ui/ScrollProgress'
import { BackToTop } from '@/components/ui/BackToTop'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
export const metadata = { title: '...', description: '...' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <ScrollProgress />
          {children}
          <BackToTop />
        </ThemeProvider>
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

### globals.css (src/app/globals.css):
\`\`\`css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: #PRIMARY;
  --color-secondary: #SECONDARY;
}

.dark {
  --color-background: #0f172a;
  --color-text: #f1f5f9;
}

@layer base {
  html { scroll-behavior: smooth; }
  body {
    @apply antialiased bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply text-slate-900 dark:text-white font-semibold tracking-tight;
  }
}

@layer components {
  .section { @apply py-16 md:py-24; }
  .container-custom { @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8; }
  .card {
    @apply bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 md:p-8;
    @apply border border-slate-100 dark:border-slate-700;
  }
  .input {
    @apply w-full px-4 py-3 rounded-lg border;
    @apply bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600;
    @apply text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500;
    @apply focus:ring-2 focus:ring-primary focus:border-transparent transition-colors;
  }
}

.btn-hover { @apply transition-all duration-300 ease-out; }
.btn-hover:hover { @apply transform -translate-y-0.5 shadow-lg; }
.card-hover { @apply transition-all duration-300 ease-out; }
.card-hover:hover { @apply transform -translate-y-1 shadow-xl; }
\`\`\`

## 🎬 MOTION COMPONENTS (src/components/ui/Motion.tsx):
\`\`\`tsx
'use client'

import { motion, useInView, type Variants } from 'framer-motion'
import { useRef, type ReactNode } from 'react'

// Fade in from bottom
export function FadeIn({ children, delay = 0, duration = 0.5, className = '' }: { children: ReactNode; delay?: number; duration?: number; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration, delay, ease: 'easeOut' }} className={className}>
      {children}
    </motion.div>
  )
}

// Slide in from direction
export function SlideIn({ children, direction = 'left', delay = 0, className = '' }: { children: ReactNode; direction?: 'left' | 'right' | 'up' | 'down'; delay?: number; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const variants: Record<string, { x?: number; y?: number }> = {
    left: { x: -50 }, right: { x: 50 }, up: { y: -50 }, down: { y: 50 }
  }
  const initial = { opacity: 0, ...variants[direction] }
  return (
    <motion.div ref={ref} initial={initial} animate={isInView ? { opacity: 1, x: 0, y: 0 } : initial} transition={{ duration: 0.6, delay, ease: 'easeOut' }} className={className}>
      {children}
    </motion.div>
  )
}

// Stagger container for lists
export function StaggerContainer({ children, className = '', staggerDelay = 0.1 }: { children: ReactNode; className?: string; staggerDelay?: number }) {
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={{ visible: { transition: { staggerChildren: staggerDelay } } }} className={className}>
      {children}
    </motion.div>
  )
}

// Stagger item (child of StaggerContainer)
export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } } }} className={className}>
      {children}
    </motion.div>
  )
}

// Scale on hover
export function ScaleOnHover({ children, scale = 1.02, className = '' }: { children: ReactNode; scale?: number; className?: string }) {
  return (
    <motion.div whileHover={{ scale }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }} className={className}>
      {children}
    </motion.div>
  )
}
\`\`\`

## 📜 SCROLL PROGRESS (src/components/ui/ScrollProgress.tsx):
\`\`\`tsx
'use client'
import { motion, useScroll, useSpring } from 'framer-motion'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })
  return <motion.div className="fixed top-0 left-0 right-0 h-1 bg-primary origin-left z-50" style={{ scaleX }} />
}
\`\`\`

## ⬆️ BACK TO TOP (src/components/ui/BackToTop.tsx):
\`\`\`tsx
'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp } from 'lucide-react'

export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 p-3 rounded-full bg-primary text-white shadow-lg hover:opacity-90 z-40"
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
\`\`\`

## 📦 PACKAGE.JSON (VOLLSTÄNDIG MIT devDependencies!):
\`\`\`json
{
  "name": "website",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/node": "^20.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0"
  }
}
\`\`\`

## 📦 POSTCSS.CONFIG.JS (PFLICHT für Tailwind!):
\`\`\`js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
\`\`\`

## SECTION PROPS (alle optional, verwende undefined statt null!):
interface FeatureProps { icon?: string; title?: string; description?: string }
interface HeroSectionProps { headline?: string; subheadline?: string; ctaText?: string; ctaHref?: string; image?: string }
interface FeaturesSectionProps { title?: string; features?: FeatureProps[] }
interface CtaSectionProps { title?: string; description?: string; ctaText?: string; ctaHref?: string }
interface AboutSectionProps { title?: string; description?: string; team?: { name?: string; role?: string }[] }
interface ContactSectionProps { title?: string; description?: string; email?: string; phone?: string; address?: string }
interface LegalSectionProps { title?: string; content?: string }

⚠️ WICHTIG: Verwende NIEMALS null für Props! Nutze undefined oder lasse die Property weg.

## EXPORT REGELN:
\`\`\`tsx
'use client'
function ComponentName() { ... }
export default ComponentName
export { ComponentName }
\`\`\`

## BARREL FILE (src/components/sections/landing/index.ts):
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
Generiere: src/components/layout/CookieConsent.tsx
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
- src/components/sections/blog/BlogSection.tsx
- 1 Sample Blog Post Content`
  }

  // Contact Form
  if (techStack.email.enabled) {
    prompt += `

## 📧 KONTAKTFORMULAR:
Generiere:
- src/lib/actions/contact.ts (Server Action mit Resend)
- src/components/sections/contact/ContactForm.tsx ('use client')`
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
