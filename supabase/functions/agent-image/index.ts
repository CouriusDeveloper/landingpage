// =============================================================================
// AGENT: IMAGE (Phase 1)
// Stock image selection from Pexels (free commercial use, no attribution required)
// Pexels explicitly allows automated/API usage for commercial projects
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  updatePipelineMetrics,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, ImageOutput } from '../_shared/types/pipeline.ts'

const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[IMAGE] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'image',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    // Determine image needs based on sections
    const imagePurposes: string[] = []
    const allSections = project.pages.flatMap(p => p.sections)
    
    if (allSections.includes('hero')) imagePurposes.push('hero')
    if (allSections.includes('about')) imagePurposes.push('about')
    if (allSections.includes('team')) imagePurposes.push('team')
    if (allSections.includes('services')) imagePurposes.push('services')
    if (allSections.includes('features')) imagePurposes.push('features')
    if (allSections.includes('testimonials')) imagePurposes.push('testimonials')
    if (allSections.includes('portfolio')) imagePurposes.push('portfolio')
    
    // Default: at least hero and about
    if (imagePurposes.length === 0) {
      imagePurposes.push('hero', 'about')
    }

    const images: ImageOutput['images'] = []
    const placeholders: ImageOutput['placeholders'] = []

    // Build search queries based on industry and style
    const baseQuery = `${project.industry || 'business'} ${project.websiteStyle || 'modern'}`
    
    const queryMap: Record<string, string> = {
      hero: `${baseQuery} office workspace professional`,
      about: `${baseQuery} team collaboration`,
      team: 'professional portrait business',
      services: `${baseQuery} service solution`,
      features: `${baseQuery} technology innovation`,
      testimonials: 'happy customer client',
      portfolio: `${baseQuery} project work`,
    }

    if (PEXELS_API_KEY) {
      // Fetch images from Pexels API
      for (const purpose of imagePurposes) {
        const query = queryMap[purpose] || baseQuery
        
        try {
          const response = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
            {
              headers: {
                'Authorization': PEXELS_API_KEY,
              },
            }
          )
          
          if (response.ok) {
            const data = await response.json()
            const photo = data.photos?.[0]
            
            if (photo) {
              images.push({
                id: String(photo.id),
                purpose,
                source: 'pexels',
                url: photo.src.large2x || photo.src.large,
                thumbnailUrl: photo.src.small,
                alt: photo.alt || `${purpose} image`,
                credit: {
                  name: photo.photographer,
                  url: photo.photographer_url,
                },
                width: photo.width,
                height: photo.height,
              })
              console.log(`[IMAGE] Found Pexels image for ${purpose}: ${photo.src.large}`)
            }
          } else {
            console.warn(`[IMAGE] Pexels API error for ${purpose}:`, response.status, await response.text())
          }
        } catch (err) {
          console.warn(`[IMAGE] Failed to fetch ${purpose}:`, err)
        }
      }
    }

    // Create placeholders for any missing images
    for (const purpose of imagePurposes) {
      if (!images.find(img => img.purpose === purpose)) {
        placeholders.push({
          purpose,
          fallbackColor: project.primaryColor,
          aspectRatio: purpose === 'hero' ? '16:9' : '4:3',
        })
      }
    }

    const output: ImageOutput = { images, placeholders }
    const durationMs = Date.now() - startTime

    console.log(`[IMAGE] Success: ${images.length} images, ${placeholders.length} placeholders in ${durationMs}ms`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: 'pexels-api',
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: durationMs,
      cost_usd: 0,
      quality_score: images.length > 0 ? 8.5 : 6.0,
      validation_passed: true,
      completed_at: new Date().toISOString(),
    })

    const response: AgentResponse<ImageOutput> = {
      success: true,
      agentRunId,
      agentName: 'image',
      output,
      quality: { 
        score: images.length > 0 ? 8.5 : 6.0, 
        passed: true, 
        issues: images.length === 0 ? ['No Pexels API key configured, using placeholders'] : [], 
        criticalCount: 0 
      },
      control: {
        nextPhase: null,
        nextAgents: [],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: false,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs, inputTokens: 0, outputTokens: 0, model: 'pexels-api', costUsd: 0 },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[IMAGE] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'IMAGE_ERROR',
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
