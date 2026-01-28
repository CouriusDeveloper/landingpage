// =============================================================================
// AGENT: RESEND-SETUP (Phase 5) - Erstellt Resend Domain für Email-Versand
// Nur wenn booking_form Addon gebucht ist
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  triggerAgent,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse } from '../_shared/types/pipeline.ts'

interface ResendDnsRecord {
  type: string
  name: string
  value: string
  ttl?: string
  priority?: number
}

interface ResendSetupOutput {
  domainId: string | null
  domain: string | null
  dnsRecords: ResendDnsRecord[]
  verified: boolean
}

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
    const hasBooking = addons.includes('booking_form')
    
    console.log(`[RESEND-SETUP] Starting (Pipeline: ${meta.pipelineRunId}, Booking: ${hasBooking})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'email',
      meta.phase,
      meta.sequence,
      { hasBooking },
      meta.attempt
    )

    // Skip if no booking addon
    if (!hasBooking) {
      console.log('[RESEND-SETUP] No booking addon - skipping')
      await updateAgentRun(agentRunId, {
        status: 'completed',
        output_data: { skipped: true, reason: 'No booking_form addon' },
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      // Trigger Deployer
      await triggerAgent('deployer', {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      })

      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.warn('[RESEND-SETUP] RESEND_API_KEY not configured - skipping')
      await updateAgentRun(agentRunId, {
        status: 'completed',
        output_data: { skipped: true, reason: 'RESEND_API_KEY not configured' },
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      await triggerAgent('deployer', {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      })

      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if already set up
    const { data: projectData } = await supabase
      .from('projects')
      .select('email_domain, resend_domain_id, email_domain_verified')
      .eq('id', meta.projectId)
      .single()

    if (projectData?.resend_domain_id) {
      console.log('[RESEND-SETUP] Already configured - checking verification')
      
      const verified = await checkDomainVerification(resendApiKey, projectData.resend_domain_id)
      
      const output: ResendSetupOutput = {
        domainId: projectData.resend_domain_id,
        domain: projectData.email_domain,
        dnsRecords: [],
        verified,
      }

      if (verified && !projectData.email_domain_verified) {
        await supabase
          .from('projects')
          .update({ email_domain_verified: true, updated_at: new Date().toISOString() })
          .eq('id', meta.projectId)
      }

      await updateAgentRun(agentRunId, {
        status: 'completed',
        output_data: output,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      await triggerAgent('deployer', {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      })

      return new Response(JSON.stringify({ success: true, output }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get email domain from project
    const emailDomain = projectData?.email_domain
    if (!emailDomain) {
      console.log('[RESEND-SETUP] No email_domain configured - skipping')
      await updateAgentRun(agentRunId, {
        status: 'completed',
        output_data: { skipped: true, reason: 'No email_domain in project' },
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })

      await triggerAgent('deployer', {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      })

      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Setup Resend domain
    console.log('[RESEND-SETUP] Creating Resend domain:', emailDomain)
    const result = await setupResendDomain(resendApiKey, emailDomain)

    // Save to DB
    await supabase
      .from('projects')
      .update({
        resend_domain_id: result.domainId,
        resend_dns_records: result.dnsRecords,
        email_domain_verified: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meta.projectId)

    const output: ResendSetupOutput = {
      domainId: result.domainId,
      domain: emailDomain,
      dnsRecords: result.dnsRecords,
      verified: false,
    }

    const durationMs = Date.now() - startTime
    console.log(`[RESEND-SETUP] Complete in ${durationMs}ms - DNS records pending`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })

    // Check if analytics should run next
    const packageType = envelope.project.packageType || 'starter'
    const addons = envelope.project.addons || []
    const hasAnalytics = packageType === 'enterprise' || addons.includes('analytics')

    if (hasAnalytics) {
      console.log('[RESEND-SETUP] Triggering analytics...')
      await triggerAgent('analytics', {
        ...envelope,
        meta: { ...meta, agentName: 'analytics', phase: 5, sequence: 3, timestamp: new Date().toISOString() },
      })
    } else {
      console.log('[RESEND-SETUP] Triggering deployer...')
      await triggerAgent('deployer', {
        ...envelope,
        meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
      })
    }

    const nextAgent = hasAnalytics ? 'analytics' : 'deployer'
    const nextPhase = hasAnalytics ? 5 : 6

    const response: AgentResponse<ResendSetupOutput> = {
      success: true,
      agentRunId,
      agentName: 'email',
      output,
      quality: { score: 10, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase,
        nextAgents: [nextAgent],
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
    console.error('[RESEND-SETUP] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'RESEND_SETUP_ERROR',
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

async function setupResendDomain(
  apiKey: string,
  domain: string
): Promise<{ domainId: string; dnsRecords: ResendDnsRecord[] }> {
  console.log('[RESEND-SETUP] Creating domain:', domain)

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
    
    // Check if domain already exists
    if (errorText.includes('already exists') || errorText.includes('duplicate')) {
      console.log('[RESEND-SETUP] Domain already exists - fetching...')
      return await getExistingDomain(apiKey, domain)
    }
    
    throw new Error(`Failed to create Resend domain: ${errorText}`)
  }

  const data = await response.json()
  console.log('[RESEND-SETUP] Domain created:', data.id)

  const dnsRecords: ResendDnsRecord[] = data.records?.map((record: Record<string, unknown>) => ({
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

async function getExistingDomain(
  apiKey: string,
  domain: string
): Promise<{ domainId: string; dnsRecords: ResendDnsRecord[] }> {
  const response = await fetch('https://api.resend.com/domains', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw new Error('Failed to list Resend domains')
  }

  const data = await response.json()
  const existingDomain = data.data?.find((d: { name: string }) => d.name === domain)

  if (!existingDomain) {
    throw new Error(`Domain ${domain} not found in Resend`)
  }

  return {
    domainId: existingDomain.id,
    dnsRecords: existingDomain.records || [],
  }
}

async function checkDomainVerification(
  apiKey: string,
  domainId: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    return data.status === 'verified'
  } catch {
    return false
  }
}
