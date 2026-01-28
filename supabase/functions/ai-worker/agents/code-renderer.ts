// Code Renderer Agent - Renders Content Pack to React/Next.js code
// CRITICAL: This agent ONLY renders content from Content Pack
// It NEVER invents any textual content

import type {
  CodeRendererInput,
  CodeRendererOutput,
  GeneratedFileOutput,
  DependencyOutput,
  EnvVariableOutput,
} from '../types/agents.ts'
import type { ContentPack, PageContent, SectionContent, SectionType } from '../types/content-pack.ts'
import { runAgent, buildUserPrompt, logAgent, MODELS } from '../utils/agent-runner.ts'

// Helper to avoid Deno parser issues with 'import' keyword in template literals
const IMP = 'import'

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const CODE_RENDERER_SYSTEM_PROMPT = `You are an elite Code Renderer responsible for converting Content Packs into production-ready Next.js code.

## CRITICAL RULES:
1. You ONLY render content from the Content Pack - NEVER invent any text
2. Every string displayed must come directly from the Content Pack
3. Use exact paths and property names from the Content Pack structure
4. Generate clean, idiomatic TypeScript/React code
5. Follow Next.js 14 App Router conventions
6. Use Tailwind CSS for styling
7. Add Framer Motion animations where specified
8. Implement full Dark Mode support
9. Use Lucide React icons by name from Content Pack

## Tech Stack:
- Next.js 14.2.18 (App Router)
- React 18.3.1
- TypeScript 5
- Tailwind CSS 3.4
- Framer Motion 11
- Lucide React (icons)
- Sanity CMS (if addon enabled)
- Resend (for contact forms if addon enabled)

## File Generation:
Generate complete, production-ready files including:
1. Layout and page components
2. Section components for each section type
3. UI components (Button, Card, etc.)
4. Content data file (site.ts) that exports Content Pack
5. Tailwind and global CSS configuration
6. next.config.js with proper settings
7. API routes for contact forms

## Content Rendering Pattern:
\`\`\`tsx
// BAD - Never do this:
<h1>Welcome to Our Site</h1>

// GOOD - Always reference Content Pack:
<h1>{contentPack.pages[0].sections[0].content.headline}</h1>

// Or with pre-extracted data:
<h1>{hero.headline}</h1>
\`\`\`

## Output Format:
{
  "files": [
    {
      "path": "src/content/site.ts",
      "content": "// Full file content",
      "type": "utility"
    },
    {
      "path": "src/app/page.tsx",
      "content": "// Full file content",
      "type": "page"
    }
  ],
  "dependencies": [
    { "name": "framer-motion", "version": "^11.0.0", "dev": false, "reason": "Animations" }
  ],
  "envVariables": [
    { "name": "NEXT_PUBLIC_SITE_URL", "value": null, "description": "Public site URL", "required": true }
  ],
  "buildInstructions": ["npm install", "npm run dev"]
}

## Code Quality Standards:
- TypeScript strict mode
- Proper component composition
- Responsive design (mobile-first)
- Accessible markup (ARIA labels, semantic HTML)
- Performance optimized (lazy loading, code splitting)
- SEO optimized (metadata, structured data)

Generate ONLY the JSON output with files array.`

// =============================================================================
// CODE RENDERER AGENT
// =============================================================================

export async function runCodeRenderer(input: CodeRendererInput): Promise<CodeRendererOutput> {
  logAgent('code-renderer', 'info', 'Starting code generation', {
    projectId: input.projectData.id,
    pageCount: input.contentPack.pages.length,
    addons: input.addons,
    framework: input.framework,
  })

  // Build comprehensive prompt with Content Pack
  const userPrompt = buildCodeRendererPrompt(input)

  const result = await runAgent<CodeRendererOutput>({
    agentName: 'code-renderer',
    systemPrompt: CODE_RENDERER_SYSTEM_PROMPT,
    userPrompt,
    config: {
      model: 'gpt-5.2-codex',
      maxTokens: 32000,
      timeout: 300000,
      temperature: 0.2,
    },
  })

  if (!result.success || !result.output) {
    logAgent('code-renderer', 'error', 'Code generation failed', {
      error: result.error?.message,
    })
    throw new Error(result.error?.message || 'Code Renderer failed')
  }

  // Post-process files
  const output = result.output
  output.files = processGeneratedFiles(output.files, input)

  logAgent('code-renderer', 'info', 'Code generation complete', {
    duration: result.duration,
    tokensUsed: result.tokensUsed,
    fileCount: output.files.length,
    totalSize: output.files.reduce((acc, f) => acc + f.content.length, 0),
  })

  return output
}

