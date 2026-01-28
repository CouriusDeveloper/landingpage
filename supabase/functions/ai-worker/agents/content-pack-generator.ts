// Content Pack Generator Agent - Creates the complete Content Pack
// This is the SINGLE SOURCE OF TRUTH for all website content

import type {
  ContentPackGeneratorInput,
  ContentPackGeneratorOutput,
  TodoMarker,
} from '../types/agents.ts'
import type {
  ContentPack,
  PageContent,
  SectionContent,
  SectionType,
  SiteSettings,
  NavigationContent,
  FooterContent,
  LegalContent,
  ComponentContent,
} from '../types/content-pack.ts'
import { runAgent, buildUserPrompt, logAgent, hashContent } from '../utils/agent-runner.ts'

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const CONTENT_PACK_SYSTEM_PROMPT = `You are an elite Content Architect responsible for creating the complete Content Pack - the Single Source of Truth for website content.

## Your Mission:
Create a comprehensive, structured JSON containing ALL textual and structural content for the website. The code generation agents will ONLY render this content - they cannot invent any text.

## Critical Rules:
1. EVERY piece of text that appears on the website MUST be in this Content Pack
2. Use realistic, professional content - not Lorem Ipsum
3. For unknown factual information (legal details, specific credentials), use {{TODO: description}} placeholders
4. Match the brand voice and tone defined in the strategy
5. All CTAs should be compelling and action-oriented
6. All headlines should be engaging and benefit-focused
7. Content should follow SEO best practices

## Content Pack Structure:
{
  "version": "1.0.0",
  "generatedAt": "ISO date",
  "projectId": "string",
  "hash": "will be calculated",
  
  "siteSettings": {
    "brand": {
      "name": "string",
      "tagline": "string",
      "shortDescription": "string",
      "longDescription": "string",
      "logoUrl": "string|null",
      "favicon": "string|null",
      "brandVoice": "professional|friendly|playful|luxurious|technical",
      "personality": ["trait1", "trait2"]
    },
    "colors": {
      "primary": "#hex",
      "primaryDark": "#hex",
      "primaryLight": "#hex",
      "secondary": "#hex",
      "secondaryDark": "#hex",
      "secondaryLight": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "backgroundAlt": "#hex",
      "text": "#hex",
      "textMuted": "#hex",
      "textInverse": "#hex",
      "success": "#hex",
      "warning": "#hex",
      "error": "#hex",
      "dark": { "background": "#hex", "backgroundAlt": "#hex", "text": "#hex", "textMuted": "#hex" }
    },
    "typography": {
      "headingFont": "string",
      "bodyFont": "string",
      "monoFont": "string",
      "baseFontSize": 16,
      "lineHeight": 1.6,
      "fontWeights": { "light": 300, "regular": 400, "medium": 500, "semibold": 600, "bold": 700 }
    },
    "contact": {
      "email": "string",
      "phone": "string|null",
      "address": { "street": "", "city": "", "state": "", "postalCode": "", "country": "", "formatted": "" } | null,
      "mapEmbed": "string|null"
    },
    "social": { "linkedin": null, "twitter": null, "instagram": null, "facebook": null, "youtube": null, "github": null, "tiktok": null, "discord": null, "custom": [] },
    "business": {
      "legalName": "string",
      "type": "freelancer|agency|startup|enterprise|nonprofit",
      "foundedYear": number|null,
      "employeeCount": "string|null",
      "industries": ["string"],
      "services": ["string"],
      "certifications": [],
      "awards": []
    }
  },
  
  "pages": [
    {
      "id": "unique-id",
      "slug": "/",
      "name": "Home",
      "title": "H1 headline",
      "subtitle": "string|null",
      "description": "meta description",
      "sections": [
        {
          "id": "unique-id",
          "type": "hero|features|services|about|team|testimonials|portfolio|pricing|faq|contact|cta|stats|logos|timeline|comparison|gallery|newsletter|blog-preview|custom",
          "order": 1,
          "headline": "string|null",
          "subheadline": "string|null",
          "eyebrow": "string|null",
          "description": "string|null",
          "content": { /* section-type-specific content */ },
          "style": {
            "background": "light|dark|gradient|image|transparent",
            "backgroundImage": "string|null",
            "padding": "none|small|medium|large|xl",
            "width": "narrow|default|wide|full",
            "alignment": "left|center|right",
            "animation": "none|fade|slide-up|slide-left|slide-right|zoom"
          }
        }
      ],
      "settings": {
        "showInNavigation": true,
        "navigationLabel": "string|null",
        "navigationOrder": 1,
        "isLandingPage": true,
        "template": "default|full-width|sidebar|minimal"
      }
    }
  ],
  
  "seo": [
    {
      "pageSlug": "/",
      "title": "50-60 chars",
      "description": "150-160 chars",
      "keywords": ["keyword1", "keyword2"],
      "ogImage": null,
      "ogType": "website",
      "canonical": null,
      "noIndex": false,
      "structuredData": null
    }
  ],
  
  "legal": {
    "imprint": {
      "companyName": "string",
      "legalForm": "string|null",
      "representative": "{{TODO: Geschäftsführer/Inhaber Name}}",
      "address": { "street": "{{TODO: Straße Nr.}}", "city": "{{TODO: Stadt}}", "postalCode": "{{TODO: PLZ}}", "country": "Deutschland", "formatted": "{{TODO: Vollständige Adresse}}" },
      "email": "string",
      "phone": "{{TODO: Telefonnummer}}|null",
      "vatId": "{{TODO: USt-IdNr. falls vorhanden}}|null",
      "registryCourt": "{{TODO: Registergericht falls eingetragen}}|null",
      "registryNumber": "{{TODO: Registernummer falls eingetragen}}|null",
      "responsibleForContent": "{{TODO: V.i.S.d.P. Name}}|null",
      "additionalInfo": null
    },
    "privacy": { "lastUpdated": "ISO date", "introduction": "string", "sections": [], "contactInfo": "string", "dpoInfo": null },
    "terms": null,
    "cookies": null
  },
  
  "navigation": {
    "logo": null,
    "logoText": "Brand Name",
    "items": [{ "id": "nav-home", "label": "Home", "url": "/", "children": [], "icon": null, "badge": null }],
    "ctaButton": { "text": "Kontakt", "url": "/contact", "variant": "primary", "icon": null, "iconPosition": "right", "openInNewTab": false },
    "showThemeToggle": true,
    "sticky": true,
    "transparent": false
  },
  
  "footer": {
    "logo": null,
    "tagline": "string",
    "columns": [{ "id": "col-1", "title": "Navigation", "links": [{ "label": "Home", "url": "/", "external": false }] }],
    "bottom": {
      "copyright": "© 2026 Brand Name. Alle Rechte vorbehalten.",
      "links": [{ "label": "Impressum", "url": "/impressum", "external": false }, { "label": "Datenschutz", "url": "/datenschutz", "external": false }],
      "showSocial": true
    },
    "newsletter": null
  },
  
  "components": {
    "announcement": null,
    "notFound": { "headline": "Seite nicht gefunden", "description": "Die gesuchte Seite existiert nicht.", "cta": { "text": "Zur Startseite", "url": "/", "variant": "primary", "icon": null, "iconPosition": "right", "openInNewTab": false }, "image": null },
    "loading": { "text": "Wird geladen...", "showSpinner": true },
    "error": { "headline": "Ein Fehler ist aufgetreten", "description": "Bitte versuchen Sie es erneut.", "retryCta": { "text": "Erneut versuchen", "url": "#", "variant": "primary", "icon": null, "iconPosition": "right", "openInNewTab": false } },
    "toasts": {
      "contactSuccess": "Vielen Dank für Ihre Nachricht! Wir melden uns bald.",
      "contactError": "Leider konnte Ihre Nachricht nicht gesendet werden. Bitte versuchen Sie es erneut.",
      "newsletterSuccess": "Erfolgreich angemeldet!",
      "newsletterError": "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
      "genericError": "Ein Fehler ist aufgetreten."
    }
  }
}

## Section Content Examples:

### Hero Section:
{
  "type": "hero",
  "variant": "centered|split|video|slider|minimal",
  "headline": "Compelling H1",
  "subheadline": "Supporting text",
  "description": "optional longer text",
  "primaryCta": { "text": "Action", "url": "/contact", "variant": "primary", "icon": "ArrowRight", "iconPosition": "right", "openInNewTab": false },
  "secondaryCta": null,
  "image": { "src": "/images/hero.jpg", "alt": "descriptive alt", "width": 1200, "height": 600, "caption": null, "credit": null },
  "video": null,
  "badges": ["5★ Bewertung", "100+ Kunden"],
  "announcement": null
}

### Features Section:
{
  "type": "features",
  "variant": "grid|list|cards|icons|alternating",
  "items": [
    { "id": "feat-1", "icon": "Zap", "title": "Feature Name", "description": "Benefit description", "link": null }
  ],
  "columns": 3
}

### Services Section:
{
  "type": "services",
  "variant": "cards|list|detailed|tabs",
  "items": [
    {
      "id": "svc-1",
      "icon": "Code",
      "title": "Service Name",
      "shortDescription": "Brief overview",
      "fullDescription": "Detailed explanation",
      "features": ["Feature 1", "Feature 2"],
      "price": { "amount": null, "currency": "EUR", "period": "custom", "customLabel": "Auf Anfrage", "note": null },
      "cta": { "text": "Mehr erfahren", "url": "/services#service-1", "variant": "outline", "icon": null, "iconPosition": "right", "openInNewTab": false },
      "image": null
    }
  ]
}

### Testimonials Section:
{
  "type": "testimonials",
  "variant": "cards|slider|masonry|featured",
  "items": [
    {
      "id": "test-1",
      "quote": "Authentic testimonial text",
      "author": "Name",
      "role": "Position",
      "company": "Company",
      "image": null,
      "rating": 5,
      "logo": null
    }
  ]
}

### FAQ Section:
{
  "type": "faq",
  "variant": "accordion|grid|categories",
  "items": [
    { "id": "faq-1", "question": "Question?", "answer": "Answer text", "category": null }
  ],
  "categories": []
}

### Contact Section:
{
  "type": "contact",
  "variant": "form|split|minimal|map",
  "headline": "Kontakt aufnehmen",
  "description": "Description text",
  "formFields": [
    { "id": "name", "type": "text", "name": "name", "label": "Name", "placeholder": "Ihr Name", "required": true, "options": null, "validation": null },
    { "id": "email", "type": "email", "name": "email", "label": "E-Mail", "placeholder": "ihre@email.de", "required": true, "options": null, "validation": null },
    { "id": "message", "type": "textarea", "name": "message", "label": "Nachricht", "placeholder": "Ihre Nachricht...", "required": true, "options": null, "validation": null }
  ],
  "submitButton": { "text": "Nachricht senden", "url": "#", "variant": "primary", "icon": "Send", "iconPosition": "right", "openInNewTab": false },
  "successMessage": "Vielen Dank! Wir melden uns bald.",
  "errorMessage": "Fehler beim Senden. Bitte erneut versuchen.",
  "showMap": false,
  "showSocial": true,
  "showInfo": true
}

## Language:
- All content should be in German (unless specified otherwise)
- Use professional, engaging German
- Avoid literal translations from English

Return ONLY the complete JSON Content Pack.`

