// Supabase Edge Function: ai-worker
// Generates complete website code with full context
// Models: gpt-5.2-pro-2025-12-11 (planning), gpt-5.2-codex (code)
// Deploys to Vercel for live preview
// Supports Sanity CMS integration when addon is booked
//
// NEW: Multi-Agent System with Content Pack as Single Source of Truth
// Enable via USE_MULTI_AGENT_SYSTEM=true environment variable

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createClient as createSanityClient } from 'npm:@sanity/client@6'
import OpenAI from 'npm:openai@4'

// Multi-Agent System imports (new architecture)
import { orchestrate } from './orchestrator.ts'
import { orchestrateMultiAgent } from './orchestrator-distributed.ts'
import type { ProjectDataExtended, ProjectManagerOutput } from './types/agents.ts'
import type { ContentPack } from './types/content-pack.ts'

// Feature flag for Multi-Agent System
const USE_MULTI_AGENT_SYSTEM = Deno.env.get('USE_MULTI_AGENT_SYSTEM') === 'true'
// Use distributed agents (separate edge functions) - recommended for production
const USE_DISTRIBUTED_AGENTS = Deno.env.get('USE_DISTRIBUTED_AGENTS') !== 'false'

// Helper to avoid Deno parser issues with 'import' keyword in template literals
const IMP = 'import'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ProjectData {
  id: string
  name: string
  package_type: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  website_style: string
  optimization_goal: string
  target_audience: string
  brief: string
  selected_addons: string[]
  pages: PageData[]
  // Sanity CMS fields (populated if CMS addon booked)
  sanity_project_id?: string | null
  sanity_dataset?: string
  sanity_api_token?: string | null
  sanity_studio_url?: string | null
  // Email/Resend fields (populated if booking_form addon booked)
  contact_email?: string | null
  email_domain?: string | null
  email_domain_verified?: boolean
  resend_domain_id?: string | null
  resend_dns_records?: ResendDnsRecord[] | null
}

interface SanitySetupResult {
  projectId: string
  dataset: string
  apiToken: string
  studioUrl: string
}

interface ResendSetupResult {
  domainId: string
  dnsRecords: ResendDnsRecord[]
}

interface ResendDnsRecord {
  type: string
  name: string
  value: string
  ttl?: string
  priority?: number
}

interface PageData {
  id: string
  name: string
  slug: string
  sections: SectionData[]
}

interface SectionData {
  id: string
  section_type: string
  config: Record<string, unknown>
}

interface GenerationResult {
  success: boolean
  files: GeneratedFile[]
  error?: string
}

interface GeneratedFile {
  path: string
  content: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const workerSecret = req.headers.get('x-worker-secret')
  const expectedSecret = Deno.env.get('WORKER_SECRET') || 'internal-worker-key-2026'
  
  if (workerSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  const vercelToken = Deno.env.get('VERCEL_TOKEN') ?? ''
  const sanityManagementToken = Deno.env.get('SANITY_MANAGEMENT_TOKEN') ?? ''
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const openai = new OpenAI({ apiKey: openaiApiKey })

  let projectId: string | null = null

  try {
    const body = await req.json()
    projectId = body.projectId

    if (!projectId) {
      throw new Error('Missing projectId')
    }

    console.log('AI Worker starting for project:', projectId)

    let projectData = await fetchProjectData(supabase, projectId)
    console.log('Project data fetched:', projectData.name, projectData.pages.length, 'pages')

    // Check if CMS addon is booked and setup Sanity if needed
    const hasCmsAddon = projectData.selected_addons?.includes('cms_base')
    let sanityConfig: SanitySetupResult | null = null
    
    if (hasCmsAddon && sanityManagementToken) {
      console.log('CMS addon detected - setting up Sanity...')
      
      // Check if Sanity is already set up
      if (projectData.sanity_project_id && projectData.sanity_api_token) {
        console.log('Sanity already configured:', projectData.sanity_project_id)
        sanityConfig = {
          projectId: projectData.sanity_project_id,
          dataset: projectData.sanity_dataset || 'production',
          apiToken: projectData.sanity_api_token,
          studioUrl: projectData.sanity_studio_url || `https://${projectData.sanity_project_id}.sanity.studio`
        }
      } else {
        // Create new Sanity project
        sanityConfig = await setupSanityProject(sanityManagementToken, projectData)
        
        // Save Sanity config to database
        await supabase.from('projects').update({
          sanity_project_id: sanityConfig.projectId,
          sanity_dataset: sanityConfig.dataset,
          sanity_api_token: sanityConfig.apiToken,
          sanity_studio_url: sanityConfig.studioUrl
        }).eq('id', projectId)
        
        console.log('Sanity project created:', sanityConfig.projectId)
      }
      
      // Update projectData with Sanity config
      projectData = {
        ...projectData,
        sanity_project_id: sanityConfig.projectId,
        sanity_dataset: sanityConfig.dataset,
        sanity_api_token: sanityConfig.apiToken,
        sanity_studio_url: sanityConfig.studioUrl
      }
    }

    // Check if booking_form addon is booked and setup Resend domain if needed
    const hasBookingFormAddon = projectData.selected_addons?.includes('booking_form')
    let resendConfig: ResendSetupResult | null = null
    
    if (hasBookingFormAddon && resendApiKey && projectData.email_domain) {
      console.log('Booking form addon detected - setting up Resend domain...')
      
      try {
        // Check if Resend is already set up
        if (projectData.resend_domain_id) {
          console.log('Resend already configured:', projectData.resend_domain_id)
          resendConfig = {
            domainId: projectData.resend_domain_id,
            dnsRecords: projectData.resend_dns_records || []
          }
        } else {
          // Create new Resend domain
          resendConfig = await setupResendDomain(resendApiKey, projectData.email_domain)
          
          // Save Resend config to database
          await supabase.from('projects').update({
            resend_domain_id: resendConfig.domainId,
            resend_dns_records: resendConfig.dnsRecords,
            email_domain_verified: false
          }).eq('id', projectId)
          
          console.log('Resend domain created:', resendConfig.domainId)
        }
        
        // Update projectData with Resend config
        projectData = {
          ...projectData,
          resend_domain_id: resendConfig.domainId,
          resend_dns_records: resendConfig.dnsRecords
        }
      } catch (resendError) {
        // Log error but continue without Resend - don't block the entire generation
        console.error('Resend setup failed (continuing without email):', resendError)
        resendConfig = null
      }
    }

    // ========================================================================
    // GENERATION: Multi-Agent System or Legacy
    // ========================================================================
    
    let result: GenerationResult
    
    if (USE_MULTI_AGENT_SYSTEM) {
      console.log('🚀 Using Multi-Agent System with Content Pack')
      
      // Convert to extended project data for Multi-Agent System
      const extendedProjectData: ProjectDataExtended = {
        id: projectData.id,
        name: projectData.name,
        packageType: projectData.package_type,
        primaryColor: projectData.primary_color,
        secondaryColor: projectData.secondary_color,
        logoUrl: projectData.logo_url,
        websiteStyle: projectData.website_style,
        optimizationGoal: projectData.optimization_goal,
        targetAudience: projectData.target_audience,
        brief: projectData.brief,
        selectedAddons: projectData.selected_addons,
        pages: projectData.pages.map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          sections: p.sections.map(s => ({
            id: s.id,
            sectionType: s.section_type,
            config: s.config,
          })),
        })),
        industry: null, // TODO: Add to project form
        companySize: null,
        foundedYear: null,
        location: null,
        contactEmail: projectData.contact_email || 'kontakt@example.de',
        contactPhone: null,
        sanityProjectId: projectData.sanity_project_id || null,
        sanityDataset: projectData.sanity_dataset || 'production',
        sanityApiToken: projectData.sanity_api_token || null,
        emailDomain: projectData.email_domain || null,
        emailDomainVerified: projectData.email_domain_verified || false,
      }
      
      // Check for existing Content Pack
      const { data: existingPack } = await supabase
        .from('project_content_packs')
        .select('content')
        .eq('project_id', projectId)
        .single()
      
      let orchestratorResult: { success: boolean; files: Array<{ path: string; content: string }>; error?: string }
      
      if (USE_DISTRIBUTED_AGENTS) {
        // Use distributed agents (separate edge functions)
        // CHAIN: strategist -> content-pack -> editor -> code-renderer
        // The code-renderer (final agent) saves files to database
        console.log('🔀 Using distributed agent chain architecture')
        const distResult = await orchestrateMultiAgent({
          id: projectId,
          name: projectData.name,
          brief: projectData.brief,
          target_audience: projectData.target_audience || '',
          website_style: projectData.website_style || 'modern',
          package_type: projectData.package_type || 'basic',
          primary_color: projectData.primary_color || '#0F172A',
          secondary_color: projectData.secondary_color || '#059669',
          industry: projectData.industry,
          brand_voice: projectData.brand_voice,
          pages: projectData.pages.map(p => ({
            name: p.name,
            slug: p.slug,
            sections: p.sections.map(s => s.section_type),
          })),
        })
        
        if (!distResult.success) {
          throw new Error(`Multi-Agent generation failed: ${distResult.error}`)
        }
        
        // Files are already saved by code-renderer (final agent in chain)
        orchestratorResult = {
          success: true,
          files: distResult.codeFiles,
        }
        
        console.log(`✅ Agent chain complete: ${distResult.codeFiles.length} files, score: ${distResult.qualityScore}`)
      } else {
        // Use local orchestrator (single function)
        console.log('🔄 Using local orchestrator')
        const localResult: ProjectManagerOutput = await orchestrate({
          projectData: extendedProjectData,
          existingContentPack: existingPack?.content as ContentPack | null,
          forceRegenerate: false,
        })
        
        if (!localResult.success) {
          const errorMessages = localResult.errors.map(e => e.message).join(', ')
          throw new Error(`Multi-Agent generation failed: ${errorMessages}`)
        }
        
        orchestratorResult = {
          success: true,
          files: localResult.generatedFiles.map(f => ({ path: f.path, content: f.content })),
        }
        
        console.log(`✅ Local orchestrator complete: ${localResult.generatedFiles.length} files`)
        console.log(`📊 Quality Score: ${localResult.metrics.cacheHit ? 'cached' : 'generated'}`)
        console.log(`⏱️ Duration: ${localResult.metrics.totalDuration}ms`)
      }
      
      result = {
        success: true,
        files: orchestratorResult.files,
      }
    } else {
      // Legacy generation (existing code)
      console.log('Using legacy generation system')
      result = await generateWebsite(openai, projectData, sanityConfig, resendConfig)
    }

    if (!result.success) {
      throw new Error(result.error || 'Generation failed')
    }

    console.log('Generation complete, storing', result.files.length, 'files')

    for (const file of result.files) {
      await supabase.from('generated_files').upsert({
        project_id: projectId,
        file_path: file.path,
        content: file.content,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id,file_path'
      })
    }

    // Deploy to Vercel for live preview
    let previewUrl: string | null = null
    if (vercelToken) {
      console.log('Step 5: Deploying to Vercel...')
      try {
        const hasResendAddon = hasBookingFormAddon && resendConfig !== null
        previewUrl = await deployToVercel(
          vercelToken, 
          projectData, 
          result.files, 
          hasCmsAddon,
          hasResendAddon,
          resendApiKey || ''
        )
        console.log('Vercel deployment complete:', previewUrl)
        
        // Save preview URL to project
        await supabase.from('projects').update({ 
          preview_url: previewUrl 
        }).eq('id', projectId)

        // Update Sanity Studio URL with the actual preview URL (hidden under /{projectId})
        if (hasCmsAddon && sanityConfig && previewUrl) {
          sanityConfig.studioUrl = `${previewUrl}/${sanityConfig.projectId}`
          await supabase.from('projects').update({ 
            sanity_studio_url: sanityConfig.studioUrl 
          }).eq('id', projectId)
          console.log(`✅ Sanity Studio erreichbar unter: ${sanityConfig.studioUrl}`)
        }
      } catch (vercelError) {
        console.error('Vercel deployment failed:', vercelError)
        // Continue without Vercel - fallback to HTML preview
      }
    }

    await supabase.from('projects').update({ status: 'review' }).eq('id', projectId)

    await supabase.from('project_phases')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('phase', 'design')

    await supabase.from('project_phases')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        customer_visible_status: 'Website generiert – bereit zur Überprüfung!',
      })
      .eq('project_id', projectId).eq('phase', 'review')

    await supabase.from('activity_log').insert({
      project_id: projectId,
      actor_type: 'system',
      action: 'generation_completed',
      details: { 
        files_count: result.files.length, 
        preview_url: previewUrl,
        has_cms: hasCmsAddon,
        sanity_project_id: sanityConfig?.projectId,
        sanity_studio_url: sanityConfig?.studioUrl
      },
      customer_visible: true,
      customer_message: hasCmsAddon && sanityConfig && previewUrl
        ? `Website erfolgreich generiert! ${result.files.length} Dateien erstellt. CMS Studio verfügbar unter: ${sanityConfig.studioUrl}`
        : previewUrl 
          ? `Website erfolgreich generiert und deployed! ${result.files.length} Dateien erstellt.`
          : `Website erfolgreich generiert! ${result.files.length} Dateien erstellt.`,
    })

    console.log('AI Worker completed successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        filesCount: result.files.length, 
        previewUrl,
        sanityProjectId: sanityConfig?.projectId,
        sanityStudioUrl: sanityConfig?.studioUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('AI Worker error:', error)

    if (projectId) {
      await supabase.from('projects').update({ status: 'error' }).eq('id', projectId)
      await supabase.from('activity_log').insert({
        project_id: projectId,
        actor_type: 'system',
        action: 'generation_failed',
        details: { error: error.message },
        customer_visible: true,
        customer_message: `Generierung fehlgeschlagen: ${error.message}`,
      })
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// ============ Data Fetching ============

async function fetchProjectData(supabase: any, projectId: string): Promise<ProjectData> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    throw new Error(`Project not found: ${projectError?.message}`)
  }

  const { data: pages } = await supabase
    .from('project_pages')
    .select('id, name, slug')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  const pagesWithSections: PageData[] = []
  for (const page of (pages || [])) {
    const { data: sections } = await supabase
      .from('page_sections')
      .select('id, section_type, config')
      .eq('page_id', page.id)
      .order('sort_order', { ascending: true })

    // Load section_content for each section (includes images!)
    const sectionsWithContent = []
    for (const section of (sections || [])) {
      const { data: contentItems } = await supabase
        .from('section_content')
        .select('content_key, content_value, content_type')
        .eq('section_id', section.id)
      
      // Merge content items into config
      const mergedConfig = { ...section.config }
      for (const item of (contentItems || [])) {
        mergedConfig[item.content_key] = item.content_value
      }
      
      sectionsWithContent.push({
        ...section,
        config: mergedConfig,
      })
    }

    pagesWithSections.push({
      ...page,
      sections: sectionsWithContent,
    })
  }

  if (pagesWithSections.length === 0) {
    pagesWithSections.push(
      {
        id: 'home', name: 'Startseite', slug: '/',
        sections: [
          { id: 'hero', section_type: 'hero', config: {} },
          { id: 'features', section_type: 'features', config: {} },
          { id: 'about', section_type: 'about', config: {} },
          { id: 'testimonials', section_type: 'testimonials', config: {} },
          { id: 'cta', section_type: 'cta', config: {} },
        ],
      },
      {
        id: 'about', name: 'Über uns', slug: 'ueber-uns',
        sections: [
          { id: 'about-hero', section_type: 'hero', config: { variant: 'small' } },
          { id: 'team', section_type: 'about', config: {} },
        ],
      },
      {
        id: 'services', name: 'Leistungen', slug: 'leistungen',
        sections: [
          { id: 'services-hero', section_type: 'hero', config: { variant: 'small' } },
          { id: 'services-list', section_type: 'features', config: {} },
          { id: 'services-cta', section_type: 'cta', config: {} },
        ],
      },
      {
        id: 'contact', name: 'Kontakt', slug: 'kontakt',
        sections: [
          { id: 'contact-hero', section_type: 'hero', config: { variant: 'small' } },
          { id: 'contact-form', section_type: 'contact', config: {} },
        ],
      }
    )
  }

  return {
    id: project.id,
    name: project.name,
    package_type: project.package_type || 'starter',
    primary_color: project.primary_color || '#0F172A',
    secondary_color: project.secondary_color || '#059669',
    logo_url: project.logo_url,
    website_style: project.website_style || 'modern',
    optimization_goal: project.optimization_goal || 'conversions',
    target_audience: project.target_audience || 'Allgemein',
    brief: project.brief || '',
    selected_addons: project.selected_addons || [],
    pages: pagesWithSections,
    // Sanity fields (if present)
    sanity_project_id: project.sanity_project_id,
    sanity_dataset: project.sanity_dataset,
    sanity_api_token: project.sanity_api_token,
    sanity_studio_url: project.sanity_studio_url,
    // Email/Resend fields (if present)
    contact_email: project.contact_email,
    email_domain: project.email_domain,
    email_domain_verified: project.email_domain_verified,
    resend_domain_id: project.resend_domain_id,
    resend_dns_records: project.resend_dns_records,
  }
}

