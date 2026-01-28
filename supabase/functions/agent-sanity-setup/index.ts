// =============================================================================
// AGENT: SANITY-SETUP (Phase 5) - Erstellt Sanity Projekt, Dataset, Token, Content
// Nur wenn cms_base Addon gebucht ist
// =============================================================================

import { createClient as createSanityClient } from 'npm:@sanity/client@6'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  triggerAgent,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse } from '../_shared/types/pipeline.ts'

interface SanitySetupOutput {
  projectId: string
  dataset: string
  apiToken: string
  studioUrl: string
  contentCreated: boolean
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
    
    const addons = project.addons || []
    const hasCms = addons.includes('cms_base') || addons.includes('cms')
    
    console.log(`[SANITY-SETUP] Starting (Pipeline: ${meta.pipelineRunId}, CMS: ${hasCms})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'cms',
      meta.phase,
      meta.sequence,
      { hasCms },
      meta.attempt
    )

    // Skip if no CMS addon
    if (!hasCms) {
      console.log('[SANITY-SETUP] No CMS addon - skipping')
      await updateAgentRun(agentRunId, {
        status: 'completed',
        output_data: { skipped: true, reason: 'No CMS addon' },
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      // Trigger next agent (resend-setup or deployer)
      await triggerNextAgent(envelope, meta)

      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const managementToken = Deno.env.get('SANITY_MANAGEMENT_TOKEN')
    if (!managementToken) {
      throw new Error('SANITY_MANAGEMENT_TOKEN not configured')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if already set up
    const { data: projectData } = await supabase
      .from('projects')
      .select('sanity_project_id, sanity_api_token')
      .eq('id', meta.projectId)
      .single()

    if (projectData?.sanity_project_id && projectData?.sanity_api_token) {
      console.log('[SANITY-SETUP] Already configured - using existing')
      const output: SanitySetupOutput = {
        projectId: projectData.sanity_project_id,
        dataset: 'production',
        apiToken: projectData.sanity_api_token,
        studioUrl: '/' + projectData.sanity_project_id,
        contentCreated: false,
      }

      await updateAgentRun(agentRunId, {
        status: 'completed',
        output_data: output,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      await triggerNextAgent(envelope, meta)

      return new Response(JSON.stringify({ success: true, output }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Setup Sanity
    console.log('[SANITY-SETUP] Creating Sanity project...')
    const result = await setupSanityProject(managementToken, project, supabase, meta.projectId)

    const output: SanitySetupOutput = {
      ...result,
      contentCreated: true,
    }

    const durationMs = Date.now() - startTime
    console.log(`[SANITY-SETUP] Complete in ${durationMs}ms`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })

    // Trigger next agent
    await triggerNextAgent(envelope, meta)

    const response: AgentResponse<SanitySetupOutput> = {
      success: true,
      agentRunId,
      agentName: 'cms',
      output,
      quality: { score: 10, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: null,
        nextAgents: ['resend-setup'],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs, inputTokens: 0, outputTokens: 0, model: null, costUsd: 0 },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[SANITY-SETUP] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'SANITY_SETUP_ERROR',
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

async function triggerNextAgent(envelope: AgentEnvelope, meta: AgentEnvelope['meta']) {
  const addons = envelope.project.addons || []
  const hasBooking = addons.includes('booking_form')

  if (hasBooking) {
    // Trigger Resend setup
    await triggerAgent('resend-setup', {
      ...envelope,
      meta: { ...meta, agentName: 'email', phase: 5, sequence: 2, timestamp: new Date().toISOString() },
    })
  } else {
    // Skip to Deployer
    await triggerAgent('deployer', {
      ...envelope,
      meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
    })
  }
}

async function setupSanityProject(
  managementToken: string,
  project: AgentEnvelope['project'],
  supabase: ReturnType<typeof createClient>,
  projectId: string
): Promise<Omit<SanitySetupOutput, 'contentCreated'>> {
  const projectSlug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40)

  console.log('[SANITY-SETUP] Project slug:', projectSlug)

  // Use existing Sanity project
  const sanityProjectId = 'cmrv2qwc'
  console.log('[SANITY-SETUP] Using Sanity project:', sanityProjectId)

  // Create production dataset
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
    console.warn('[SANITY-SETUP] Dataset warning:', await createDatasetRes.text())
  }

  // Get or create API token
  let apiToken: string | null = null

  const listTokensRes = await fetch(
    `https://api.sanity.io/v2021-06-07/projects/${sanityProjectId}/tokens`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${managementToken}` }
    }
  )

  if (listTokensRes.ok) {
    const existingTokens = await listTokensRes.json()
    const existingEditorToken = existingTokens.find(
      (t: { roleName: string; key?: string }) => t.roleName === 'editor' && t.key
    )
    if (existingEditorToken?.key) {
      apiToken = existingEditorToken.key
      console.log('[SANITY-SETUP] Using existing token')
    }
  }

  if (!apiToken) {
    const tokenLabel = `Website API Token - ${Date.now()}`
    const createTokenRes = await fetch(
      `https://api.sanity.io/v2021-06-07/projects/${sanityProjectId}/tokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${managementToken}`
        },
        body: JSON.stringify({ label: tokenLabel, roleName: 'editor' })
      }
    )

    if (!createTokenRes.ok) {
      throw new Error(`Failed to create Sanity token: ${await createTokenRes.text()}`)
    }

    const tokenData = await createTokenRes.json()
    apiToken = tokenData.key
    console.log('[SANITY-SETUP] Created new token')
  }

  // Create initial content
  await createSanityContent(sanityProjectId, 'production', apiToken!, project)

  // Save to DB
  await supabase
    .from('projects')
    .update({
      sanity_project_id: sanityProjectId,
      sanity_dataset: 'production',
      sanity_api_token: apiToken,
      sanity_studio_url: '/' + sanityProjectId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)

  return {
    projectId: sanityProjectId,
    dataset: 'production',
    apiToken: apiToken!,
    studioUrl: '/' + sanityProjectId,
  }
}