// =============================================================================
// CONTENT PACK GENERATOR AGENT
// =============================================================================

export async function runContentPackGenerator(
  input: ContentPackGeneratorInput
): Promise<ContentPackGeneratorOutput> {
  logAgent('content-pack-generator', 'info', 'Starting Content Pack generation', {
    projectId: input.projectData.id,
    pageCount: input.pages.length,
    addons: input.addons,
  })

  const userPrompt = buildUserPrompt({
    'Brand Strategy': input.strategy.brandStrategy,
    'Content Strategy': input.strategy.contentStrategy,
    'Site Structure': input.strategy.siteStructure,
    'Project Data': {
      name: input.projectData.name,
      primaryColor: input.projectData.primaryColor,
      secondaryColor: input.projectData.secondaryColor,
      websiteStyle: input.projectData.websiteStyle,
      targetAudience: input.projectData.targetAudience,
      brief: input.projectData.brief,
      contactEmail: input.projectData.contactEmail,
      contactPhone: input.projectData.contactPhone,
      industry: input.projectData.industry,
      location: input.projectData.location,
    },
    'Pages to Generate': input.pages,
    'Enabled Addons': input.addons,
    'Your Task': `Create the complete Content Pack JSON for this website.

Key requirements:
1. Follow the brand voice: ${input.strategy.brandStrategy.toneOfVoice.primary}
2. Target audience: ${input.projectData.targetAudience}
3. Website style: ${input.projectData.websiteStyle}
4. Optimization goal: ${input.projectData.optimizationGoal}

Generate ALL content including:
- Complete site settings
- All page content with sections
- Navigation and footer
- SEO metadata for each page
- Legal pages (with {{TODO:}} placeholders for unknown facts)
- Component content (404, loading, toasts)

Make the content compelling, professional, and conversion-focused.`,
  })

  const result = await runAgent<ContentPack>({
    agentName: 'content-pack-generator',
    systemPrompt: CONTENT_PACK_SYSTEM_PROMPT,
    userPrompt,
    config: {
      maxTokens: 16000,
      timeout: 180000,
    },
  })

  if (!result.success || !result.output) {
    logAgent('content-pack-generator', 'error', 'Content Pack generation failed', {
      error: result.error?.message,
    })
    throw new Error(result.error?.message || 'Content Pack Generator failed')
  }

  // Post-process: add metadata and calculate hash
  const contentPack = result.output
  contentPack.projectId = input.projectData.id
  contentPack.generatedAt = new Date().toISOString()
  contentPack.version = '1.0.0'
  contentPack.hash = hashContent(contentPack)

  // Extract TODO markers
  const todoMarkers = extractTodoMarkers(contentPack)

  logAgent('content-pack-generator', 'info', 'Content Pack complete', {
    duration: result.duration,
    tokensUsed: result.tokensUsed,
    pageCount: contentPack.pages.length,
    sectionCount: contentPack.pages.reduce((acc, p) => acc + p.sections.length, 0),
    todoCount: todoMarkers.length,
  })

  return {
    contentPack,
    generationNotes: [
      `Generated ${contentPack.pages.length} pages`,
      `Total sections: ${contentPack.pages.reduce((acc, p) => acc + p.sections.length, 0)}`,
      `TODO markers: ${todoMarkers.length}`,
    ],
    todoMarkers,
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractTodoMarkers(obj: unknown, path = ''): TodoMarker[] {
  const markers: TodoMarker[] = []
  const todoPattern = /\{\{TODO:\s*([^}]+)\}\}/g

  function traverse(value: unknown, currentPath: string): void {
    if (typeof value === 'string') {
      let match
      while ((match = todoPattern.exec(value)) !== null) {
        markers.push({
          path: currentPath,
          placeholder: match[0],
          description: match[1].trim(),
          required: currentPath.includes('imprint') || currentPath.includes('legal'),
        })
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        traverse(item, `${currentPath}[${index}]`)
      })
    } else if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
        traverse(val, currentPath ? `${currentPath}.${key}` : key)
      })
    }
  }

  traverse(obj, path)
  return markers
}