// ============ Sanity CMS Setup ============

async function setupSanityProject(
  managementToken: string,
  project: ProjectData
): Promise<SanitySetupResult> {
  const projectSlug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40)

  console.log('Creating Sanity project:', projectSlug)

  // 1. Use existing Sanity project (ID: cmrv2qwc)
  const sanityProject = { id: 'cmrv2qwc', displayName: `${project.name} Website` }
  const sanityProjectId = sanityProject.projectId || sanityProject.id
  console.log('Sanity project created:', sanityProjectId)

  // 2. Create production dataset
  const createDatasetRes = await fetch(
    `https://api.sanity.io/v2021-06-07/projects/${sanityProjectId}/datasets/production`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${managementToken}`
      },
      body: JSON.stringify({ aclMode: 'public' })
    }
  )

  if (!createDatasetRes.ok) {
    console.warn('Dataset creation warning:', await createDatasetRes.text())
  }

  // 3. Create API token for the project (unique label to avoid conflicts)
  const tokenLabel = `Website API Token - ${Date.now()}`
  
  // First, try to get existing tokens
  const listTokensRes = await fetch(
    `https://api.sanity.io/v2021-06-07/projects/${sanityProjectId}/tokens`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${managementToken}`
      }
    }
  )

  let apiToken: string | null = null

  if (listTokensRes.ok) {
    const existingTokens = await listTokensRes.json()
    // Check if we have an existing editor token we can use
    const existingEditorToken = existingTokens.find(
      (t: { roleName: string; key?: string }) => t.roleName === 'editor' && t.key
    )
    if (existingEditorToken?.key) {
      apiToken = existingEditorToken.key
      console.log('Using existing Sanity token')
    }
  }

  // If no existing token found, create a new one with unique label
  if (!apiToken) {
    const createTokenRes = await fetch(
      `https://api.sanity.io/v2021-06-07/projects/${sanityProjectId}/tokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${managementToken}`
        },
        body: JSON.stringify({
          label: tokenLabel,
          roleName: 'editor'
        })
      }
    )

    if (!createTokenRes.ok) {
      const error = await createTokenRes.text()
      throw new Error(`Failed to create Sanity token: ${error}`)
    }

    const tokenData = await createTokenRes.json()
    apiToken = tokenData.key
    console.log('Created new Sanity token')
  }

  // 4. Create initial content
  await createSanityContent(sanityProjectId, 'production', apiToken, project)

  // Return config - studioUrl will be updated after Vercel deployment
  // The embedded studio is at /{projectId} for security (hidden path)
  return {
    projectId: sanityProjectId,
    dataset: 'production',
    apiToken: apiToken,
    studioUrl: '/' + sanityProjectId // Hidden path for security
  }
}

async function createSanityContent(
  sanityProjectId: string,
  dataset: string,
  apiToken: string,
  project: ProjectData
): Promise<void> {
  const client = createSanityClient({
    projectId: sanityProjectId,
    dataset,
    token: apiToken,
    apiVersion: '2024-01-01',
    useCdn: false
  })

  // Branchenanalyse für intelligente Inhalte
  const briefAnalysis = analyzeBrief(project.name, project.brief, project.target_audience)

  console.log('Creating Sanity content for:', project.name)

  const transaction = client.transaction()

  // Site Settings
  transaction.createOrReplace({
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteName: project.name,
    siteDescription: project.brief || `Willkommen bei ${project.name}`,
    primaryColor: project.primary_color,
    secondaryColor: project.secondary_color,
    logo: project.logo_url ? { _type: 'externalImage', url: project.logo_url } : null,
    contactEmail: 'info@example.com',
    contactPhone: '+49 123 456789',
    socialLinks: []
  })

  // Hero Section
  transaction.createOrReplace({
    _id: 'hero',
    _type: 'hero',
    headline: briefAnalysis.industry.includes('Fußball') 
      ? `Kicke deine Fähigkeiten auf das nächste Level`
      : `Willkommen bei ${project.name}`,
    subheadline: briefAnalysis.services.slice(0, 2).join(' • ') + ' – und mehr',
    ctaText: briefAnalysis.mainCTA,
    ctaLink: '/kontakt',
    secondaryCtaText: 'Mehr erfahren',
    secondaryCtaLink: '/leistungen'
  })

  // Features/Services
  transaction.createOrReplace({
    _id: 'features',
    _type: 'features',
    sectionTitle: 'Unsere Leistungen',
    sectionSubtitle: `Was ${project.name} für Sie tun kann`,
    items: briefAnalysis.services.map((service, i) => ({
      _key: `feature-${i}`,
      title: service,
      description: `Professionelle ${service} für Ihre Anforderungen.`,
      icon: ['star', 'check', 'heart', 'zap'][i % 4]
    }))
  })

  // Testimonials
  transaction.createOrReplace({
    _id: 'testimonials',
    _type: 'testimonials',
    sectionTitle: 'Das sagen unsere Kunden',
    items: [
      {
        _key: 'testimonial-1',
        quote: `${project.name} hat unsere Erwartungen übertroffen. Absolute Empfehlung!`,
        author: 'Maria Schmidt',
        role: 'Geschäftsführerin',
        company: 'Beispiel GmbH'
      },
      {
        _key: 'testimonial-2',
        quote: 'Professionell, zuverlässig und immer erreichbar. Genau das haben wir gesucht.',
        author: 'Thomas Müller',
        role: 'Inhaber',
        company: 'Müller & Partner'
      }
    ]
  })

  // FAQ
  transaction.createOrReplace({
    _id: 'faq',
    _type: 'faq',
    sectionTitle: 'Häufige Fragen',
    items: [
      {
        _key: 'faq-1',
        question: `Was macht ${project.name} besonders?`,
        answer: briefAnalysis.usps.join(', ') + ' – das zeichnet uns aus.'
      },
      {
        _key: 'faq-2',
        question: 'Wie kann ich Sie kontaktieren?',
        answer: 'Sie erreichen uns telefonisch, per E-Mail oder über unser Kontaktformular. Wir melden uns innerhalb von 24 Stunden.'
      },
      {
        _key: 'faq-3',
        question: 'Welche Leistungen bieten Sie an?',
        answer: briefAnalysis.services.join(', ') + '.'
      }
    ]
  })

  // CTA Section
  transaction.createOrReplace({
    _id: 'cta',
    _type: 'cta',
    headline: 'Bereit durchzustarten?',
    description: `Kontaktieren Sie ${project.name} noch heute für ein unverbindliches Gespräch.`,
    buttonText: briefAnalysis.mainCTA,
    buttonLink: '/kontakt'
  })

  // Contact Info
  transaction.createOrReplace({
    _id: 'contact',
    _type: 'contact',
    headline: 'Kontakt aufnehmen',
    description: 'Wir freuen uns auf Ihre Nachricht.',
    email: 'info@example.com',
    phone: '+49 123 456789',
    address: 'Musterstraße 1, 12345 Musterstadt',
    openingHours: 'Mo-Fr: 9:00 - 18:00 Uhr'
  })

  await transaction.commit()
  console.log('Sanity content created successfully')
}

// ============ Resend Email Setup ============

async function setupResendDomain(
  apiKey: string,
  domain: string
): Promise<ResendSetupResult> {
  console.log('Creating Resend domain:', domain)

  const response = await fetch('https://api.resend.com/domains', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: domain }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Resend domain creation failed:', errorText)
    throw new Error(`Failed to create Resend domain: ${errorText}`)
  }

  const data = await response.json()
  console.log('Resend domain created:', data.id)

  // Extract DNS records from response
  const dnsRecords: ResendDnsRecord[] = data.records?.map((record: any) => ({
    type: record.record_type || record.type,
    name: record.name,
    value: record.value,
    ttl: record.ttl,
    priority: record.priority,
  })) || []

  return {
    domainId: data.id,
    dnsRecords,
  }
}

async function checkResendDomainVerification(
  apiKey: string,
  domainId: string
): Promise<boolean> {
  const response = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    console.warn('Domain verification check failed')
    return false
  }

  const data = await response.json()
  return data.status === 'verified'
}

// Generiert die Contact API Route für Resend
function generateContactApiRoute(
  contactEmail: string,
  emailDomain: string,
  projectName: string
): GeneratedFile {
  const routeContent = [
    IMP + " { NextResponse } from 'next/server'",
    IMP + " { Resend } from 'resend'",
    "",
    "export async function POST(req: Request) {",
    "  try {",
    "    // Initialize Resend at runtime (not build time)",
    "    const apiKey = process.env.RESEND_API_KEY",
    "    if (!apiKey) {",
    "      console.error('RESEND_API_KEY not configured')",
    "      return NextResponse.json(",
    "        { error: 'E-Mail-Service nicht konfiguriert' },",
    "        { status: 503 }",
    "      )",
    "    }",
    "    const resend = new Resend(apiKey)",
    "",
    "    const { name, email, phone, message } = await req.json()",
    "",
    "    if (!name || !email || !message) {",
    "      return NextResponse.json(",
    "        { error: 'Name, E-Mail und Nachricht sind erforderlich' },",
    "        { status: 400 }",
    "      )",
    "    }",
    "",
    "    await resend.emails.send({",
    "      from: 'Kontaktformular <kontakt@" + emailDomain + ">',",
    "      to: '" + contactEmail + "',",
    "      replyTo: email,",
    "      subject: `Neue Anfrage von ${name} - " + projectName + "`,",
    "      html: `",
    "        <div style=\"font-family: sans-serif; max-width: 600px; margin: 0 auto;\">",
    "          <h2 style=\"color: #1e293b;\">Neue Kontaktanfrage</h2>",
    "          <div style=\"background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;\">",
    "            <p><strong>Name:</strong> ${name}</p>",
    "            <p><strong>E-Mail:</strong> ${email}</p>",
    "            ${phone ? `<p><strong>Telefon:</strong> ${phone}</p>` : ''}",
    "          </div>",
    "          <div style=\"background: #fff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;\">",
    "            <p><strong>Nachricht:</strong></p>",
    "            <p style=\"white-space: pre-wrap;\">${message}</p>",
    "          </div>",
    "          <p style=\"color: #64748b; font-size: 12px; margin-top: 20px;\">",
    "            Diese E-Mail wurde über das Kontaktformular auf " + projectName + " gesendet.",
    "          </p>",
    "        </div>",
    "      `,",
    "    })",
    "",
    "    return NextResponse.json({ success: true })",
    "  } catch (error) {",
    "    console.error('Contact form error:', error)",
    "    return NextResponse.json(",
    "      { error: 'E-Mail konnte nicht gesendet werden' },",
    "      { status: 500 }",
    "    )",
    "  }",
    "}",
  ].join('\n')

  return {
    path: 'src/app/api/contact/route.ts',
    content: routeContent,
  }
}

// ============ Generation ============

async function generateWebsite(
  openai: OpenAI, 
  project: ProjectData,
  sanityConfig: SanitySetupResult | null = null,
  resendConfig: ResendSetupResult | null = null
): Promise<GenerationResult> {
  const files: GeneratedFile[] = []
  const hasCms = sanityConfig !== null

  try {
    const context = buildProjectContext(project, hasCms, sanityConfig)
    
    // STEP 1: Plan ZUERST erstellen (brauchen wir für alle anderen Generierungen)
    console.log('📋 Step 1: Creating strategic plan...')
    const plan = await createStrategicPlan(openai, project, context)
    files.push({ path: '_plan.md', content: plan })
    console.log('  ✓ Plan done')
    
    // STEP 2: Mit Plan JETZT parallel generieren
    console.log('🚀 Step 2: Parallel generation with plan...')
    
    const generationTasks: Promise<GeneratedFile | GeneratedFile[]>[] = [
      // Shared Components (Header, Footer, Button)
      (async () => {
        console.log('  → Shared components...')
        const c = await generateSharedComponents(openai, project, context, plan, hasCms, sanityConfig)
        console.log('  ✓ Shared components done')
        return c
      })(),
      
      // Alle Seiten parallel mit Plan
      ...project.pages.map(async (page, i) => {
        console.log(`  → Page ${i + 1}: ${page.name}...`)
        const reactPage = await generatePageWithRetry(openai, project, page, context, plan, '', hasCms, sanityConfig)
        const pagePath = page.slug === '/' ? 'src/app/page.tsx' : `src/app/${page.slug}/page.tsx`
        console.log(`  ✓ Page ${i + 1}: ${page.name} done`)
        return { path: pagePath, content: reactPage }
      })
    ]

    // Add Sanity lib file and Studio files if CMS is enabled
    if (hasCms && sanityConfig) {
      // Add embedded Sanity Studio files
      const hasBlogAddon = project.selected_addons?.includes('blog_module')
      const hasVisualEditing = project.selected_addons?.includes('visual_editing')
      
      // Generate Sanity lib with optional Visual Editing support
      generationTasks.push(Promise.resolve(generateSanityLib(sanityConfig, hasVisualEditing)))
      
      const studioFiles = generateSanityStudioFiles(sanityConfig, project.name, hasBlogAddon, hasVisualEditing)
      for (const file of studioFiles) {
        generationTasks.push(Promise.resolve(file))
      }
      
      // Add Blog pages if blog addon is enabled
      if (hasBlogAddon) {
        console.log('  → Adding Blog pages...')
        const blogFiles = generateBlogPages(sanityConfig, project.name)
        for (const file of blogFiles) {
          generationTasks.push(Promise.resolve(file))
        }
      }
      
      // Add Visual Editing components if addon is enabled
      if (hasVisualEditing) {
        console.log('  → Adding Visual Editing support...')
        const visualEditingFiles = generateVisualEditingFiles(sanityConfig)
        for (const file of visualEditingFiles) {
          generationTasks.push(Promise.resolve(file))
        }
      }
    }

    // Add Contact API Route if Resend is configured
    if (resendConfig && project.contact_email && project.email_domain) {
      console.log('  → Adding Contact API Route for Resend...')
      generationTasks.push(Promise.resolve(
        generateContactApiRoute(project.contact_email, project.email_domain, project.name)
      ))
    }

    const results = await Promise.all(generationTasks)
    
    // Ergebnisse zusammenführen
    for (const result of results) {
      if (Array.isArray(result)) {
        files.push(...result)
      } else {
        files.push(result)
      }
    }

    console.log('Step 4: Generating config files...')
    const configFiles = generateConfigFiles(project, hasCms, sanityConfig)
    files.push(...configFiles)

    console.log('✅ Generation complete! Total files:', files.length)
    return { success: true, files }
  } catch (error) {
    console.error('Generation error:', error)
    return { success: false, files: [], error: error.message }
  }
}