// =============================================================================
// PROMPT BUILDING
// =============================================================================

function buildCodeRendererPrompt(input: CodeRendererInput): string {
  const sections: Record<string, unknown> = {
    'Complete Content Pack': input.contentPack,
    'Project Configuration': {
      id: input.projectData.id,
      name: input.projectData.name,
      primaryColor: input.projectData.primaryColor,
      secondaryColor: input.projectData.secondaryColor,
      websiteStyle: input.projectData.websiteStyle,
      selectedAddons: input.addons,
    },
    'CMS Configuration': input.addons.includes('cms')
      ? {
          sanityProjectId: input.projectData.sanityProjectId,
          sanityDataset: input.projectData.sanityDataset,
        }
      : 'CMS addon not enabled',
    'Email Configuration': input.addons.includes('booking_form')
      ? {
          contactEmail: input.projectData.contactEmail,
          emailDomain: input.projectData.emailDomain,
        }
      : 'Email addon not enabled',
  }

  // Add specific generation instructions
  sections['Generation Instructions'] = `
Generate a complete Next.js 14 website with these specifications:

## Pages to Generate:
${input.contentPack.pages.map((p) => `- ${p.slug}: ${p.name} (${p.sections.length} sections)`).join('\n')}

## Sections Used:
${getUniqueSectionTypes(input.contentPack).join(', ')}

## Required Features:
- Dark mode toggle with system preference detection
- Responsive design (mobile, tablet, desktop)
- Smooth scroll navigation
- Contact form${input.addons.includes('booking_form') ? ' with Resend email' : ''}
- SEO metadata for each page
- Framer Motion animations
- Lucide React icons

## File Structure:
\`\`\`
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── [slug]/page.tsx (for other pages)
├── components/
│   ├── layout/ (Header, Footer)
│   ├── sections/ (Hero, Features, etc.)
│   └── ui/ (Button, Card, etc.)
├── content/
│   └── site.ts (Content Pack export)
└── lib/
    └── utils.ts
\`\`\`

## Important:
1. Export the entire Content Pack from site.ts
2. Import and use Content Pack data in all components
3. Never hardcode any text - always reference Content Pack
4. Use TypeScript interfaces for type safety
5. Include proper error boundaries
6. Add loading states where appropriate

Generate all files now.`

  return buildUserPrompt(sections)
}

function getUniqueSectionTypes(contentPack: ContentPack): SectionType[] {
  const types = new Set<SectionType>()
  contentPack.pages.forEach((page) => {
    page.sections.forEach((section) => {
      types.add(section.type)
    })
  })
  return Array.from(types)
}

// =============================================================================
// FILE POST-PROCESSING
// =============================================================================

function processGeneratedFiles(
  files: GeneratedFileOutput[],
  input: CodeRendererInput
): GeneratedFileOutput[] {
  return files.map((file) => {
    let content = file.content

    // Ensure proper line endings
    content = content.replace(/\r\n/g, '\n')

    // Fix common issues
    content = fixImportStatements(content)
    content = fixTypeScriptIssues(content)

    // Add Content Pack injection for site.ts
    if (file.path.includes('site.ts') || file.path.includes('content.ts')) {
      content = injectContentPack(content, input.contentPack)
    }

    return {
      ...file,
      content,
    }
  })
}

function fixImportStatements(content: string): string {
  // Ensure imports are at the top
  const lines = content.split('\n')
  const imports: string[] = []
  const other: string[] = []

  lines.forEach((line) => {
    if (line.trim().startsWith('import ') || line.trim().startsWith('export ')) {
      imports.push(line)
    } else {
      other.push(line)
    }
  })

  // Remove duplicate imports
  const uniqueImports = [...new Set(imports)]

  return [...uniqueImports, '', ...other].join('\n')
}

function fixTypeScriptIssues(content: string): string {
  // Add 'use client' directive for client components if needed
  if (
    (content.includes('useState') ||
      content.includes('useEffect') ||
      content.includes('onClick') ||
      content.includes('motion.')) &&
    !content.includes("'use client'") &&
    !content.includes('"use client"')
  ) {
    content = "'use client'\n\n" + content
  }

  return content
}