// =============================================================================
// CONTENT PACK VALIDATION
// =============================================================================

export function validateContentPack(pack: ContentPack): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Check required fields
  if (!pack.siteSettings?.brand?.name) {
    errors.push('Missing brand name')
  }

  if (!pack.pages || pack.pages.length === 0) {
    errors.push('No pages defined')
  }

  // Check each page
  pack.pages?.forEach((page, index) => {
    if (!page.slug) {
      errors.push(`Page ${index} missing slug`)
    }
    if (!page.sections || page.sections.length === 0) {
      warnings.push(`Page "${page.name}" has no sections`)
    }
  })

  // Check navigation
  if (!pack.navigation?.items || pack.navigation.items.length === 0) {
    warnings.push('Navigation has no items')
  }

  // Check SEO
  pack.seo?.forEach((seo) => {
    if (seo.title && seo.title.length > 60) {
      warnings.push(`SEO title for ${seo.pageSlug} exceeds 60 characters`)
    }
    if (seo.description && seo.description.length > 160) {
      warnings.push(`SEO description for ${seo.pageSlug} exceeds 160 characters`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// =============================================================================
// CONTENT PACK DEFAULTS
// =============================================================================

export function getDefaultComponentContent(): ComponentContent {
  return {
    announcement: null,
    notFound: {
      headline: 'Seite nicht gefunden',
      description: 'Die gesuchte Seite existiert leider nicht oder wurde verschoben.',
      cta: {
        text: 'Zur Startseite',
        url: '/',
        variant: 'primary',
        icon: 'Home',
        iconPosition: 'left',
        openInNewTab: false,
      },
      image: null,
    },
    loading: {
      text: 'Wird geladen...',
      showSpinner: true,
    },
    error: {
      headline: 'Ein Fehler ist aufgetreten',
      description: 'Bitte versuchen Sie es später erneut oder kontaktieren Sie uns.',
      retryCta: {
        text: 'Erneut versuchen',
        url: '#',
        variant: 'primary',
        icon: 'RefreshCw',
        iconPosition: 'left',
        openInNewTab: false,
      },
    },
    toasts: {
      contactSuccess: 'Vielen Dank für Ihre Nachricht! Wir melden uns schnellstmöglich bei Ihnen.',
      contactError: 'Leider konnte Ihre Nachricht nicht gesendet werden. Bitte versuchen Sie es erneut.',
      newsletterSuccess: 'Erfolgreich für den Newsletter angemeldet!',
      newsletterError: 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.',
      genericError: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    },
  }
}