function buildProjectContext(
  project: ProjectData,
  hasCms: boolean = false,
  sanityConfig: SanitySetupResult | null = null
): string {
  // Build detailed sections overview with actual content
  const sectionsOverview = project.pages
    .map(p => {
      const sectionDetails = p.sections.map(s => {
        const contentSummary = Object.entries(s.config || {})
          .filter(([_, v]) => v) // nur nicht-leere Werte
          .map(([key, value]) => {
            const strValue = String(value)
            // Bilder markieren, Text kürzen
            if (strValue.startsWith('http')) {
              return `${key}: [BILD: ${strValue}]`
            }
            return `${key}: "${strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue}"`
          })
          .join(', ')
        return `    - ${s.section_type}${contentSummary ? `: {${contentSummary}}` : ''}`
      }).join('\n')
      return `  ${p.name} (/${p.slug === '/' ? '' : p.slug}):\n${sectionDetails}`
    })
    .join('\n\n')

  // Collect all images from sections
  const allImages: string[] = []
  for (const page of project.pages) {
    for (const section of page.sections) {
      for (const [key, value] of Object.entries(section.config || {})) {
        if (typeof value === 'string' && value.startsWith('http') && (value.includes('.jpg') || value.includes('.png') || value.includes('.webp') || value.includes('.jpeg') || value.includes('supabase'))) {
          allImages.push(`- ${section.section_type}.${key}: ${value}`)
        }
      }
    }
  }

  const imagesContext = allImages.length > 0 ? `
HOCHGELADENE BILDER (MÜSSEN VERWENDET WERDEN!):
${allImages.join('\n')}

⚠️ WICHTIG: Verwende diese Bild-URLs DIREKT in den entsprechenden Sektionen!
Beispiel: <img src="${allImages[0]?.split(': ')[1] || 'URL'}" alt="..." className="..." />
` : ''

  // Intelligente Analyse des Briefs um fehlende Infos zu ergänzen
  const briefAnalysis = analyzeBrief(project.name, project.brief, project.target_audience)

  // CMS-spezifischer Kontext
  const cmsContext = hasCms && sanityConfig ? `
================================================================================
CMS-INTEGRATION: SANITY
================================================================================
⚠️ WICHTIG: Diese Website nutzt Sanity CMS für alle Inhalte!

SANITY-KONFIGURATION:
- Project ID: ${sanityConfig.projectId}
- Dataset: ${sanityConfig.dataset}
- Studio URL: ${sanityConfig.studioUrl}

CONTENT-ABRUF:
Alle Inhalte MÜSSEN von Sanity geladen werden. Verwende die bereitgestellte Sanity-Lib.

BEISPIEL FÜR SEITEN:
\`\`\`tsx
import { sanityClient, getImageUrl } from '@/lib/sanity'

// In Server Component:
const hero = await sanityClient.fetch(\`*[_type == "hero"][0]\`)
const features = await sanityClient.fetch(\`*[_type == "features"][0]\`)
const settings = await sanityClient.fetch(\`*[_type == "siteSettings"][0]\`)

// Für Bilder - IMMER getImageUrl() verwenden (unterstützt externe UND Sanity-Bilder):
{getImageUrl(hero.backgroundImage, 1200) && (
  <img src={getImageUrl(hero.backgroundImage, 1200)!} alt="Hero" className="w-full h-auto" />
)}

// Für Logo:
{getImageUrl(settings.logo) && (
  <img src={getImageUrl(settings.logo)!} alt="Logo" className="h-10 w-auto" />
)}
\`\`\`

VERFÜGBARE CONTENT-TYPES:
- siteSettings: siteName, siteDescription, primaryColor, secondaryColor, logo, contactEmail, contactPhone
- hero: headline, subheadline, ctaText, ctaLink, secondaryCtaText, secondaryCtaLink
- features: sectionTitle, sectionSubtitle, items[{title, description, icon}]
- testimonials: sectionTitle, items[{quote, author, role, company}]
- faq: sectionTitle, items[{question, answer}]
- cta: headline, description, buttonText, buttonLink
- contact: headline, description, email, phone, address, openingHours

WICHTIGE REGELN:
1. NIEMALS hardcoded Texte - ALLES aus Sanity laden!
2. Fallback-Texte nur für den Fall dass Sanity-Daten fehlen
3. Bilder IMMER über getImageUrl() Helper laden - NIEMALS urlFor() direkt verwenden!
4. Seiten MÜSSEN Server Components sein (kein 'use client' auf Page-Level)
================================================================================
` : ''

  return `
================================================================================
PROJEKT-KONTEXT: ${project.name}
================================================================================

WICHTIGE HINWEISE FÜR DIE GENERIERUNG:
- Der Kunde hat möglicherweise nur wenige Informationen geliefert
- Ergänze fehlende Inhalte INTELLIGENT basierend auf Firmenname und Branche
- Verwende NIEMALS Platzhalter wie "Lorem ipsum" oder "[Hier Text einfügen]"
- Erstelle REALISTISCHE, professionelle Texte die zum Unternehmen passen
- Wenn die Branche unklar ist, leite sie vom Firmennamen ab
${cmsContext}
${imagesContext}
UNTERNEHMEN & MARKE:
- Firmenname: ${project.name}
- Logo: ${project.logo_url ? project.logo_url : 'Kein Logo vorhanden - verwende Text-Logo mit Firmenname'}
- Branche (abgeleitet): ${briefAnalysis.industry}
- Paket: ${project.package_type}

DESIGN-SYSTEM:
- Stil: ${project.website_style || 'modern'}
- Primärfarbe: ${project.primary_color} (Buttons, CTAs, wichtige Elemente)
- Sekundärfarbe: ${project.secondary_color} (Akzente, Hover-States, Icons)
- Logo-Einbindung: ${project.logo_url 
    ? `<img src="${project.logo_url}" alt="${project.name} Logo" class="h-8 w-auto" />` 
    : `<span class="text-xl font-bold" style="color: ${project.primary_color}">${project.name}</span>`}

⚠️ WICHTIGE FARB-REGELN (STRIKT BEFOLGEN!):
1. Primärfarbe (${project.primary_color}) NUR für:
   - Buttons und CTAs
   - Links
   - Icons/Akzente
   - NIEMALS als großflächiger Hintergrund!
2. Hintergründe:
   - Hauptbereich: bg-white oder bg-slate-50
   - Abwechslung: bg-slate-100, bg-slate-900 (dunkel)
   - Primärfarbe als BG nur bei kleinen Badges/Tags
3. Text-Kontraste:
   - Auf hellem BG (white/slate-50/100): text-slate-900 oder text-slate-700
   - Auf dunklem BG (slate-900): text-white oder text-slate-100
   - NIEMALS heller Text auf hellem Hintergrund!
   - NIEMALS dunkler Text auf dunklem Hintergrund!
4. Button-Styling:
   - Primär-Button: bg-[${project.primary_color}] text-white
   - Sekundär-Button: border-2 border-[${project.primary_color}] text-[${project.primary_color}] bg-transparent

GEBUCHTE ZUSATZLEISTUNGEN:
${project.selected_addons?.length > 0 ? project.selected_addons.join(', ') : 'Keine'}

⚠️ KONTAKTFORMULAR-REGEL:
${project.selected_addons?.includes('booking_form') 
  ? '✅ Kontaktformular GEBUCHT - Erstelle ein vollständiges Kontaktformular mit Name, E-Mail, Telefon, Nachricht'
  : '❌ Kontaktformular NICHT GEBUCHT - Erstelle KEIN Formular! Zeige stattdessen nur Kontaktdaten (Adresse, Telefon, E-Mail) und einen CTA-Button'}

ZIELGRUPPE & ZIELE:
- Zielgruppe: ${project.target_audience || briefAnalysis.targetAudience}
- Conversion-Ziel: ${project.optimization_goal || 'leads'}
- Hauptaktion: ${briefAnalysis.mainCTA}

PROJEKTBESCHREIBUNG / BRIEF:
${project.brief || `Professionelle Website für ${project.name}`}

ERGÄNZTE INFORMATIONEN (basierend auf Analyse):
- Vermutete Branche: ${briefAnalysis.industry}
- Typische Services: ${briefAnalysis.services.join(', ')}
- Empfohlene Tonalität: ${briefAnalysis.tone}
- USPs (Vorschläge): ${briefAnalysis.usps.join(', ')}

SEITENSTRUKTUR:
${sectionsOverview}

TECHNISCHE VORGABEN:
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Framer Motion für Animationen
- Lucide React Icons
- next-themes für Dark Mode
- Mobile-first Responsive Design
- SEO-optimiert
- Barrierefreiheit (ARIA, Semantic HTML)

🌙 DARK MODE (WICHTIG!):
Alle Farb-Klassen müssen Dark Mode Support haben! Verwende IMMER beide Varianten:
- Hintergründe: bg-white dark:bg-slate-900, bg-slate-50 dark:bg-slate-800, bg-slate-100 dark:bg-slate-700
- Text: text-slate-900 dark:text-white, text-slate-700 dark:text-slate-300, text-slate-600 dark:text-slate-400
- Borders: border-slate-200 dark:border-slate-700
- Cards: bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700
- Inputs: bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white

UTILITY-KLASSEN (nutze diese!):
- className="card" → Auto Dark Mode Card
- className="input" → Auto Dark Mode Input

🎨 ICONS (LUCIDE REACT):
Importiere Icons: import { ${briefAnalysis.icons.join(', ')} } from 'lucide-react'

EMPFOHLENE ICONS FÜR DIESE BRANCHE (${briefAnalysis.industry}):
${briefAnalysis.icons.map(icon => `- ${icon}`).join('\n')}

Icon-Verwendung:
- Feature-Icons: <IconName className="w-8 h-8 text-primary" />
- Button-Icons: <IconName className="w-5 h-5" />
- Listen-Icons: <IconName className="w-5 h-5 text-primary shrink-0" />

🎬 ANIMATIONEN (WICHTIG FÜR PREMIUM-QUALITÄT!):
Importiere Animation-Komponenten: import { FadeIn, SlideIn, StaggerContainer, StaggerItem, ScaleOnHover } from '@/components/ui/Motion'

ANIMATIONEN ANWENDEN:
- Hero-Headlines: <FadeIn><h1>...</h1></FadeIn>
- Hero-Subheadlines: <FadeIn delay={0.2}><p>...</p></FadeIn>
- Hero-CTAs: <FadeIn delay={0.4}>...</FadeIn>
- Feature/Service Cards: <StaggerContainer><StaggerItem>Card1</StaggerItem><StaggerItem>Card2</StaggerItem>...</StaggerContainer>
- Testimonials: <SlideIn direction="left">...</SlideIn>
- Bild-Bereiche: <SlideIn direction="right">...</SlideIn>
- Clickable Cards: <ScaleOnHover><Card>...</Card></ScaleOnHover>
- CTA-Sections: <FadeIn className="text-center">...</FadeIn>
- Listen-Items: Jedes Item in <StaggerItem> wrappen

CSS-KLASSEN FÜR HOVER:
- Buttons: Zusätzlich "btn-hover" für smooth hover-Effekt
- Cards: Zusätzlich "card-hover" für lift-Effekt bei hover

DESIGN-TOKEN-KLASSEN (NUTZE DIESE KONSISTENT!):
- Buttons Primary: bg-primary text-white hover:opacity-90 px-6 py-3 rounded-lg font-medium btn-hover
- Buttons Secondary: border-2 border-primary text-primary hover:bg-primary hover:text-white px-6 py-3 rounded-lg btn-hover dark:text-white dark:border-white dark:hover:bg-white dark:hover:text-slate-900
- Sections: py-16 md:py-24 (nutze className="section")
- Container: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 (nutze className="container-custom")
- Headings H1: text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white
- Headings H2: text-3xl md:text-4xl font-bold text-slate-900 dark:text-white
- Body Text: text-lg text-slate-600 dark:text-slate-400 leading-relaxed
- Cards: className="card card-hover" (auto dark mode)
- Badges: bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium

CONTENT-REGELN:
1. NIEMALS Platzhalter-Text verwenden
2. Alle Texte müssen zum Unternehmen "${project.name}" passen
3. Professionelle, aber zugängliche Sprache
4. Klare Call-to-Actions
5. Vertrauensaufbauende Elemente einbauen
6. Bei Bildern: Placehold.co mit passenden Farben/Beschreibungen

⛔ STRENG VERBOTEN - NIEMALS AUF DER WEBSITE ANZEIGEN:
- Interne Projektbegriffe wie "CMS", "Managed Hosting", "Addon", "Zusatzleistungen"
- Technische Paket-Namen wie "starter", "business", "premium"
- Stil-Bezeichnungen wie "playful", "modern", "corporate"
- Ziel-Begriffe wie "sales", "leads", "conversions"
- Backend-Infos wie "Sanity", "Resend", "Vercel", "Next.js"
- Jegliche Hinweise auf den Website-Generator oder automatische Erstellung
Diese Informationen sind NUR für die interne Generierung - der Endkunde darf sie NIEMALS sehen!
================================================================================`
}