async function createSanityContent(
  sanityProjectId: string,
  dataset: string,
  apiToken: string,
  project: AgentEnvelope['project']
): Promise<void> {
  const client = createSanityClient({
    projectId: sanityProjectId,
    dataset,
    token: apiToken,
    apiVersion: '2024-01-01',
    useCdn: false
  })

  console.log('[SANITY-SETUP] Creating content for:', project.name)

  const transaction = client.transaction()

  // Site Settings
  transaction.createOrReplace({
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteName: project.name,
    siteDescription: project.brief || `Willkommen bei ${project.name}`,
    primaryColor: project.primaryColor,
    secondaryColor: project.secondaryColor,
    contactEmail: project.contact?.email || 'info@example.com',
    contactPhone: project.contact?.phone || '+49 123 456789',
    socialLinks: []
  })

  // Hero Section
  transaction.createOrReplace({
    _id: 'hero',
    _type: 'hero',
    headline: `Willkommen bei ${project.name}`,
    subheadline: project.brief?.substring(0, 100) || 'Ihr Partner für Erfolg',
    ctaText: 'Jetzt starten',
    ctaLink: '/kontakt',
    secondaryCtaText: 'Mehr erfahren',
    secondaryCtaLink: '/leistungen'
  })

  // Features
  transaction.createOrReplace({
    _id: 'features',
    _type: 'features',
    sectionTitle: 'Unsere Leistungen',
    sectionSubtitle: `Was ${project.name} für Sie tun kann`,
    items: (project.usps || ['Qualität', 'Service', 'Erfahrung']).map((usp, i) => ({
      _key: `feature-${i}`,
      title: usp,
      description: `Professionelle Lösungen für Ihre Anforderungen.`,
      icon: ['star', 'check', 'heart', 'zap'][i % 4]
    }))
  })

  // Contact
  transaction.createOrReplace({
    _id: 'contact',
    _type: 'contact',
    headline: 'Kontakt aufnehmen',
    description: 'Wir freuen uns auf Ihre Nachricht.',
    email: project.contact?.email || 'info@example.com',
    phone: project.contact?.phone || '+49 123 456789',
    address: project.contact?.address || 'Musterstraße 1, 12345 Musterstadt',
    openingHours: 'Mo-Fr: 9:00 - 18:00 Uhr'
  })

  // CTA
  transaction.createOrReplace({
    _id: 'cta',
    _type: 'cta',
    headline: 'Bereit durchzustarten?',
    description: `Kontaktieren Sie ${project.name} noch heute.`,
    buttonText: 'Kontakt aufnehmen',
    buttonLink: '/kontakt'
  })

  await transaction.commit()
  console.log('[SANITY-SETUP] Content created successfully')
}
