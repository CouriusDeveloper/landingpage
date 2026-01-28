// =============================================================================
// SHARED AGENT CONTEXT - Central Source of Truth for All Agents
// Every agent must use this to understand what the client bought and what's allowed
// =============================================================================

export interface ProjectAddons {
  // Core Addons
  cms_base: boolean
  cms_per_page: boolean
  booking_form: boolean
  
  // New Addons
  google_pixel: boolean
  meta_pixel: boolean
  seo_package: boolean
  blog_addon: boolean
  cookie_consent: boolean
}

export interface ProjectLimits {
  maxPages: number
  packageType: 'basic' | 'professional' | 'enterprise'
}

export interface TechStack {
  // CMS
  cms: {
    enabled: boolean
    system: 'sanity'
    studioUrl: string | null
    projectId: string | null
    dataset: string
  }
  
  // Email
  email: {
    enabled: boolean
    system: 'resend'
    domain: string | null
    verified: boolean
  }
  
  // Hosting
  hosting: {
    system: 'vercel'
    previewUrl: string | null
  }
  
  // Analytics
  analytics: {
    googlePixel: {
      enabled: boolean
      pixelId: string | null
    }
    metaPixel: {
      enabled: boolean
      pixelId: string | null
    }
  }
  
  // Cookie Consent
  cookieConsent: {
    enabled: boolean
  }
  
  // Blog
  blog: {
    enabled: boolean
    requiresCms: true
  }
  
  // SEO
  seo: {
    enabled: boolean
    generateSitemap: boolean
    generateRobotsTxt: boolean
    schemaMarkup: boolean
  }
}

export interface AgentContext {
  // What the client bought
  addons: ProjectAddons
  limits: ProjectLimits
  techStack: TechStack
  
  // Strict rules
  rules: {
    allowed: string[]
    forbidden: string[]
  }
  
  // System prompt addition (include in every agent's system prompt)
  systemPromptAddition: string
}

// Package page limits
const PACKAGE_LIMITS: Record<string, number> = {
  basic: 5,
  professional: 10,
  enterprise: 20,
}

/**
 * Parse addon array into structured object
 */
function parseAddons(addonArray: string[] | null | undefined): ProjectAddons {
  const addons = addonArray || []
  return {
    cms_base: addons.includes('cms_base') || addons.includes('cms'),
    cms_per_page: addons.includes('cms_per_page'),
    booking_form: addons.includes('booking_form'),
    google_pixel: addons.includes('google_pixel'),
    meta_pixel: addons.includes('meta_pixel'),
    seo_package: addons.includes('seo_package'),
    blog_addon: addons.includes('blog_addon'),
    cookie_consent: addons.includes('cookie_consent'),
  }
}

/**
 * Build tech stack configuration based on addons and project data
 */
function buildTechStack(
  addons: ProjectAddons,
  project: {
    sanity_project_id?: string | null
    sanity_dataset?: string
    sanity_studio_url?: string | null
    resend_domain_id?: string | null
    email_domain?: string | null
    email_domain_verified?: boolean
    preview_url?: string | null
    google_pixel_id?: string | null
    meta_pixel_id?: string | null
  }
): TechStack {
  return {
    cms: {
      enabled: addons.cms_base,
      system: 'sanity',
      studioUrl: project.sanity_studio_url || null,
      projectId: project.sanity_project_id || null,
      dataset: project.sanity_dataset || 'production',
    },
    email: {
      enabled: addons.booking_form,
      system: 'resend',
      domain: project.email_domain || null,
      verified: project.email_domain_verified || false,
    },
    hosting: {
      system: 'vercel',
      previewUrl: project.preview_url || null,
    },
    analytics: {
      googlePixel: {
        enabled: addons.google_pixel,
        pixelId: project.google_pixel_id || null,
      },
      metaPixel: {
        enabled: addons.meta_pixel,
        pixelId: project.meta_pixel_id || null,
      },
    },
    cookieConsent: {
      enabled: addons.cookie_consent || addons.google_pixel || addons.meta_pixel,
    },
    blog: {
      enabled: addons.blog_addon && addons.cms_base, // Blog requires CMS
      requiresCms: true,
    },
    seo: {
      enabled: addons.seo_package,
      generateSitemap: addons.seo_package,
      generateRobotsTxt: addons.seo_package,
      schemaMarkup: addons.seo_package,
    },
  }
}