// Analysiert den Brief und ergänzt fehlende Informationen intelligent
function analyzeBrief(name: string, brief: string, targetAudience: string): {
  industry: string
  services: string[]
  targetAudience: string
  mainCTA: string
  tone: string
  usps: string[]
  icons: string[]
} {
  const nameLower = name.toLowerCase()
  const briefLower = (brief || '').toLowerCase()
  const combined = `${nameLower} ${briefLower}`

  // Branchenerkennung basierend auf Keywords
  let industry = 'Dienstleistungen'
  let services: string[] = ['Beratung', 'Service', 'Support']
  let tone = 'professionell und freundlich'
  let mainCTA = 'Kontakt aufnehmen'
  let usps = ['Erfahrung', 'Qualität', 'Zuverlässigkeit']
  let icons = ['CheckCircle', 'Star', 'Users', 'Award', 'Shield', 'Clock']

  // Fußball / Sport
  if (combined.includes('kick') || combined.includes('fußball') || combined.includes('fussball') || 
      combined.includes('soccer') || combined.includes('sport') || combined.includes('camp') ||
      combined.includes('training') || combined.includes('coach')) {
    industry = 'Sport & Freizeit / Fußballcamps'
    services = ['Fußballcamps', 'Trainingseinheiten', 'Ferienfreizeiten', 'Einzeltraining']
    tone = 'sportlich, motivierend, jugendlich aber vertrauenswürdig für Eltern'
    mainCTA = 'Jetzt Platz sichern'
    usps = ['Qualifizierte Trainer', 'Spaß & Lernen', 'Sichere Betreuung', 'Kleine Gruppen']
    icons = ['Trophy', 'Users', 'Medal', 'Target', 'Calendar', 'MapPin']
  }
  // IT / Tech
  else if (combined.includes('tech') || combined.includes('software') || combined.includes('it ') ||
           combined.includes('digital') || combined.includes('web') || combined.includes('app')) {
    industry = 'IT & Technologie'
    services = ['Softwareentwicklung', 'Webdesign', 'IT-Beratung', 'Digitalisierung']
    tone = 'kompetent, innovativ, lösungsorientiert'
    mainCTA = 'Projekt besprechen'
    usps = ['Technische Expertise', 'Maßgeschneiderte Lösungen', 'Langfristiger Support']
    icons = ['Code', 'Monitor', 'Cpu', 'Zap', 'Globe', 'Layers']
  }
  // Handwerk
  else if (combined.includes('bau') || combined.includes('handwerk') || combined.includes('montage') ||
           combined.includes('sanitär') || combined.includes('elektr') || combined.includes('maler')) {
    industry = 'Handwerk'
    services = ['Neuinstallation', 'Reparatur', 'Wartung', 'Beratung']
    tone = 'bodenständig, zuverlässig, fachkompetent'
    mainCTA = 'Kostenlos anfragen'
    usps = ['Meisterbetrieb', 'Faire Preise', 'Termintreue', 'Regionale Nähe']
    icons = ['Wrench', 'Hammer', 'HardHat', 'Home', 'Settings', 'Shield']
  }
  // Gastronomie
  else if (combined.includes('restaurant') || combined.includes('café') || combined.includes('bistro') ||
           combined.includes('küche') || combined.includes('essen') || combined.includes('food')) {
    industry = 'Gastronomie'
    services = ['Speisen', 'Getränke', 'Catering', 'Events']
    tone = 'einladend, genussvoll, herzlich'
    mainCTA = 'Tisch reservieren'
    usps = ['Frische Zutaten', 'Hausgemacht', 'Gemütliche Atmosphäre']
    icons = ['UtensilsCrossed', 'ChefHat', 'Coffee', 'Wine', 'Clock', 'MapPin']
  }
  // Gesundheit / Medizin
  else if (combined.includes('praxis') || combined.includes('arzt') || combined.includes('therapie') ||
           combined.includes('pflege') || combined.includes('gesund') || combined.includes('medizin')) {
    industry = 'Gesundheit & Medizin'
    services = ['Behandlung', 'Beratung', 'Vorsorge', 'Therapie']
    tone = 'einfühlsam, kompetent, vertrauensvoll'
    mainCTA = 'Termin vereinbaren'
    usps = ['Erfahrenes Team', 'Individuelle Betreuung', 'Moderne Ausstattung']
    icons = ['Heart', 'Stethoscope', 'Activity', 'Shield', 'Clock', 'Users']
  }
  // Beratung / Consulting
  else if (combined.includes('berat') || combined.includes('consult') || combined.includes('coach') ||
           combined.includes('training') || combined.includes('workshop')) {
    industry = 'Beratung & Coaching'
    services = ['Strategieberatung', 'Workshops', 'Coaching', 'Schulungen']
    tone = 'kompetent, inspirierend, partnerschaftlich'
    mainCTA = 'Erstgespräch buchen'
    usps = ['Praxiserfahrung', 'Individuelle Ansätze', 'Messbare Ergebnisse']
    icons = ['Lightbulb', 'TrendingUp', 'Target', 'Users', 'Award', 'MessageSquare']
  }
  // E-Commerce / Handel
  else if (combined.includes('shop') || combined.includes('handel') || combined.includes('verkauf') ||
           combined.includes('produkt') || combined.includes('store')) {
    industry = 'Handel & E-Commerce'
    services = ['Produktverkauf', 'Beratung', 'Lieferung', 'Kundenservice']
    tone = 'kundenorientiert, vertrauenswürdig, serviceorientiert'
    mainCTA = 'Jetzt entdecken'
    usps = ['Große Auswahl', 'Faire Preise', 'Schneller Versand', 'Kundenservice']
    icons = ['ShoppingBag', 'Package', 'Truck', 'CreditCard', 'Star', 'Shield']
  }
  // Immobilien
  else if (combined.includes('immobil') || combined.includes('makler') || combined.includes('wohnung') ||
           combined.includes('haus') || combined.includes('miete')) {
    industry = 'Immobilien'
    services = ['Vermittlung', 'Bewertung', 'Beratung', 'Verwaltung']
    tone = 'vertrauenswürdig, professionell, serviceorientiert'
    mainCTA = 'Beratung anfordern'
    usps = ['Marktkenntnis', 'Persönliche Betreuung', 'Transparente Abwicklung']
    icons = ['Home', 'Key', 'Building', 'MapPin', 'FileText', 'Handshake']
  }

  return {
    industry,
    services,
    targetAudience: targetAudience || 'Interessierte Kunden in der Region',
    mainCTA,
    tone,
    usps,
    icons,
  }
}

async function createStrategicPlan(openai: OpenAI, project: ProjectData, context: string): Promise<string> {
  // Verwende das schnellere Codex-Modell für den Plan (statt Pro)
  const response = await openai.responses.create({
    model: 'gpt-5.2-codex',
    instructions: `Du bist ein Web-Stratege. Erstelle einen KURZEN, prägnanten Website-Plan.
Maximal 500 Wörter. Keine langen Erklärungen, nur konkrete Anweisungen.
Sprache: Deutsch.`,
    input: `${context}

AUFGABE: Kurzer Website-Plan (max 500 Wörter):

1. HEADLINES (eine pro Seite):
${project.pages.map(p => `   - ${p.name}: [headline]`).join('\n')}

2. CTA-TEXTE: Haupt-CTA und Sekundär-CTA

3. TONALITÄT: 1 Satz

4. PRO SEITE (${project.pages.map(p => p.name).join(', ')}):
   - Kernbotschaft (1 Satz)
   - Sektionen (nur Namen auflisten)

KURZ UND PRÄGNANT!`,
  })

  return extractResponseText(response)
}

async function generateSharedComponents(
  openai: OpenAI, 
  project: ProjectData, 
  context: string,
  plan: string,
  hasCms: boolean = false,
  sanityConfig: SanitySetupResult | null = null
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = []

  // Header
  const headerCmsNote = hasCms ? `
WICHTIG: Diese Website nutzt Sanity CMS!
- Lade siteSettings von Sanity für Logo, Firmenname, Navigation
- Verwende: import { sanityClient } from '@/lib/sanity'
- Fetche: const settings = await sanityClient.fetch(\`*[_type == "siteSettings"][0]\`)
- Server Component (kein 'use client' auf Page-Level)
` : ''

  const header = await openai.responses.create({
    model: 'gpt-5.2-codex',
    instructions: 'Expert React/Next.js developer. Generate production-ready TypeScript. NO markdown, ONLY code.',
    input: `${context}

PLAN-AUSZUG:
${plan.substring(0, 1500)}
${headerCmsNote}
AUFGABE: Header-Komponente (src/components/Header.tsx)

ANFORDERUNGEN:
- Responsive mit Mobile-Menu (Hamburger Icon + useState) - use 'use client'
- Sticky mit backdrop-blur
- Logo: ${project.logo_url 
    ? `Bild-Logo: <Image src="${project.logo_url}" alt="${project.name}" width={120} height={40} className="h-10 w-auto" />` 
    : `Text-Logo: <span className="text-xl font-bold" style={{color: '${project.primary_color}'}}>${project.name}</span>`}
- Navigation: ${project.pages.map(p => `"${p.name}" → "/${p.slug === '/' ? '' : p.slug}"`).join(', ')}
- CTA-Button rechts mit Primärfarbe
- Primärfarbe: ${project.primary_color}
- TypeScript + Tailwind + next/link + next/image
- Lucide Icons für Hamburger (Menu, X)
${hasCms ? '- Header muss Props für siteSettings akzeptieren können (optional)' : ''}

⚠️ DARK MODE SUPPORT (WICHTIG!):
- Background: bg-white/95 dark:bg-slate-900/95 backdrop-blur-md
- Text: text-slate-900 dark:text-white
- Links: text-slate-600 dark:text-slate-300 hover:text-primary
- Mobile Menu BG: bg-white dark:bg-slate-900
- Border: border-slate-200 dark:border-slate-700

NUR Code ausgeben.`,
  })
  files.push({ path: 'src/components/Header.tsx', content: cleanCode(extractResponseText(header)) })

  // Footer with Theme Toggle
  const footer = await openai.responses.create({
    model: 'gpt-5.2-codex',
    instructions: 'Expert React developer. TypeScript code only. NO markdown.',
    input: `${context}

Footer-Komponente (src/components/Footer.tsx)

ANFORDERUNGEN:
- 3-4 Spalten responsive (Firma, Navigation, Kontakt, Legal)
- Firmenname "${project.name}" + kurze Beschreibung
- Navigation Links zu allen Seiten
- Kontakt-Platzhalter (E-Mail, Telefon, Adresse)
- Social Icons Platzhalter (Lucide: Facebook, Instagram, Linkedin, Twitter)
- Copyright ${new Date().getFullYear()} ${project.name}
- TypeScript + Tailwind

⚠️ WICHTIG - DARK MODE FOOTER:
- Background: bg-slate-900 dark:bg-slate-950
- Text: text-slate-300, text-slate-400
- Links: text-slate-300 hover:text-white
- Trennlinie: border-slate-800

🎨 THEME TOGGLE (GANZ UNTEN IM FOOTER):
Am Ende des Footers (nach Copyright) füge den Theme-Toggle ein:
import { ThemeToggle } from '@/components/ui/ThemeToggle'

Ganz unten im Footer:
<div className="mt-8 pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
  <p className="text-sm text-slate-500">© ${new Date().getFullYear()} ${project.name}. Alle Rechte vorbehalten.</p>
  <ThemeToggle />
</div>

NUR Code.`,
  })
  files.push({ path: 'src/components/Footer.tsx', content: cleanCode(extractResponseText(footer)) })

  // Button
  const button = `'use client'

import Link from 'next/link'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  href?: string
  children: React.ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', href, children, className = '', ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2'
    
    const variants = {
      primary: 'bg-primary text-white hover:opacity-90 focus:ring-primary',
      secondary: 'bg-secondary text-white hover:opacity-90 focus:ring-secondary',
      outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-white',
      ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
    }
    
    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    }

    const classes = \`\${baseStyles} \${variants[variant]} \${sizes[size]} \${className}\`

    if (href) {
      return (
        <Link href={href} className={classes}>
          {children}
        </Link>
      )
    }

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
`
  files.push({ path: 'src/components/ui/Button.tsx', content: button })

  // Global CSS with animations and dark mode
  const styles = `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: ${project.primary_color};
  --color-secondary: ${project.secondary_color};
  --color-background: 255 255 255;
  --color-foreground: 15 23 42;
  --color-card: 255 255 255;
  --color-card-foreground: 15 23 42;
  --color-muted: 241 245 249;
  --color-muted-foreground: 100 116 139;
  --color-border: 226 232 240;
}

.dark {
  --color-background: 15 23 42;
  --color-foreground: 248 250 252;
  --color-card: 30 41 59;
  --color-card-foreground: 248 250 252;
  --color-muted: 51 65 85;
  --color-muted-foreground: 148 163 184;
  --color-border: 51 65 85;
}

@layer base {
  html {
    scroll-behavior: smooth;
  }
  body {
    @apply antialiased;
    @apply bg-white dark:bg-slate-900;
    @apply text-slate-700 dark:text-slate-300;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply text-slate-900 dark:text-white font-semibold tracking-tight;
  }
}

@layer components {
  .section {
    @apply py-16 md:py-24;
  }
  .container-custom {
    @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8;
  }
  /* Dark mode aware card */
  .card {
    @apply bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 md:p-8;
    @apply border border-slate-100 dark:border-slate-700;
  }
  /* Dark mode aware input */
  .input {
    @apply w-full px-4 py-3 rounded-lg border;
    @apply bg-white dark:bg-slate-800;
    @apply border-slate-200 dark:border-slate-600;
    @apply text-slate-900 dark:text-white;
    @apply placeholder:text-slate-400 dark:placeholder:text-slate-500;
    @apply focus:ring-2 focus:ring-primary focus:border-transparent;
    @apply transition-colors;
  }
}

/* Smooth transitions for interactive elements */
.btn-hover {
  @apply transition-all duration-300 ease-out;
}
.btn-hover:hover {
  @apply transform -translate-y-0.5 shadow-lg;
}

/* Card hover effects */
.card-hover {
  @apply transition-all duration-300 ease-out;
}
.card-hover:hover {
  @apply transform -translate-y-1 shadow-xl;
}

/* Subtle gradient animation */
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.animate-gradient {
  background-size: 200% 200%;
  animation: gradient-shift 8s ease infinite;
}

/* Pulse animation for CTAs */
@keyframes subtle-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
.animate-pulse-subtle {
  animation: subtle-pulse 3s ease-in-out infinite;
}

/* Float animation for decorative elements */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.animate-float {
  animation: float 6s ease-in-out infinite;
}
`
  files.push({ path: 'src/styles/globals.css', content: styles })

  // Motion wrapper components for animations
  const motionComponents = `'use client'

import { motion, useInView, type Variants } from 'framer-motion'
import { useRef, type ReactNode } from 'react'

// Fade in from bottom animation
export function FadeIn({ 
  children, 
  delay = 0, 
  duration = 0.5,
  className = '' 
}: { 
  children: ReactNode
  delay?: number
  duration?: number
  className?: string 
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Fade in from left/right
export function SlideIn({ 
  children, 
  direction = 'left',
  delay = 0,
  className = '' 
}: { 
  children: ReactNode
  direction?: 'left' | 'right'
  delay?: number
  className?: string 
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const x = direction === 'left' ? -30 : 30

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x }}
      animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Staggered children animation
export function StaggerContainer({ 
  children, 
  staggerDelay = 0.1,
  className = '' 
}: { 
  children: ReactNode
  staggerDelay?: number
  className?: string 
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  }

  return (
    <motion.div
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ 
  children,
  className = '' 
}: { 
  children: ReactNode
  className?: string 
}) {
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  }

  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  )
}

// Scale on hover
export function ScaleOnHover({ 
  children,
  scale = 1.02,
  className = '' 
}: { 
  children: ReactNode
  scale?: number
  className?: string 
}) {
  return (
    <motion.div
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Counter animation for numbers
export function CountUp({ 
  value, 
  duration = 2,
  suffix = '',
  className = '' 
}: { 
  value: number
  duration?: number
  suffix?: string
  className?: string 
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
    >
      {isInView && (
        <motion.span
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
        >
          {value}{suffix}
        </motion.span>
      )}
    </motion.span>
  )
}
`
  files.push({ path: 'src/components/ui/Motion.tsx', content: motionComponents })

  // Scroll Progress Bar component
  const scrollProgress = `'use client'

import { motion, useScroll, useSpring } from 'framer-motion'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-primary z-50 origin-left"
      style={{ scaleX }}
    />
  )
}
`
  files.push({ path: 'src/components/ui/ScrollProgress.tsx', content: scrollProgress })

  // Back to Top button component
  const backToTop = `'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp } from 'lucide-react'

export function BackToTop() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300)
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-primary text-white shadow-lg hover:shadow-xl transition-shadow btn-hover"
          aria-label="Nach oben scrollen"
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
`
  files.push({ path: 'src/components/ui/BackToTop.tsx', content: backToTop })

  // Skeleton loading component
  const skeleton = `import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200 dark:bg-slate-700',
        className
      )}
      {...props}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="card space-y-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-10 w-32 mt-4" />
    </div>
  )
}

export function SkeletonHero() {
  return (
    <div className="section">
      <div className="container-custom">
        <div className="max-w-3xl space-y-6">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
          <div className="flex gap-4 mt-8">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
`
  files.push({ path: 'src/components/ui/Skeleton.tsx', content: skeleton })

  // Theme toggle component for footer
  const themeToggle = `'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
      <button
        onClick={() => setTheme('light')}
        className={\`p-2 rounded-md transition-colors \${theme === 'light' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}\`}
        aria-label="Helles Design"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={\`p-2 rounded-md transition-colors \${theme === 'dark' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}\`}
        aria-label="Dunkles Design"
      >
        <Moon className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={\`p-2 rounded-md transition-colors \${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}\`}
        aria-label="Systemeinstellung"
      >
        <Monitor className="w-4 h-4" />
      </button>
    </div>
  )
}
`
  files.push({ path: 'src/components/ui/ThemeToggle.tsx', content: themeToggle })

  // Utils file with cn helper
  const utils = `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`
  files.push({ path: 'src/lib/utils.ts', content: utils })

  return files
}