function injectContentPack(content: string, contentPack: ContentPack): string {
  // If content already has Content Pack, return as is
  if (content.includes('contentPack') && content.includes('siteSettings')) {
    return content
  }

  // Generate Content Pack export
  const contentPackExport = `
// Content Pack - Single Source of Truth
// Generated at: ${contentPack.generatedAt}
// Hash: ${contentPack.hash}

export const contentPack = ${JSON.stringify(contentPack, null, 2)} as const

// Convenience exports
export const siteSettings = contentPack.siteSettings
export const pages = contentPack.pages
export const navigation = contentPack.navigation
export const footer = contentPack.footer
export const seo = contentPack.seo
export const legal = contentPack.legal
export const components = contentPack.components

// Type exports
export type ContentPack = typeof contentPack
export type Page = typeof contentPack.pages[number]
export type Section = Page['sections'][number]
`

  return contentPackExport
}

// =============================================================================
// SECTION COMPONENT MAPPING
// =============================================================================

export function getSectionComponentName(type: SectionType): string {
  const mapping: Record<SectionType, string> = {
    hero: 'HeroSection',
    features: 'FeaturesSection',
    services: 'ServicesSection',
    about: 'AboutSection',
    team: 'TeamSection',
    testimonials: 'TestimonialsSection',
    portfolio: 'PortfolioSection',
    pricing: 'PricingSection',
    faq: 'FaqSection',
    contact: 'ContactSection',
    cta: 'CtaSection',
    stats: 'StatsSection',
    logos: 'LogosSection',
    timeline: 'TimelineSection',
    comparison: 'ComparisonSection',
    gallery: 'GallerySection',
    newsletter: 'NewsletterSection',
    'blog-preview': 'BlogPreviewSection',
    custom: 'CustomSection',
  }

  return mapping[type] || 'CustomSection'
}

// =============================================================================
// DEPENDENCY HELPERS
// =============================================================================

export function getRequiredDependencies(input: CodeRendererInput): DependencyOutput[] {
  const deps: DependencyOutput[] = [
    { name: 'framer-motion', version: '^11.0.0', dev: false, reason: 'Animations' },
    { name: 'lucide-react', version: '^0.400.0', dev: false, reason: 'Icons' },
    { name: 'class-variance-authority', version: '^0.7.0', dev: false, reason: 'Component variants' },
    { name: 'clsx', version: '^2.1.0', dev: false, reason: 'Class names' },
    { name: 'tailwind-merge', version: '^2.2.0', dev: false, reason: 'Tailwind class merging' },
  ]

  if (input.addons.includes('cms')) {
    deps.push(
      { name: '@sanity/client', version: '^6.0.0', dev: false, reason: 'Sanity CMS' },
      { name: '@sanity/image-url', version: '^1.0.0', dev: false, reason: 'Sanity images' }
    )
  }

  if (input.addons.includes('booking_form')) {
    deps.push({ name: 'resend', version: '^3.0.0', dev: false, reason: 'Email sending' })
  }

  if (input.addons.includes('blog')) {
    deps.push(
      { name: '@portabletext/react', version: '^3.0.0', dev: false, reason: 'Sanity rich text' },
      { name: 'next-mdx-remote', version: '^4.0.0', dev: false, reason: 'MDX support' }
    )
  }

  return deps
}

export function getRequiredEnvVariables(input: CodeRendererInput): EnvVariableOutput[] {
  const envVars: EnvVariableOutput[] = [
    {
      name: 'NEXT_PUBLIC_SITE_URL',
      value: null,
      description: 'Public URL of the deployed site',
      required: true,
    },
  ]

  if (input.addons.includes('cms') && input.projectData.sanityProjectId) {
    envVars.push(
      {
        name: 'NEXT_PUBLIC_SANITY_PROJECT_ID',
        value: input.projectData.sanityProjectId,
        description: 'Sanity project ID',
        required: true,
      },
      {
        name: 'NEXT_PUBLIC_SANITY_DATASET',
        value: input.projectData.sanityDataset || 'production',
        description: 'Sanity dataset',
        required: true,
      },
      {
        name: 'SANITY_API_TOKEN',
        value: null,
        description: 'Sanity API token for mutations',
        required: false,
      }
    )
  }

  if (input.addons.includes('booking_form')) {
    envVars.push(
      {
        name: 'RESEND_API_KEY',
        value: null,
        description: 'Resend API key for sending emails',
        required: true,
      },
      {
        name: 'CONTACT_EMAIL',
        value: input.projectData.contactEmail,
        description: 'Email address for contact form submissions',
        required: true,
      }
    )
  }

  return envVars
}
