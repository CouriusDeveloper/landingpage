// =============================================================================
// AGENT: IMAGE (Phase 1)
// Stock image selection from Unsplash (free commercial use, no attribution required)
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  updatePipelineMetrics,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, ImageOutput } from '../_shared/types/pipeline.ts'

const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY')

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

    if (UNSPLASH_ACCESS_KEY) {
      // Fetch images from Unsplash
      for (const purpose of imagePurposes) {
        const query = queryMap[purpose] || baseQuery
        
        try {
          const response = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
            {
              headers: {
                'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`,
              },
            }
          )
          
          if (response.ok) {
            const data = await response.json()
            const photo = data.results[0]
            
            if (photo) {
              images.push({
                id: photo.id,
                purpose,
                source: 'unsplash',
                url: photo.urls.regular,
                thumbnailUrl: photo.urls.thumb,
                alt: photo.alt_description || `${purpose} image`,
                credit: {
                  name: photo.user.name,
                  url: photo.user.links.html,
                },
                width: photo.width,
                height: photo.height,
              })
              console.log(`[IMAGE] Found Unsplash image for ${purpose}`)
            }
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
      model_used: 'unsplash-api',
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
        issues: images.length === 0 ? ['No Unsplash API key, using placeholders'] : [], 
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
      metrics: { durationMs, inputTokens: 0, outputTokens: 0, model: 'unsplash-api', costUsd: 0 },
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