async function generateReactPage(
  openai: OpenAI,
  project: ProjectData,
  page: PageData,
  context: string,
  plan: string,
  previousError: string = '',
  hasCms: boolean = false,
  sanityConfig: SanitySetupResult | null = null
): Promise<string> {
  const sectionsDesc = page.sections.map(s => `- ${s.section_type.toUpperCase()}`).join('\n')
  const hasContactForm = project.selected_addons?.includes('booking_form')

  // CMS-spezifische Instruktionen
  const cmsInstructions = hasCms ? `
⚠️ WICHTIG: SANITY CMS INTEGRATION
Diese Website nutzt Sanity CMS - ALLE Inhalte müssen von Sanity geladen werden!

IMPORTS (am Anfang der Datei):
import { sanityClient } from '@/lib/sanity'

DATEN LADEN (vor dem return):
const hero = await sanityClient.fetch(\`*[_type == "hero"][0]\`)
const features = await sanityClient.fetch(\`*[_type == "features"][0]\`)
const testimonials = await sanityClient.fetch(\`*[_type == "testimonials"][0]\`)
const faq = await sanityClient.fetch(\`*[_type == "faq"][0]\`)
const cta = await sanityClient.fetch(\`*[_type == "cta"][0]\`)
const contact = await sanityClient.fetch(\`*[_type == "contact"][0]\`)

DATEN VERWENDEN:
- {hero?.headline} statt hardcoded Text
- {features?.items?.map(...)} für Listen
- Fallbacks: {hero?.headline || 'Willkommen'}

SEITE MUSS SERVER COMPONENT SEIN (kein 'use client' am Anfang)!
` : ''

  const response = await openai.responses.create({
    model: 'gpt-5.2-codex',
    instructions: `Expert Next.js 14 developer. Generate complete page with ALL sections inline.
TypeScript, Tailwind CSS, Framer Motion für Animationen. Production-ready code.
WICHTIG: Achte auf korrekte Farbkontraste! Heller Text NUR auf dunklem Hintergrund!
${hasCms ? 'WICHTIG: Lade ALLE Inhalte von Sanity CMS!' : ''}
Return ONLY code, NO markdown.
${previousError ? `\n⚠️ ${previousError}` : ''}`,
    input: `${context}

PLAN-AUSZUG:
${plan.substring(0, 2000)}
${cmsInstructions}
================================================================================
SEITE: ${page.name} (/${page.slug === '/' ? '' : page.slug})
================================================================================

SEKTIONEN:
${sectionsDesc}

⚠️ FARB-REGELN (STRIKT BEFOLGEN!):
- Primärfarbe ${project.primary_color} NUR für Buttons, Links, kleine Akzente
- Hintergründe: bg-white dark:bg-slate-900, bg-slate-50 dark:bg-slate-800, bg-slate-100 dark:bg-slate-700
- Text auf hellem BG: text-slate-900 dark:text-white oder text-slate-700 dark:text-slate-300
- Text auf dunklem BG (slate-900): text-white
- NIEMALS Primärfarbe als großflächiger Hintergrund!
- NIEMALS heller Text auf hellem Hintergrund!
- IMMER dark: Varianten für alle Farb-Klassen!

${page.slug === 'kontakt' ? `
⚠️ KONTAKTSEITE SPEZIAL:
${hasContactForm 
  ? '✅ Kontaktformular GEBUCHT - Erstelle Formular mit: Name, E-Mail, Telefon (optional), Nachricht, Submit-Button. Verwende className="input" für alle Inputs!'
  : '❌ KEIN Kontaktformular! Zeige NUR: Firmenadresse, Telefonnummer, E-Mail-Adresse, Öffnungszeiten, Google Maps Platzhalter, CTA-Button "Jetzt anrufen"'}
` : ''}

🎨 ICONS (LUCIDE REACT):
Importiere: import { CheckCircle, Star, ArrowRight, Phone, Mail, MapPin } from 'lucide-react'
Verwende Icons für Features, Listen, Buttons!

🎬 ANIMATIONEN (PREMIUM QUALITÄT!):
Importiere: import { FadeIn, SlideIn, StaggerContainer, StaggerItem, ScaleOnHover } from '@/components/ui/Motion'

ANIMATIONEN PRO SEKTION:
- HERO: <FadeIn> für Headline, <FadeIn delay={0.2}> für Subline, <FadeIn delay={0.4}> für Buttons
- FEATURES/SERVICES: <StaggerContainer className="grid..."><StaggerItem> pro Card</StaggerItem></StaggerContainer>
- TESTIMONIALS: <SlideIn direction="left"> für Text, <SlideIn direction="right"> für Bild/Avatar
- ABOUT: <SlideIn direction="left"> für Text-Bereich, <SlideIn direction="right"> für Bild
- CTA: <FadeIn className="text-center"> für den gesamten CTA-Block
- FAQ: <StaggerContainer><StaggerItem> pro FAQ-Item</StaggerItem></StaggerContainer>
- CARDS: Umhülle clickable Cards mit <ScaleOnHover>

Füge "btn-hover" zu allen Buttons hinzu für smooth hover-Effekt!
Nutze className="card card-hover" für alle Cards (auto Dark Mode)!

ANFORDERUNGEN:
1. Import Header/Footer from '@/components/Header', '@/components/Footer'
2. Import Animation-Komponenten von '@/components/ui/Motion'
3. Import Icons von 'lucide-react'
4. ALLE Sektionen INLINE in dieser Datei implementieren
5. REALISTISCHER Content für "${project.name}" (KEIN Lorem ipsum!)
6. Bilder: https://placehold.co/800x600
7. Responsive (mobile-first)
8. Buttons: bg-primary text-white hover:opacity-90 btn-hover
9. Semantic HTML, ARIA labels
10. h1 nur EINMAL pro Seite
11. ANIMATIONEN für alle Sektionen!
12. DARK MODE: Alle Farben mit dark: Varianten!

SEKTIONS-SPECS:
- hero: Headline (FadeIn), Subline (FadeIn delay), 1-2 CTAs (FadeIn delay), Gradient/Bild, bg-white dark:bg-slate-900
- features: 3-6 Features (StaggerContainer + StaggerItem), mit Lucide Icons, Titel, Text, bg-slate-50 dark:bg-slate-800
- about: Story/Team (SlideIn left), Bild (SlideIn right), bg-white dark:bg-slate-900
- testimonials: 2-3 Kundenstimmen (StaggerContainer), bg-slate-50 dark:bg-slate-800
- cta: Banner (FadeIn) mit Text + Button, bg-primary oder bg-slate-900 dark:bg-slate-800
- contact: Formular (className="input") + Kontaktinfo (SlideIn), Icons für Kontaktdaten
- faq: 4-6 Accordion Items (StaggerContainer), bg-white dark:bg-slate-900
- pricing: 2-3 Preispläne (StaggerContainer + ScaleOnHover), className="card card-hover"

Generiere die komplette Seite als TypeScript/React Code.`,
  })

  return cleanCode(extractResponseText(response))
}

function generateConfigFiles(
  project: ProjectData,
  hasCms: boolean = false,
  sanityConfig: SanitySetupResult | null = null
): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // tailwind.config.ts with dark mode support
  files.push({
    path: 'tailwind.config.ts',
    content: [
      IMP + " type { Config } from 'tailwindcss'",
      "",
      "const config: Config = {",
      "  content: [",
      "    './src/**/*.{js,ts,jsx,tsx,mdx}',",
      "  ],",
      "  darkMode: 'class',",
      "  theme: {",
      "    extend: {",
      "      colors: {",
      "        primary: '" + project.primary_color + "',",
      "        secondary: '" + project.secondary_color + "',",
      "      },",
      "    },",
      "  },",
      "  plugins: [],",
      "}",
      "",
      "export default config",
    ].join('\n')
  })

  // layout.tsx - sanitize description (remove newlines, escape quotes)
  const sanitizedDescription = (project.brief || project.name)
    .replace(/[\r\n]+/g, ' ')
    .replace(/'/g, "")
    .substring(0, 155)
    .trim()

  // Generate base URL for metadata
  const baseUrl = 'https://' + project.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '.vercel.app'

  files.push({
    path: 'src/app/layout.tsx',
    content: [
      IMP + " type { Metadata } from 'next'",
      IMP + " { Inter } from 'next/font/google'",
      IMP + " { ThemeProvider } from 'next-themes'",
      IMP + " '@/styles/globals.css'",
      IMP + " { ScrollProgress } from '@/components/ui/ScrollProgress'",
      IMP + " { BackToTop } from '@/components/ui/BackToTop'",
      "",
      "const inter = Inter({ subsets: ['latin'] })",
      "",
      "export const metadata: Metadata = {",
      "  title: {",
      "    default: '" + project.name + "',",
      "    template: '%s | " + project.name + "',",
      "  },",
      "  description: '" + sanitizedDescription + "',",
      "  metadataBase: new URL('" + baseUrl + "'),",
      "  openGraph: {",
      "    type: 'website',",
      "    locale: 'de_DE',",
      "    siteName: '" + project.name + "',",
      "    title: '" + project.name + "',",
      "    description: '" + sanitizedDescription + "',",
      "  },",
      "  twitter: {",
      "    card: 'summary_large_image',",
      "    title: '" + project.name + "',",
      "    description: '" + sanitizedDescription + "',",
      "  },",
      "  robots: {",
      "    index: true,",
      "    follow: true,",
      "  },",
      "}",
      "",
      "// JSON-LD Structured Data for Local Business",
      "const jsonLd = {",
      "  '@context': 'https://schema.org',",
      "  '@type': 'LocalBusiness',",
      "  name: '" + project.name + "',",
      "  description: '" + sanitizedDescription + "',",
      "  url: '" + baseUrl + "',",
      "  logo: '" + (project.logo_url || baseUrl + '/opengraph-image') + "',",
      "}",
      "",
      "export default function RootLayout({ children }: { children: React.ReactNode }) {",
      "  return (",
      "    <html lang=\"de\" suppressHydrationWarning>",
      "      <head>",
      "        <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />",
      "        <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossOrigin=\"anonymous\" />",
      "        <script",
      "          type=\"application/ld+json\"",
      "          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}",
      "        />",
      "      </head>",
      "      <body className={`${inter.className} bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors`}>",
      "        <ThemeProvider attribute=\"class\" defaultTheme=\"system\" enableSystem disableTransitionOnChange>",
      "          <a href=\"#main-content\" className=\"sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-lg\">",
      "            Zum Hauptinhalt springen",
      "          </a>",
      "          <ScrollProgress />",
      "          <main id=\"main-content\">",
      "            {children}",
      "          </main>",
      "          <BackToTop />",
      "        </ThemeProvider>",
      "      </body>",
      "    </html>",
      "  )",
      "}",
    ].join('\n')
  })

  // OG Image generator
  files.push({
    path: 'src/app/opengraph-image.tsx',
    content: [
      IMP + " { ImageResponse } from 'next/og'",
      "",
      "export const runtime = 'edge'",
      "export const alt = '" + project.name + "'",
      "export const size = { width: 1200, height: 630 }",
      "export const contentType = 'image/png'",
      "",
      "export default async function Image() {",
      "  return new ImageResponse(",
      "    (",
      "      <div",
      "        style={{",
      "          fontSize: 64,",
      "          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',",
      "          width: '100%',",
      "          height: '100%',",
      "          display: 'flex',",
      "          flexDirection: 'column',",
      "          alignItems: 'center',",
      "          justifyContent: 'center',",
      "          color: 'white',",
      "          padding: 48,",
      "        }}",
      "      >",
      "        <div",
      "          style={{",
      "            display: 'flex',",
      "            alignItems: 'center',",
      "            justifyContent: 'center',",
      "            marginBottom: 24,",
      "            width: 100,",
      "            height: 100,",
      "            borderRadius: 24,",
      "            background: '" + project.primary_color + "',",
      "            fontSize: 48,",
      "            fontWeight: 700,",
      "          }}",
      "        >",
      "          " + project.name.charAt(0).toUpperCase(),
      "        </div>",
      "        <div style={{ fontWeight: 700, textAlign: 'center', marginBottom: 16 }}>",
      "          " + project.name,
      "        </div>",
      "        <div style={{ fontSize: 28, opacity: 0.8, textAlign: 'center', maxWidth: 800 }}>",
      "          " + sanitizedDescription.substring(0, 100),
      "        </div>",
      "      </div>",
      "    ),",
      "    { ...size }",
      "  )",
      "}",
    ].join('\n')
  })

  // Sitemap generator
  const pageUrls = project.pages.map(p => {
    const slug = p.slug === '/' ? '' : p.slug
    const priority = p.slug === '/' ? '1' : '0.8'
    return [
      "    {",
      "      url: '" + baseUrl + "/" + slug + "',",
      "      lastModified: new Date(),",
      "      changeFrequency: 'weekly' as const,",
      "      priority: " + priority + ",",
      "    }",
    ].join('\n')
  }).join(',\n')

  files.push({
    path: 'src/app/sitemap.ts',
    content: [
      IMP + " { MetadataRoute } from 'next'",
      "",
      "export default function sitemap(): MetadataRoute.Sitemap {",
      "  return [",
      pageUrls,
      "  ]",
      "}",
    ].join('\n')
  })

  // Check if AI indexing should be blocked (addon option)
  const blockAiIndexing = project.selected_addons?.includes('block_ai_indexing')

  // Robots.txt with AI-Bot rules
  const robotsRules = blockAiIndexing
    ? [
        "    // Block all AI training bots",
        "    {",
        "      userAgent: ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Amazonbot', 'Google-Extended', 'CCBot', 'FacebookBot', 'anthropic-ai', 'Bytespider', 'Diffbot', 'ImagesiftBot', 'Omgilibot', 'YouBot'],",
        "      disallow: '/',",
        "    },",
        "    // Allow regular search engines",
        "    {",
        "      userAgent: '*',",
        "      allow: '/',",
        "    },",
      ]
    : [
        "    // Allow AI assistants and search bots for better discoverability",
        "    {",
        "      userAgent: ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'Googlebot', 'Bingbot'],",
        "      allow: '/',",
        "    },",
        "    // Allow all other bots",
        "    {",
        "      userAgent: '*',",
        "      allow: '/',",
        "    },",
      ]

  files.push({
    path: 'src/app/robots.ts',
    content: [
      IMP + " { MetadataRoute } from 'next'",
      "",
      "export default function robots(): MetadataRoute.Robots {",
      "  return {",
      "    rules: [",
      ...robotsRules,
      "    ],",
      "    sitemap: '" + baseUrl + "/sitemap.xml',",
      "  }",
      "}",
    ].join('\n')
  })

  // Generate llms.txt for LLM crawlers (only if not blocked)
  if (!blockAiIndexing) {
    const services = project.pages
      .flatMap(p => p.sections)
      .filter(s => s.section_type === 'features' || s.section_type === 'services')
      .flatMap(s => {
        const items = (s.config as any)?.items || []
        return items.map((item: any) => item?.title || item?.name).filter(Boolean)
      })
    
    const uniqueServices = [...new Set(services)].slice(0, 6)
    const servicesList = uniqueServices.length > 0 
      ? uniqueServices.map(s => '- ' + s).join('\n')
      : '- Professionelle Dienstleistungen\n- Individuelle Beratung\n- Qualitätsservice'

    const llmsTxtContent = [
      "# " + project.name,
      "",
      "> " + sanitizedDescription,
      "",
      "## Über uns",
      project.brief ? project.brief.substring(0, 500) : "Wir sind " + project.name + " - Ihr kompetenter Partner.",
      "",
      "## Unsere Leistungen",
      servicesList,
      "",
      "## Kontakt",
      "- Website: " + baseUrl,
      project.contact_email ? "- E-Mail: " + project.contact_email : "",
      "",
      "## Weitere Informationen",
      "- Sitemap: " + baseUrl + "/sitemap.xml",
      "- Alle Seiten: " + project.pages.map(p => baseUrl + (p.slug === '/' ? '' : '/' + p.slug)).join(', '),
    ].filter(line => line !== "").join('\n')

    files.push({
      path: 'public/llms.txt',
      content: llmsTxtContent
    })

    const pageDescriptions = project.pages.map(p => {
      const sectionTypes = p.sections.map(s => s.section_type).join(', ')
      return "### " + p.name + "\nURL: " + baseUrl + (p.slug === '/' ? '' : '/' + p.slug) + "\nInhalte: " + sectionTypes
    }).join('\n\n')

    const llmsFullContent = [
      "# " + project.name + " - Vollständige Informationen",
      "",
      "> " + sanitizedDescription,
      "",
      "## Unternehmensbeschreibung",
      project.brief || "Professionelles Unternehmen mit Fokus auf Qualität und Kundenzufriedenheit.",
      "",
      "## Zielgruppe",
      project.target_audience || "Kunden die Wert auf Qualität legen",
      "",
      "## Unsere Leistungen",
      servicesList,
      "",
      "## Seitenstruktur",
      pageDescriptions,
      "",
      "## Kontaktmöglichkeiten",
      "Website: " + baseUrl,
      project.contact_email ? "E-Mail: " + project.contact_email : "",
      "",
      "## Technische Informationen",
      "- Sitemap: " + baseUrl + "/sitemap.xml",
      "- Robots: " + baseUrl + "/robots.txt",
      "- Sprache: Deutsch (de)",
      "",
      "---",
      "Diese Informationen wurden für AI-Assistenten optimiert bereitgestellt.",
    ].filter(line => line !== "").join('\n')

    files.push({
      path: 'public/llms-full.txt',
      content: llmsFullContent
    })
  }

  // 404 Not Found page
  files.push({
    path: 'src/app/not-found.tsx',
    content: [
      IMP + " Link from 'next/link'",
      "",
      "export default function NotFound() {",
      "  return (",
      "    <div className=\"min-h-screen flex items-center justify-center bg-white dark:bg-slate-900\">",
      "      <div className=\"text-center px-4\">",
      "        <h1 className=\"text-9xl font-bold text-primary\">404</h1>",
      "        <h2 className=\"text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white mt-4\">",
      "          Seite nicht gefunden",
      "        </h2>",
      "        <p className=\"text-slate-600 dark:text-slate-400 mt-4 max-w-md mx-auto\">",
      "          Die gesuchte Seite existiert leider nicht oder wurde verschoben.",
      "        </p>",
      "        <Link",
      "          href=\"/\"",
      "          className=\"inline-flex items-center justify-center mt-8 px-6 py-3 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition-opacity btn-hover\"",
      "        >",
      "          Zurück zur Startseite",
      "        </Link>",
      "      </div>",
      "    </div>",
      "  )",
      "}",
    ].join('\n')
  })

  // Error page
  files.push({
    path: 'src/app/error.tsx',
    content: [
      "'use client'",
      "",
      IMP + " { useEffect } from 'react'",
      "",
      "export default function Error({",
      "  error,",
      "  reset,",
      "}: {",
      "  error: Error & { digest?: string }",
      "  reset: () => void",
      "}) {",
      "  useEffect(() => {",
      "    console.error(error)",
      "  }, [error])",
      "",
      "  return (",
      "    <div className=\"min-h-screen flex items-center justify-center bg-white dark:bg-slate-900\">",
      "      <div className=\"text-center px-4\">",
      "        <h1 className=\"text-6xl font-bold text-red-500\">Fehler</h1>",
      "        <h2 className=\"text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white mt-4\">",
      "          Etwas ist schiefgelaufen",
      "        </h2>",
      "        <p className=\"text-slate-600 dark:text-slate-400 mt-4 max-w-md mx-auto\">",
      "          Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
      "        </p>",
      "        <button",
      "          onClick={() => reset()}",
      "          className=\"inline-flex items-center justify-center mt-8 px-6 py-3 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition-opacity btn-hover\"",
      "        >",
      "          Erneut versuchen",
      "        </button>",
      "      </div>",
      "    </div>",
      "  )",
      "}",
    ].join('\n')
  })

  return files
}