/**
 * Build allowed/forbidden rules based on addons
 */
function buildRules(addons: ProjectAddons, limits: ProjectLimits): { allowed: string[]; forbidden: string[] } {
  const allowed: string[] = [
    'Next.js 14 App Router',
    'TypeScript',
    'Tailwind CSS',
    'Lucide React Icons',
    'Light/Dark/System Theme Toggle',
    'Responsive Design',
    'Vercel Deployment',
  ]
  
  const forbidden: string[] = []
  
  // CMS
  if (addons.cms_base) {
    allowed.push('Sanity CMS Integration', 'Sanity Studio', 'GROQ Queries', 'Editable Content')
  } else {
    forbidden.push('Sanity CMS', 'Any CMS integration', 'Dynamic content from database')
  }
  
  // Contact Form / Email
  if (addons.booking_form) {
    allowed.push('Contact Form', 'Resend Email Integration', 'Server Actions for Email')
  } else {
    forbidden.push('Contact forms with email sending', 'Resend integration', 'Any email functionality')
  }
  
  // Google Pixel
  if (addons.google_pixel) {
    allowed.push('Google Analytics Pixel', 'GA4 Event Tracking')
  } else {
    forbidden.push('Google Analytics', 'Google Pixel', 'GA4')
  }
  
  // Meta Pixel
  if (addons.meta_pixel) {
    allowed.push('Meta/Facebook Pixel', 'Meta Conversion Tracking')
  } else {
    forbidden.push('Meta Pixel', 'Facebook Pixel', 'Meta tracking')
  }
  
  // Cookie Consent (required if any tracking)
  if (addons.cookie_consent || addons.google_pixel || addons.meta_pixel) {
    allowed.push('Cookie Consent Banner', 'GDPR-compliant cookie handling')
  }
  
  // Blog
  if (addons.blog_addon && addons.cms_base) {
    allowed.push('Blog System', 'Blog Posts with Sanity', 'Blog Categories', '1 Sample Blog Post')
  } else {
    forbidden.push('Blog functionality', 'Blog posts', 'Blog pages')
  }
  
  // SEO Package
  if (addons.seo_package) {
    allowed.push('sitemap.xml Generation', 'robots.txt', 'Schema.org Markup', 'Advanced Meta Tags')
  } else {
    forbidden.push('sitemap.xml', 'robots.txt customization', 'Schema.org markup')
  }
  
  // Page limits
  forbidden.push(`More than ${limits.maxPages} pages (client booked ${limits.packageType} package)`)
  
  return { allowed, forbidden }
}

/**
 * Generate the system prompt addition that should be included in every agent
 */
function generateSystemPromptAddition(
  addons: ProjectAddons,
  limits: ProjectLimits,
  rules: { allowed: string[]; forbidden: string[] }
): string {
  const bookedAddons = Object.entries(addons)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name)
  
  return `
## 🚨 KRITISCHE REGELN - LIES DAS ZUERST!

### Was der Kunde gebucht hat:
- Paket: ${limits.packageType.toUpperCase()} (max. ${limits.maxPages} Seiten)
- Addons: ${bookedAddons.length > 0 ? bookedAddons.join(', ') : 'KEINE'}

### Tech Stack (NUR DIESE VERWENDEN):
- CMS: ${addons.cms_base ? 'Sanity Studio' : 'KEINS - Kein CMS verwenden!'}
- Email: ${addons.booking_form ? 'Resend' : 'KEINE - Keine Email-Funktionalität!'}
- Hosting: Vercel
- Analytics: ${addons.google_pixel ? 'Google Pixel' : ''}${addons.meta_pixel ? (addons.google_pixel ? ', ' : '') + 'Meta Pixel' : ''}${!addons.google_pixel && !addons.meta_pixel ? 'KEINE' : ''}
- Cookie-Banner: ${addons.cookie_consent || addons.google_pixel || addons.meta_pixel ? 'JA (DSGVO-konform)' : 'NEIN'}
- Blog: ${addons.blog_addon && addons.cms_base ? 'JA (mit Sanity)' : 'NEIN'}
- SEO-Paket: ${addons.seo_package ? 'JA (Sitemap, robots.txt, Schema.org)' : 'NEIN'}

### ✅ ERLAUBT:
${rules.allowed.map(r => `- ${r}`).join('\n')}

### ❌ VERBOTEN (Der Kunde hat dafür NICHT bezahlt!):
${rules.forbidden.map(r => `- ${r}`).join('\n')}

### Standard-Features (IMMER inkludiert):
- Light/Dark/System Mode Toggle (ThemeProvider + ThemeToggle)
- Responsive Design (Mobile-first)
- TypeScript (strict mode)
- Tailwind CSS mit dark: Varianten
- Professionelles, modernes Design

### WICHTIG:
1. Generiere NUR was der Kunde bezahlt hat
2. Überschreite NIEMALS das Seitenlimit
3. Verwende NUR die oben genannten Technologien
4. Bei Tracking-Pixels: NUR nach Cookie-Consent laden!
`
}