// Generiert die Sanity Client Library
function generateSanityLib(sanityConfig: SanitySetupResult, hasVisualEditing: boolean = false): GeneratedFile {
  const contentLines = [
    "import { createClient } from '@sanity/client'",
    "import imageUrlBuilder from '@sanity/image-url'",
    "",
    "export const sanityClient = createClient({",
    "  projectId: '" + sanityConfig.projectId + "',",
    "  dataset: '" + sanityConfig.dataset + "',",
    "  apiVersion: '2024-01-01',",
    "  useCdn: true,",
    "})",
  ]
  
  // Add preview client for Visual Editing
  if (hasVisualEditing) {
    contentLines.push(
      "",
      "// Preview Client für Draft Mode (Visual Editing)",
      "export const previewClient = createClient({",
      "  projectId: '" + sanityConfig.projectId + "',",
      "  dataset: '" + sanityConfig.dataset + "',",
      "  apiVersion: '2024-01-01',",
      "  useCdn: false,",
      "  perspective: 'previewDrafts',",
      "  token: process.env.SANITY_API_READ_TOKEN,",
      "})",
      "",
      "// Helper function to get the right client",
      "export function getClient(preview = false) {",
      "  return preview ? previewClient : sanityClient",
      "}"
    )
  }
  
  // Add the rest of the content
  contentLines.push(
    "",
    "const builder = imageUrlBuilder(sanityClient)",
    "",
    "// eslint-disable-next-line @typescript-eslint/no-explicit-any",
    "export function isExternalImage(source: any): boolean {",
    "  return !!source && typeof source === 'object' && '_type' in source && source._type === 'externalImage'",
    "}",
    "",
    "// eslint-disable-next-line @typescript-eslint/no-explicit-any",
    "export function getImageUrl(source: any, width?: number): string | null {",
    "  if (!source) return null",
    "  if (isExternalImage(source)) return source.url as string",
    "  try {",
    "    const img = builder.image(source)",
    "    return width ? img.width(width).url() : img.url()",
    "  } catch {",
    "    return null",
    "  }",
    "}",
    "",
    "// eslint-disable-next-line @typescript-eslint/no-explicit-any",
    "export function urlFor(source: any) {",
    "  return builder.image(source)",
    "}",
    "",
    "export interface SiteSettings {",
    "  siteName: string",
    "  siteDescription: string",
    "  primaryColor: string",
    "  secondaryColor: string",
    "  logo?: { url: string }",
    "  contactEmail: string",
    "  contactPhone: string",
    "}",
    "",
    "export interface HeroContent {",
    "  headline: string",
    "  subheadline: string",
    "  ctaText: string",
    "  ctaLink: string",
    "  secondaryCtaText?: string",
    "  secondaryCtaLink?: string",
    "  // eslint-disable-next-line @typescript-eslint/no-explicit-any",
    "  backgroundImage?: any",
    "}",
    "",
    "export interface FeatureItem {",
    "  _key: string",
    "  title: string",
    "  description: string",
    "  icon: string",
    "}",
    "export interface FeaturesContent {",
    "  sectionTitle: string",
    "  sectionSubtitle?: string",
    "  items: FeatureItem[]",
    "}",
    "",
    "export interface TestimonialItem {",
    "  _key: string",
    "  quote: string",
    "  author: string",
    "  role: string",
    "  company?: string",
    "}",
    "",
    "export interface TestimonialsContent {",
    "  sectionTitle: string",
    "  items: TestimonialItem[]",
    "}",
    "",
    "export interface FaqItem {",
    "  _key: string",
    "  question: string",
    "  answer: string",
    "}",
    "",
    "export interface FaqContent {",
    "  sectionTitle: string",
    "  items: FaqItem[]",
    "}",
    "",
    "export interface CtaContent {",
    "  headline: string",
    "  description: string",
    "  buttonText: string",
    "  buttonLink: string",
    "}",
    "",
    "export interface ContactContent {",
    "  headline: string",
    "  description: string",
    "  email: string",
    "  phone: string",
    "  address: string",
    "  openingHours: string",
    "}",
    "",
    "export const queries = {",
    '  siteSettings: \'*[_type == "siteSettings"][0]\',',
    '  hero: \'*[_type == "hero"][0]\',',
    '  features: \'*[_type == "features"][0]\',',
    '  testimonials: \'*[_type == "testimonials"][0]\',',
    '  faq: \'*[_type == "faq"][0]\',',
    '  cta: \'*[_type == "cta"][0]\',',
    '  contact: \'*[_type == "contact"][0]\',',
    "}"
  )

  return {
    path: 'src/lib/sanityClient.ts',
    content: contentLines.join('\n'),
  }
}