/**
 * Main function: Get complete agent context for a project
 */
export function getAgentContext(project: {
  package_type?: string
  selected_addons?: string[] | null
  addons?: string[] | null // Alternative field name
  sanity_project_id?: string | null
  sanity_dataset?: string
  sanity_studio_url?: string | null
  resend_domain_id?: string | null
  email_domain?: string | null
  email_domain_verified?: boolean
  preview_url?: string | null
  google_pixel_id?: string | null
  meta_pixel_id?: string | null
}): AgentContext {
  // Parse addons (support both field names)
  const addonArray = project.selected_addons || project.addons || []
  const addons = parseAddons(addonArray)
  
  // Get package limits
  const packageType = (project.package_type || 'basic') as 'basic' | 'professional' | 'enterprise'
  const limits: ProjectLimits = {
    maxPages: PACKAGE_LIMITS[packageType] || 5,
    packageType,
  }
  
  // Build tech stack
  const techStack = buildTechStack(addons, project)
  
  // Build rules
  const rules = buildRules(addons, limits)
  
  // Generate system prompt addition
  const systemPromptAddition = generateSystemPromptAddition(addons, limits, rules)
  
  return {
    addons,
    limits,
    techStack,
    rules,
    systemPromptAddition,
  }
}

/**
 * Quick check: Is a specific feature allowed?
 */
export function isFeatureAllowed(context: AgentContext, feature: string): boolean {
  const featureLower = feature.toLowerCase()
  
  // Check explicit forbidden
  for (const forbidden of context.rules.forbidden) {
    if (forbidden.toLowerCase().includes(featureLower)) {
      return false
    }
  }
  
  // Check explicit allowed
  for (const allowed of context.rules.allowed) {
    if (allowed.toLowerCase().includes(featureLower)) {
      return true
    }
  }
  
  // Default: allow (basic features)
  return true
}

/**
 * Get files that should be generated based on addons
 */
export function getRequiredFiles(context: AgentContext): string[] {
  const files: string[] = [
    // Always required
    'src/components/Header.tsx',
    'src/components/Footer.tsx',
    'src/components/ThemeProvider.tsx',
    'src/components/ThemeToggle.tsx',
    'src/app/layout.tsx',
    'src/app/globals.css',
    'tailwind.config.ts',
    'tsconfig.json',
    'next.config.js',
    'package.json',
  ]
  
  // Cookie Consent
  if (context.techStack.cookieConsent.enabled) {
    files.push('src/components/CookieConsent.tsx')
  }
  
  // CMS
  if (context.techStack.cms.enabled) {
    files.push(
      'src/lib/sanity.ts',
      'src/lib/sanity-queries.ts',
      'sanity.config.ts',
      'sanity/schemas/index.ts',
      'sanity/schemas/page.ts',
      'sanity/schemas/settings.ts'
    )
  }
  
  // Blog
  if (context.techStack.blog.enabled) {
    files.push(
      'sanity/schemas/post.ts',
      'sanity/schemas/category.ts',
      'src/app/blog/page.tsx',
      'src/app/blog/[slug]/page.tsx',
      'src/components/sections/BlogSection.tsx'
    )
  }
  
  // Contact Form
  if (context.techStack.email.enabled) {
    files.push(
      'src/lib/actions/contact.ts',
      'src/components/ContactForm.tsx'
    )
  }
  
  // SEO
  if (context.techStack.seo.enabled) {
    files.push(
      'src/app/sitemap.ts',
      'src/app/robots.ts'
    )
  }
  
  return files
}