// Generiert die Sanity Studio Dateien (eingebettet in Next.js)
function generateSanityStudioFiles(sanityConfig: SanitySetupResult, projectName: string, hasBlog: boolean = false, hasVisualEditing: boolean = false): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // 1. sanity.config.ts (Root-Level) - Studio unter /{projectId} für erhöhte Sicherheit
  files.push({
    path: 'sanity.config.ts',
    content: [
      IMP + " { defineConfig } from 'sanity'",
      IMP + " { structureTool } from 'sanity/structure'",
      IMP + " { schemaTypes } from './sanity/schemaTypes'",
      "",
      "export default defineConfig({",
      "  name: 'default',",
      "  title: '" + projectName + "',",
      "",
      "  projectId: '" + sanityConfig.projectId + "',",
      "  dataset: '" + sanityConfig.dataset + "',",
      "  basePath: '/" + sanityConfig.projectId + "',",
      "",
      "  plugins: [structureTool()],",
      "",
      "  schema: {",
      "    types: schemaTypes,",
      "  },",
      "})",
    ].join('\n')
  })

  // 2. sanity/schemaTypes/index.ts - dynamisch mit Blog-Schemas
  const schemaImports = [
    IMP + " siteSettings from './siteSettings'",
    IMP + " hero from './hero'",
    IMP + " features from './features'",
    IMP + " testimonials from './testimonials'",
    IMP + " faq from './faq'",
    IMP + " cta from './cta'",
    IMP + " contact from './contact'",
  ]
  const schemaExports = [
    "  siteSettings,",
    "  hero,",
    "  features,",
    "  testimonials,",
    "  faq,",
    "  cta,",
    "  contact,",
  ]
  
  // Add Blog schemas if addon enabled
  if (hasBlog) {
    schemaImports.push(IMP + " post from './post'")
    schemaImports.push(IMP + " author from './author'")
    schemaImports.push(IMP + " category from './category'")
    schemaExports.push("  post,")
    schemaExports.push("  author,")
    schemaExports.push("  category,")
  }
  
  files.push({
    path: 'sanity/schemaTypes/index.ts',
    content: [
      ...schemaImports,
      "",
      "export const schemaTypes = [",
      ...schemaExports,
      "]",
    ].join('\n')
  })

  // 3. Schema: siteSettings
  files.push({
    path: 'sanity/schemaTypes/siteSettings.ts',
    content: [
      IMP + " { defineType, defineField } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'siteSettings',",
      "  title: 'Website Einstellungen',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'siteName', title: 'Website Name', type: 'string' }),",
      "    defineField({ name: 'siteDescription', title: 'Beschreibung', type: 'text' }),",
      "    defineField({ name: 'primaryColor', title: 'Primärfarbe', type: 'string' }),",
      "    defineField({ name: 'secondaryColor', title: 'Sekundärfarbe', type: 'string' }),",
      "    defineField({ name: 'logo', title: 'Logo', type: 'image', options: { hotspot: true } }),",
      "    defineField({ name: 'contactEmail', title: 'E-Mail', type: 'string' }),",
      "    defineField({ name: 'contactPhone', title: 'Telefon', type: 'string' }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // 4. Schema: hero
  files.push({
    path: 'sanity/schemaTypes/hero.ts',
    content: [
      IMP + " { defineType, defineField } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'hero',",
      "  title: 'Hero Sektion',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'headline', title: 'Überschrift', type: 'string' }),",
      "    defineField({ name: 'subheadline', title: 'Unterüberschrift', type: 'text' }),",
      "    defineField({ name: 'backgroundImage', title: 'Hintergrundbild', type: 'image', options: { hotspot: true } }),",
      "    defineField({ name: 'ctaText', title: 'Button Text', type: 'string' }),",
      "    defineField({ name: 'ctaLink', title: 'Button Link', type: 'string' }),",
      "    defineField({ name: 'secondaryCtaText', title: 'Zweiter Button Text', type: 'string' }),",
      "    defineField({ name: 'secondaryCtaLink', title: 'Zweiter Button Link', type: 'string' }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // 5. Schema: features
  files.push({
    path: 'sanity/schemaTypes/features.ts',
    content: [
      IMP + " { defineType, defineField, defineArrayMember } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'features',",
      "  title: 'Leistungen',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'sectionTitle', title: 'Titel', type: 'string' }),",
      "    defineField({ name: 'sectionSubtitle', title: 'Untertitel', type: 'text' }),",
      "    defineField({",
      "      name: 'items',",
      "      title: 'Features',",
      "      type: 'array',",
      "      of: [defineArrayMember({",
      "        type: 'object',",
      "        fields: [",
      "          defineField({ name: 'title', title: 'Titel', type: 'string' }),",
      "          defineField({ name: 'description', title: 'Beschreibung', type: 'text' }),",
      "          defineField({ name: 'icon', title: 'Icon (Lucide Name)', type: 'string' }),",
      "        ],",
      "      })],",
      "    }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // 6. Schema: testimonials
  files.push({
    path: 'sanity/schemaTypes/testimonials.ts',
    content: [
      IMP + " { defineType, defineField, defineArrayMember } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'testimonials',",
      "  title: 'Kundenstimmen',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'sectionTitle', title: 'Titel', type: 'string' }),",
      "    defineField({",
      "      name: 'items',",
      "      title: 'Testimonials',",
      "      type: 'array',",
      "      of: [defineArrayMember({",
      "        type: 'object',",
      "        fields: [",
      "          defineField({ name: 'quote', title: 'Zitat', type: 'text' }),",
      "          defineField({ name: 'author', title: 'Name', type: 'string' }),",
      "          defineField({ name: 'role', title: 'Position', type: 'string' }),",
      "          defineField({ name: 'company', title: 'Firma', type: 'string' }),",
      "          defineField({ name: 'image', title: 'Bild', type: 'image' }),",
      "        ],",
      "      })],",
      "    }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // 7. Schema: faq
  files.push({
    path: 'sanity/schemaTypes/faq.ts',
    content: [
      IMP + " { defineType, defineField, defineArrayMember } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'faq',",
      "  title: 'FAQ',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'sectionTitle', title: 'Titel', type: 'string' }),",
      "    defineField({",
      "      name: 'items',",
      "      title: 'Fragen',",
      "      type: 'array',",
      "      of: [defineArrayMember({",
      "        type: 'object',",
      "        fields: [",
      "          defineField({ name: 'question', title: 'Frage', type: 'string' }),",
      "          defineField({ name: 'answer', title: 'Antwort', type: 'text' }),",
      "        ],",
      "      })],",
      "    }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // 8. Schema: cta
  files.push({
    path: 'sanity/schemaTypes/cta.ts',
    content: [
      IMP + " { defineType, defineField } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'cta',",
      "  title: 'Call-to-Action',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'headline', title: 'Überschrift', type: 'string' }),",
      "    defineField({ name: 'description', title: 'Text', type: 'text' }),",
      "    defineField({ name: 'buttonText', title: 'Button Text', type: 'string' }),",
      "    defineField({ name: 'buttonLink', title: 'Button Link', type: 'string' }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // 9. Schema: contact
  files.push({
    path: 'sanity/schemaTypes/contact.ts',
    content: [
      IMP + " { defineType, defineField } from 'sanity'",
      "",
      "export default defineType({",
      "  name: 'contact',",
      "  title: 'Kontakt',",
      "  type: 'document',",
      "  fields: [",
      "    defineField({ name: 'headline', title: 'Überschrift', type: 'string' }),",
      "    defineField({ name: 'description', title: 'Text', type: 'text' }),",
      "    defineField({ name: 'email', title: 'E-Mail', type: 'string' }),",
      "    defineField({ name: 'phone', title: 'Telefon', type: 'string' }),",
      "    defineField({ name: 'address', title: 'Adresse', type: 'text' }),",
      "    defineField({ name: 'openingHours', title: 'Öffnungszeiten', type: 'text' }),",
      "  ],",
      "})",
    ].join('\n')
  })

  // === BLOG SCHEMAS (wenn Addon aktiviert) ===
  if (hasBlog) {
    // 10a. Schema: post (Blog-Artikel)
    files.push({
      path: 'sanity/schemaTypes/post.ts',
      content: [
        IMP + " { defineType, defineField } from 'sanity'",
        "",
        "export default defineType({",
        "  name: 'post',",
        "  title: 'Blog-Artikel',",
        "  type: 'document',",
        "  fields: [",
        "    defineField({",
        "      name: 'title',",
        "      title: 'Titel',",
        "      type: 'string',",
        "      validation: Rule => Rule.required(),",
        "    }),",
        "    defineField({",
        "      name: 'slug',",
        "      title: 'Slug',",
        "      type: 'slug',",
        "      options: { source: 'title', maxLength: 96 },",
        "      validation: Rule => Rule.required(),",
        "    }),",
        "    defineField({",
        "      name: 'author',",
        "      title: 'Autor',",
        "      type: 'reference',",
        "      to: [{ type: 'author' }],",
        "    }),",
        "    defineField({",
        "      name: 'mainImage',",
        "      title: 'Hauptbild',",
        "      type: 'image',",
        "      options: { hotspot: true },",
        "      fields: [",
        "        { name: 'alt', type: 'string', title: 'Alt-Text' },",
        "      ],",
        "    }),",
        "    defineField({",
        "      name: 'categories',",
        "      title: 'Kategorien',",
        "      type: 'array',",
        "      of: [{ type: 'reference', to: { type: 'category' } }],",
        "    }),",
        "    defineField({",
        "      name: 'publishedAt',",
        "      title: 'Veröffentlicht am',",
        "      type: 'datetime',",
        "    }),",
        "    defineField({",
        "      name: 'excerpt',",
        "      title: 'Kurzbeschreibung',",
        "      type: 'text',",
        "      rows: 3,",
        "    }),",
        "    defineField({",
        "      name: 'body',",
        "      title: 'Inhalt',",
        "      type: 'array',",
        "      of: [",
        "        { type: 'block' },",
        "        { type: 'image', options: { hotspot: true } },",
        "      ],",
        "    }),",
        "  ],",
        "  preview: {",
        "    select: {",
        "      title: 'title',",
        "      author: 'author.name',",
        "      media: 'mainImage',",
        "    },",
        "    prepare(selection) {",
        "      const { author } = selection",
        "      return { ...selection, subtitle: author ? `von ${author}` : '' }",
        "    },",
        "  },",
        "})",
      ].join('\n')
    })

    // 10b. Schema: author
    files.push({
      path: 'sanity/schemaTypes/author.ts',
      content: [
        IMP + " { defineType, defineField } from 'sanity'",
        "",
        "export default defineType({",
        "  name: 'author',",
        "  title: 'Autor',",
        "  type: 'document',",
        "  fields: [",
        "    defineField({",
        "      name: 'name',",
        "      title: 'Name',",
        "      type: 'string',",
        "      validation: Rule => Rule.required(),",
        "    }),",
        "    defineField({",
        "      name: 'slug',",
        "      title: 'Slug',",
        "      type: 'slug',",
        "      options: { source: 'name', maxLength: 96 },",
        "    }),",
        "    defineField({",
        "      name: 'image',",
        "      title: 'Bild',",
        "      type: 'image',",
        "      options: { hotspot: true },",
        "    }),",
        "    defineField({",
        "      name: 'bio',",
        "      title: 'Biografie',",
        "      type: 'text',",
        "    }),",
        "  ],",
        "  preview: {",
        "    select: {",
        "      title: 'name',",
        "      media: 'image',",
        "    },",
        "  },",
        "})",
      ].join('\n')
    })

    // 10c. Schema: category
    files.push({
      path: 'sanity/schemaTypes/category.ts',
      content: [
        IMP + " { defineType, defineField } from 'sanity'",
        "",
        "export default defineType({",
        "  name: 'category',",
        "  title: 'Kategorie',",
        "  type: 'document',",
        "  fields: [",
        "    defineField({",
        "      name: 'title',",
        "      title: 'Titel',",
        "      type: 'string',",
        "      validation: Rule => Rule.required(),",
        "    }),",
        "    defineField({",
        "      name: 'slug',",
        "      title: 'Slug',",
        "      type: 'slug',",
        "      options: { source: 'title', maxLength: 96 },",
        "    }),",
        "    defineField({",
        "      name: 'description',",
        "      title: 'Beschreibung',",
        "      type: 'text',",
        "    }),",
        "  ],",
        "})",
      ].join('\n')
    })
  }

  // 11. Studio Route: app/{projectId}/[[...tool]]/page.tsx - versteckter Pfad für Sicherheit
  files.push({
    path: 'src/app/' + sanityConfig.projectId + '/[[...tool]]/page.tsx',
    content: [
      "'use client'",
      "",
      IMP + " { NextStudio } from 'next-sanity/studio'",
      IMP + " config from '../../../../sanity.config'",
      "",
      "export default function StudioPage() {",
      "  return <NextStudio config={config} />",
      "}",
    ].join('\n')
  })

  // 11. Studio Layout (wichtig um Tailwind CSS nicht im Studio anzuwenden)
  files.push({
    path: 'src/app/' + sanityConfig.projectId + '/[[...tool]]/layout.tsx',
    content: [
      "export const metadata = {",
      "  title: 'Content Studio',",
      "  description: 'Inhalte verwalten',",
      "}",
      "",
      "export default function StudioLayout({ children }: { children: React.ReactNode }) {",
      "  return (",
      "    <html lang=\"de\">",
      "      <body>{children}</body>",
      "    </html>",
      "  )",
      "}",
    ].join('\n')
  })

  return files
}

// ============ Blog Pages Generator ============

function generateBlogPages(sanityConfig: SanitySetupResult, projectName: string): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // 1. Blog-Übersichtsseite /blog
  files.push({
    path: 'src/app/blog/page.tsx',
    content: [
      IMP + " { Metadata } from 'next'",
      IMP + " Link from 'next/link'",
      IMP + " Image from 'next/image'",
      IMP + " { sanityClient as client, urlFor } from '@/lib/sanityClient'",
      "",
      "export const metadata: Metadata = {",
      "  title: 'Blog | " + projectName + "',",
      "  description: 'Aktuelle Artikel und Neuigkeiten von " + projectName + "',",
      "}",
      "",
      "interface Post {",
      "  _id: string",
      "  title: string",
      "  slug: { current: string }",
      "  mainImage?: { asset: { _ref: string }, alt?: string }",
      "  excerpt?: string",
      "  publishedAt?: string",
      "  author?: { name: string; image?: { asset: { _ref: string } } }",
      "  categories?: { title: string; slug: { current: string } }[]",
      "}",
      "",
      "async function getPosts(): Promise<Post[]> {",
      "  return client.fetch(`",
      "    *[_type == 'post'] | order(publishedAt desc) {",
      "      _id,",
      "      title,",
      "      slug,",
      "      mainImage,",
      "      excerpt,",
      "      publishedAt,",
      "      author->{ name, image },",
      "      categories[]->{ title, slug }",
      "    }",
      "  `)",
      "}",
      "",
      "export default async function BlogPage() {",
      "  const posts = await getPosts()",
      "",
      "  return (",
      "    <main className=\"min-h-screen bg-white dark:bg-slate-950\">",
      "      <section className=\"py-20 px-4\">",
      "        <div className=\"container mx-auto max-w-6xl\">",
      "          <h1 className=\"text-4xl md:text-5xl font-bold text-center mb-4 text-slate-900 dark:text-white\">",
      "            Blog",
      "          </h1>",
      "          <p className=\"text-xl text-center text-slate-600 dark:text-slate-400 mb-12\">",
      "            Aktuelle Artikel und Neuigkeiten",
      "          </p>",
      "",
      "          {posts.length === 0 ? (",
      "            <p className=\"text-center text-slate-500 dark:text-slate-400\">",
      "              Noch keine Artikel veröffentlicht.",
      "            </p>",
      "          ) : (",
      "            <div className=\"grid md:grid-cols-2 lg:grid-cols-3 gap-8\">",
      "              {posts.map((post) => (",
      "                <article",
      "                  key={post._id}",
      "                  className=\"bg-slate-50 dark:bg-slate-900 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow\"",
      "                >",
      "                  <Link href={`/blog/${post.slug.current}`}>",
      "                    {post.mainImage && (",
      "                      <div className=\"relative aspect-video\">",
      "                        <Image",
      "                          src={urlFor(post.mainImage).width(600).height(340).url()}",
      "                          alt={post.mainImage.alt || post.title}",
      "                          fill",
      "                          className=\"object-cover\"",
      "                        />",
      "                      </div>",
      "                    )}",
      "                    <div className=\"p-6\">",
      "                      {post.categories && post.categories.length > 0 && (",
      "                        <div className=\"flex gap-2 mb-3\">",
      "                          {post.categories.map((cat) => (",
      "                            <span",
      "                              key={cat.slug.current}",
      "                              className=\"text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary\"",
      "                            >",
      "                              {cat.title}",
      "                            </span>",
      "                          ))}",
      "                        </div>",
      "                      )}",
      "                      <h2 className=\"text-xl font-bold mb-2 text-slate-900 dark:text-white\">",
      "                        {post.title}",
      "                      </h2>",
      "                      {post.excerpt && (",
      "                        <p className=\"text-slate-600 dark:text-slate-400 mb-4 line-clamp-2\">",
      "                          {post.excerpt}",
      "                        </p>",
      "                      )}",
      "                      <div className=\"flex items-center gap-3 text-sm text-slate-500 dark:text-slate-500\">",
      "                        {post.author && (",
      "                          <span>{post.author.name}</span>",
      "                        )}",
      "                        {post.publishedAt && (",
      "                          <time>",
      "                            {new Date(post.publishedAt).toLocaleDateString('de-DE', {",
      "                              year: 'numeric',",
      "                              month: 'long',",
      "                              day: 'numeric',",
      "                            })}",
      "                          </time>",
      "                        )}",
      "                      </div>",
      "                    </div>",
      "                  </Link>",
      "                </article>",
      "              ))}",
      "            </div>",
      "          )}",
      "        </div>",
      "      </section>",
      "    </main>",
      "  )",
      "}",
    ].join('\n')
  })

  // 2. Blog-Einzelseite /blog/[slug]
  files.push({
    path: 'src/app/blog/[slug]/page.tsx',
    content: [
      IMP + " { Metadata } from 'next'",
      IMP + " { notFound } from 'next/navigation'",
      IMP + " Image from 'next/image'",
      IMP + " Link from 'next/link'",
      IMP + " { sanityClient as client, urlFor } from '@/lib/sanityClient'",
      IMP + " { PortableText } from '@portabletext/react'",
      IMP + " { ArrowLeft } from 'lucide-react'",
      "",
      "interface Post {",
      "  _id: string",
      "  title: string",
      "  slug: { current: string }",
      "  mainImage?: { asset: { _ref: string }, alt?: string }",
      "  excerpt?: string",
      "  body?: any[]",
      "  publishedAt?: string",
      "  author?: { name: string; bio?: string; image?: { asset: { _ref: string } } }",
      "  categories?: { title: string; slug: { current: string } }[]",
      "}",
      "",
      "interface Props {",
      "  params: { slug: string }",
      "}",
      "",
      "async function getPost(slug: string): Promise<Post | null> {",
      "  return client.fetch(`",
      "    *[_type == 'post' && slug.current == $slug][0] {",
      "      _id,",
      "      title,",
      "      slug,",
      "      mainImage,",
      "      excerpt,",
      "      body,",
      "      publishedAt,",
      "      author->{ name, bio, image },",
      "      categories[]->{ title, slug }",
      "    }",
      "  `, { slug })",
      "}",
      "",
      "export async function generateMetadata({ params }: Props): Promise<Metadata> {",
      "  const post = await getPost(params.slug)",
      "  if (!post) return { title: 'Artikel nicht gefunden' }",
      "",
      "  return {",
      "    title: `${post.title} | " + projectName + "`,",
      "    description: post.excerpt || `Lesen Sie unseren Artikel: ${post.title}`,",
      "    openGraph: {",
      "      title: post.title,",
      "      description: post.excerpt,",
      "      type: 'article',",
      "      publishedTime: post.publishedAt,",
      "      images: post.mainImage ? [urlFor(post.mainImage).width(1200).height(630).url()] : [],",
      "    },",
      "  }",
      "}",
      "",
      "export default async function BlogPostPage({ params }: Props) {",
      "  const post = await getPost(params.slug)",
      "",
      "  if (!post) {",
      "    notFound()",
      "  }",
      "",
      "  const jsonLd = {",
      "    '@context': 'https://schema.org',",
      "    '@type': 'BlogPosting',",
      "    headline: post.title,",
      "    description: post.excerpt,",
      "    image: post.mainImage ? urlFor(post.mainImage).width(1200).height(630).url() : undefined,",
      "    datePublished: post.publishedAt,",
      "    author: post.author ? {",
      "      '@type': 'Person',",
      "      name: post.author.name,",
      "    } : undefined,",
      "  }",
      "",
      "  return (",
      "    <>",
      "      <script",
      "        type=\"application/ld+json\"",
      "        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}",
      "      />",
      "      <main className=\"min-h-screen bg-white dark:bg-slate-950\">",
      "        <article className=\"py-12 px-4\">",
      "          <div className=\"container mx-auto max-w-3xl\">",
      "            <Link",
      "              href=\"/blog\"",
      "              className=\"inline-flex items-center gap-2 text-primary hover:underline mb-8\"",
      "            >",
      "              <ArrowLeft className=\"w-4 h-4\" />",
      "              Zurück zum Blog",
      "            </Link>",
      "",
      "            {post.categories && post.categories.length > 0 && (",
      "              <div className=\"flex gap-2 mb-4\">",
      "                {post.categories.map((cat) => (",
      "                  <span",
      "                    key={cat.slug.current}",
      "                    className=\"text-sm font-medium px-3 py-1 rounded-full bg-primary/10 text-primary\"",
      "                  >",
      "                    {cat.title}",
      "                  </span>",
      "                ))}",
      "              </div>",
      "            )}",
      "",
      "            <h1 className=\"text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-slate-900 dark:text-white\">",
      "              {post.title}",
      "            </h1>",
      "",
      "            <div className=\"flex items-center gap-4 mb-8 text-slate-600 dark:text-slate-400\">",
      "              {post.author && (",
      "                <div className=\"flex items-center gap-3\">",
      "                  {post.author.image && (",
      "                    <Image",
      "                      src={urlFor(post.author.image).width(48).height(48).url()}",
      "                      alt={post.author.name}",
      "                      width={40}",
      "                      height={40}",
      "                      className=\"rounded-full\"",
      "                    />",
      "                  )}",
      "                  <span className=\"font-medium\">{post.author.name}</span>",
      "                </div>",
      "              )}",
      "              {post.publishedAt && (",
      "                <time className=\"text-sm\">",
      "                  {new Date(post.publishedAt).toLocaleDateString('de-DE', {",
      "                    year: 'numeric',",
      "                    month: 'long',",
      "                    day: 'numeric',",
      "                  })}",
      "                </time>",
      "              )}",
      "            </div>",
      "",
      "            {post.mainImage && (",
      "              <div className=\"relative aspect-video rounded-2xl overflow-hidden mb-10\">",
      "                <Image",
      "                  src={urlFor(post.mainImage).width(1200).height(675).url()}",
      "                  alt={post.mainImage.alt || post.title}",
      "                  fill",
      "                  className=\"object-cover\"",
      "                  priority",
      "                />",
      "              </div>",
      "            )}",
      "",
      "            <div className=\"prose prose-lg dark:prose-invert max-w-none\">",
      "              {post.body && <PortableText value={post.body} />}",
      "            </div>",
      "          </div>",
      "        </article>",
      "      </main>",
      "    </>",
      "  )",
      "}",
    ].join('\n')
  })

  // 3. RSS Feed /blog/feed.xml
  files.push({
    path: 'src/app/blog/feed.xml/route.ts',
    content: [
      IMP + " { sanityClient as client } from '@/lib/sanityClient'",
      "",
      "interface Post {",
      "  title: string",
      "  slug: { current: string }",
      "  excerpt?: string",
      "  publishedAt?: string",
      "}",
      "",
      "export async function GET() {",
      "  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'",
      "  const posts: Post[] = await client.fetch(`",
      "    *[_type == 'post'] | order(publishedAt desc) {",
      "      title,",
      "      slug,",
      "      excerpt,",
      "      publishedAt",
      "    }",
      "  `)",
      "",
      "  const rss = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">",
      "  <channel>",
      "    <title>" + projectName + " Blog</title>",
      "    <link>${siteUrl}/blog</link>",
      "    <description>Aktuelle Artikel und Neuigkeiten von " + projectName + "</description>",
      "    <language>de</language>",
      "    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>",
      "    <atom:link href=\"${siteUrl}/blog/feed.xml\" rel=\"self\" type=\"application/rss+xml\"/>",
      "    ${posts.map(post => `",
      "    <item>",
      "      <title>${escapeXml(post.title)}</title>",
      "      <link>${siteUrl}/blog/${post.slug.current}</link>",
      "      <guid>${siteUrl}/blog/${post.slug.current}</guid>",
      "      ${post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : ''}",
      "      ${post.publishedAt ? `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : ''}",
      "    </item>`).join('')}",
      "  </channel>",
      "</rss>`",
      "",
      "  return new Response(rss, {",
      "    headers: {",
      "      'Content-Type': 'application/xml',",
      "      'Cache-Control': 'public, max-age=3600',",
      "    },",
      "  })",
      "}",
      "",
      "function escapeXml(str: string): string {",
      "  return str",
      "    .replace(/&/g, '&amp;')",
      "    .replace(/</g, '&lt;')",
      "    .replace(/>/g, '&gt;')",
      "    .replace(/\"/g, '&quot;')",
      "    .replace(/'/g, '&apos;')",
      "}",
    ].join('\n')
  })

  return files
}

// ============ Visual Editing Generator ============

function generateVisualEditingFiles(sanityConfig: SanitySetupResult): GeneratedFile[] {
  const files: GeneratedFile[] = []

  // 1. Visual Editing Provider Komponente
  files.push({
    path: 'src/components/VisualEditing.tsx',
    content: [
      "'use client'",
      "",
      IMP + " { VisualEditing as SanityVisualEditing } from '@sanity/visual-editing/next-app-router'",
      "",
      "export function VisualEditing() {",
      "  return (",
      "    <SanityVisualEditing",
      "      studioUrl={`/${\"" + sanityConfig.projectId + "\"}`}",
      "    />",
      "  )",
      "}",
    ].join('\n')
  })

  // 2. Draft Mode Enable Route
  files.push({
    path: 'src/app/api/draft/enable/route.ts',
    content: [
      IMP + " { draftMode } from 'next/headers'",
      IMP + " { redirect } from 'next/navigation'",
      IMP + " { NextRequest } from 'next/server'",
      "",
      "export async function GET(request: NextRequest) {",
      "  const { searchParams } = new URL(request.url)",
      "  const secret = searchParams.get('secret')",
      "  const slug = searchParams.get('slug') || '/'",
      "",
      "  // Validate secret token",
      "  if (secret !== process.env.SANITY_PREVIEW_SECRET) {",
      "    return new Response('Invalid token', { status: 401 })",
      "  }",
      "",
      "  (await draftMode()).enable()",
      "  redirect(slug)",
      "}",
    ].join('\n')
  })

  // 3. Draft Mode Disable Route
  files.push({
    path: 'src/app/api/draft/disable/route.ts',
    content: [
      IMP + " { draftMode } from 'next/headers'",
      IMP + " { redirect } from 'next/navigation'",
      "",
      "export async function GET() {",
      "  (await draftMode()).disable()",
      "  redirect('/')",
      "}",
    ].join('\n')
  })

  // 4. Updated Layout mit Visual Editing
  files.push({
    path: 'src/app/layout.visual.tsx',
    content: [
      "// Füge diese Zeilen in dein bestehendes layout.tsx ein:",
      "// 1. Import am Anfang der Datei:",
      IMP + " { draftMode } from 'next/headers'",
      IMP + " { VisualEditing } from '@/components/VisualEditing'",
      "",
      "// 2. Innerhalb der RootLayout Funktion, vor dem schließenden </body> Tag:",
      "// {(await draftMode()).isEnabled && <VisualEditing />}",
      "",
      "// Beispiel:",
      "// export default async function RootLayout({ children }) {",
      "//   return (",
      "//     <html>",
      "//       <body>",
      "//         {children}",
      "//         {(await draftMode()).isEnabled && <VisualEditing />}",
      "//       </body>",
      "//     </html>",
      "//   )",
      "// }",
    ].join('\n')
  })

  return files
}

// ============ Helpers ============

function extractResponseText(response: any): string {
  if (typeof response.output === 'string') return response.output
  if (response.output_text) return response.output_text
  if (Array.isArray(response.output)) {
    const textPart = response.output.find((p: any) => p.type === 'text' || p.content)
    if (textPart?.text) return textPart.text
    if (textPart?.content?.[0]?.text) return textPart.content[0].text
  }
  return ''
}

function cleanCode(code: string): string {
  return code.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim()
}

// ============ Code Validation ============

interface ValidationResult {
  valid: boolean
  errors: string[]
}

function validateGeneratedCode(code: string, fileType: 'page' | 'component'): ValidationResult {
  const errors: string[] = []
  
  // 1. Mindestlänge prüfen (leere Antworten abfangen)
  if (!code || code.length < 100) {
    errors.push('Code zu kurz oder leer')
  }
  
  // 2. Muss export enthalten (React-Komponente)
  if (!code.includes('export')) {
    errors.push('Kein export gefunden - keine gültige React-Komponente')
  }
  
  // 3. Keine Platzhalter-Texte
  const placeholders = ['Lorem ipsum', 'lorem ipsum', '[Hier', '[hier', 'PLACEHOLDER', 'TODO:', 'FIXME:']
  for (const placeholder of placeholders) {
    if (code.includes(placeholder)) {
      errors.push(`Platzhalter gefunden: ${placeholder}`)
    }
  }
  
  // 4. Keine Markdown-Reste
  if (code.startsWith('```') || code.includes('\n```')) {
    errors.push('Markdown-Codeblock nicht korrekt entfernt')
  }
  
  // 5. Basis-Struktur für Pages
  if (fileType === 'page') {
    if (!code.includes('return') && !code.includes('Return')) {
      errors.push('Page hat kein return statement')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

async function generatePageWithRetry(
  openai: OpenAI,
  project: ProjectData,
  page: PageData,
  context: string,
  plan: string,
  previousError: string = '',
  hasCms: boolean = false,
  sanityConfig: SanitySetupResult | null = null,
  maxRetries: number = 2
): Promise<string> {
  let lastError = previousError
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const code = await generateReactPage(openai, project, page, context, plan, lastError, hasCms, sanityConfig)
    const validation = validateGeneratedCode(code, 'page')
    
    if (validation.valid) {
      return code
    }
    
    if (attempt <= maxRetries) {
      console.warn(`  ⚠️ Page ${page.name} Versuch ${attempt} fehlgeschlagen:`, validation.errors.join(', '))
      lastError = `VORHERIGER FEHLER: ${validation.errors.join(', ')}. Bitte korrigieren!`
    } else {
      console.error(`  ❌ Page ${page.name} nach ${maxRetries + 1} Versuchen fehlgeschlagen`)
      // Fallback: Trotzdem verwenden, aber warnen
      return code
    }
  }
  
  return '' // Sollte nie erreicht werden
}

// ============ Vercel Deployment ============

async function deployToVercel(
  token: string,
  project: ProjectData,
  files: GeneratedFile[],
  hasCms: boolean = false,
  hasResend: boolean = false,
  resendApiKey: string = ''
): Promise<string> {
  // Prepare files for Vercel deployment
  // Filter only the Next.js source files (not HTML previews)
  const deployFiles = files
    .filter(f => !f.path.startsWith('preview/') && !f.path.startsWith('_'))
    .map(f => ({
      file: f.path,
      data: f.content,
    }))

  // Build dependencies based on whether CMS is enabled
  const baseDependencies: Record<string, string> = {
    next: '14.2.18',
    react: '18.3.1',
    'react-dom': '18.3.1',
    'framer-motion': '11.15.0',
    'lucide-react': '0.468.0',
    'next-themes': '0.4.4',
    'clsx': '2.1.1',
    'tailwind-merge': '2.6.0',
  }

  // Add Sanity dependencies if CMS is enabled (including Studio)
  if (hasCms) {
    baseDependencies['@sanity/client'] = '6.22.5'
    baseDependencies['@sanity/image-url'] = '1.1.0'
    baseDependencies['sanity'] = '3.57.0'
    baseDependencies['next-sanity'] = '9.4.2'
    baseDependencies['styled-components'] = '6.1.13'
    // Visual Editing support
    baseDependencies['@sanity/visual-editing'] = '2.1.0'
  }

  // Add Blog dependencies if blog addon is enabled
  const hasBlogAddon = project.selected_addons?.includes('blog_module')
  if (hasBlogAddon) {
    baseDependencies['@portabletext/react'] = '3.1.0'
  }

  // Add Resend dependency if email is enabled
  if (hasResend) {
    baseDependencies['resend'] = '4.0.0'
  }

  // Add package.json if not present
  if (!deployFiles.find(f => f.file === 'package.json')) {
    deployFiles.push({
      file: 'package.json',
      data: JSON.stringify({
        name: project.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: baseDependencies,
        devDependencies: {
          '@types/node': '20.17.0',
          '@types/react': '18.3.0',
          typescript: '5.7.3',
          tailwindcss: '3.4.17',
          postcss: '8.5.1',
          autoprefixer: '10.4.20',
        },
      }, null, 2),
    })
  }

  // Add next.config.js if not present
  if (!deployFiles.find(f => f.file === 'next.config.js')) {
    deployFiles.push({
      file: 'next.config.js',
      data: `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}
module.exports = nextConfig
`,
    })
  }

  // Add postcss.config.js
  if (!deployFiles.find(f => f.file === 'postcss.config.js')) {
    deployFiles.push({
      file: 'postcss.config.js',
      data: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
    })
  }

  // Add tsconfig.json
  if (!deployFiles.find(f => f.file === 'tsconfig.json')) {
    deployFiles.push({
      file: 'tsconfig.json',
      data: JSON.stringify({
        compilerOptions: {
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      }, null, 2),
    })
  }

  console.log('Deploying', deployFiles.length, 'files to Vercel...')

  // Build environment variables for deployment
  const envVars: Record<string, string> = {}
  if (hasResend && resendApiKey) {
    envVars['RESEND_API_KEY'] = resendApiKey
  }

  // Create deployment via Vercel API v12 (ohne target = preview)
  const projectSlug = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50)
  
  const deploymentBody: Record<string, any> = {
    name: projectSlug,
    files: deployFiles.map(f => ({
      file: f.file,
      data: btoa(unescape(encodeURIComponent(f.data))), // Base64 encode
      encoding: 'base64',
    })),
    projectSettings: {
      framework: 'nextjs',
    },
  }

  // Add env vars if any are configured
  if (Object.keys(envVars).length > 0) {
    deploymentBody.env = envVars
  }
  
  const response = await fetch('https://api.vercel.com/v12/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deploymentBody),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Vercel API error:', error)
    throw new Error(`Vercel deployment failed: ${response.status} ${error}`)
  }

  const deployment = await response.json()
  console.log('Vercel deployment created:', deployment.id)

  // Return the preview URL
  const previewUrl = `https://${deployment.url}`
  return previewUrl
}
