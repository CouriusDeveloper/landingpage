// =============================================================================
// AGENT: DEPLOYER (Phase 6)
// Deploys to Vercel and finalizes the pipeline
// UNTERSTÜTZT: Alle Addons (CMS, Blog, SEO, Pixel, Cookie Consent)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  updatePipelineStatus,
} from '../_shared/agent-utils.ts'
import { getAgentContext } from '../_shared/agent-context.ts'
import type { 
  AgentEnvelope, 
  AgentResponse, 
  DeployerOutput,
} from '../_shared/types/pipeline.ts'

// Build package.json based on agent context
function buildPackageJson(
  projectName: string,
  agentContext: ReturnType<typeof getAgentContext>
): string {
  const { techStack } = agentContext
  
  const dependencies: Record<string, string> = {
    next: '^14.2.0',
    react: '^18.2.0',
    'react-dom': '^18.2.0',
    'lucide-react': '^0.300.0',
  }
  
  // CMS (Sanity)
  if (techStack.cms.enabled) {
    dependencies['sanity'] = '^3.0.0'
    dependencies['@sanity/client'] = '^6.0.0'
    dependencies['@sanity/image-url'] = '^1.0.0'
    dependencies['@sanity/vision'] = '^3.0.0'
  }
  
  // Email (Resend)
  if (techStack.email.enabled) {
    dependencies['resend'] = '^2.0.0'
    dependencies['zod'] = '^3.22.0'
  }
  
  // Blog (benötigt Sanity + zusätzliche Packages)
  if (techStack.blog.enabled) {
    dependencies['@portabletext/react'] = '^3.0.0'
    dependencies['date-fns'] = '^3.0.0'
  }
  
  // SEO
  if (techStack.seo.enabled) {
    dependencies['next-sitemap'] = '^4.0.0'
  }
  
  return JSON.stringify({
    name: projectName,
    version: '1.0.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      ...(techStack.seo.enabled ? { postbuild: 'next-sitemap' } : {}),
    },
    dependencies,
    devDependencies: {
      typescript: '^5.0.0',
      '@types/react': '^18.0.0',
      '@types/node': '^20.0.0',
      tailwindcss: '^3.4.0',
      autoprefixer: '^10.0.0',
      postcss: '^8.0.0',
    },
  }, null, 2)
}

// Build environment variables based on context
function buildEnvVars(
  project: Record<string, unknown>,
  agentContext: ReturnType<typeof getAgentContext>
): Record<string, string> {
  const { techStack } = agentContext
  const env: Record<string, string> = {}
  
  if (techStack.cms.enabled) {
    env['NEXT_PUBLIC_SANITY_PROJECT_ID'] = (project.sanity_project_id as string) || ''
    env['NEXT_PUBLIC_SANITY_DATASET'] = 'production'
  }
  
  if (techStack.email.enabled) {
    env['RESEND_API_KEY'] = (project.resend_api_key as string) || ''
    env['CONTACT_EMAIL'] = (project.contact_email as string) || (project.contactEmail as string) || ''
  }
  
  if (techStack.analytics.googlePixel.enabled) {
    env['NEXT_PUBLIC_GA_ID'] = (project.google_pixel_id as string) || ''
  }
  
  if (techStack.analytics.metaPixel.enabled) {
    env['NEXT_PUBLIC_META_PIXEL_ID'] = (project.meta_pixel_id as string) || ''
  }
  
  return env
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
    
    console.log(`[DEPLOYER] Starting (Pipeline: ${meta.pipelineRunId})`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load project data from DB if not fully provided
    let projectName = project?.name
    if (!projectName) {
      const { data: projectData } = await supabase
        .from('projects')
        .select('name')
        .eq('id', meta.projectId)
        .single()
      projectName = projectData?.name || `project-${meta.projectId.slice(0, 8)}`
    }
    const safeProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'deployer',
      meta.phase,
      meta.sequence,
      { project: { ...project, name: projectName } },
      meta.attempt
    )

    // Load all generated files
    const { data: files } = await supabase
      .from('generated_files')
      .select('file_path, content')
      .eq('project_id', meta.projectId)

    if (!files || files.length === 0) {
      throw new Error('No generated files found')
    }

    console.log(`[DEPLOYER] Found ${files.length} files to deploy`)

    // Get agent context for addon-based dependencies
    const agentContext = getAgentContext(project)
    console.log(`[DEPLOYER] Addons: ${Object.entries(agentContext.addons).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none'}`)

    // Check for Vercel token
    const vercelToken = Deno.env.get('VERCEL_TOKEN')
    let deploymentUrl = ''
    let deploymentId = ''
    let deploymentStatus: 'success' | 'pending' | 'failed' = 'pending'
    
    if (vercelToken) {
      // Create Vercel deployment
      console.log('[DEPLOYER] Creating Vercel deployment...')
      
      // Prepare files for Vercel API
      const vercelFiles = files.map(f => ({
        file: f.file_path,
        data: f.content,
      }))

      // Add package.json if not exists - mit allen Dependencies basierend auf Addons
      const hasPackageJson = files.some(f => f.file_path === 'package.json')
      if (!hasPackageJson) {
        vercelFiles.push({
          file: 'package.json',
          data: buildPackageJson(safeProjectName, agentContext),
        })
      }
      
      // Build environment variables
      const envVars = buildEnvVars(project, agentContext)

      try {
        const deployResponse = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: safeProjectName,
            files: vercelFiles,
            projectSettings: {
              framework: 'nextjs',
              buildCommand: 'npm run build',
              outputDirectory: '.next',
              installCommand: 'npm install',
            },
            env: envVars,
          }),
        })

        if (deployResponse.ok) {
          const deployData = await deployResponse.json()
          deploymentUrl = `https://${deployData.url}`
          deploymentId = deployData.id
          deploymentStatus = 'success'
          console.log(`[DEPLOYER] Vercel deployment created: ${deploymentUrl}`)
        } else {
          const error = await deployResponse.text()
          console.error('[DEPLOYER] Vercel deployment failed:', error)
          deploymentStatus = 'failed'
        }
      } catch (vercelError) {
        console.error('[DEPLOYER] Vercel API error:', vercelError)
        deploymentStatus = 'failed'
      }
    } else {
      console.log('[DEPLOYER] No VERCEL_TOKEN, skipping deployment')
      deploymentUrl = `https://${safeProjectName}.vercel.app`
      deploymentStatus = 'pending'
    }

    const durationMs = Date.now() - startTime

    const output: DeployerOutput = {
      deploymentId: deploymentId || `sim-${Date.now()}`,
      deploymentUrl,
      status: deploymentStatus,
      filesDeployed: files.length,
      buildLog: deploymentStatus === 'success' 
        ? 'Deployment successful'
        : (deploymentStatus === 'pending' 
          ? 'Deployment pending - no VERCEL_TOKEN configured'
          : 'Deployment failed'),
    }

    // Update project with deployment URL
    await supabase
      .from('projects')
      .update({ 
        deployment_url: deploymentUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meta.projectId)

    // Update agent run
    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: null,
      input_tokens: 0,
      output_tokens: 0,
      duration_ms: durationMs,
      cost_usd: 0,
      quality_score: 10,
      validation_passed: true,
      completed_at: new Date().toISOString(),
    })

    // Calculate total metrics
    const { data: allAgentRuns } = await supabase
      .from('agent_runs')
      .select('input_tokens, output_tokens, cost_usd, duration_ms')
      .eq('pipeline_run_id', meta.pipelineRunId)

    const totalTokens = allAgentRuns?.reduce((sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0), 0) || 0
    const totalCost = allAgentRuns?.reduce((sum, r) => sum + (r.cost_usd || 0), 0) || 0
    const totalDuration = allAgentRuns?.reduce((sum, r) => sum + (r.duration_ms || 0), 0) || 0

    // Mark pipeline as completed (only use columns that exist)
    await updatePipelineStatus(meta.pipelineRunId, 'completed', {
      total_tokens: totalTokens,
      total_cost_usd: totalCost,
      completed_at: new Date().toISOString(),
    })

    console.log(`[DEPLOYER] ✅ Pipeline ${meta.pipelineRunId} completed!`)
    console.log(`[DEPLOYER] Stats: ${totalTokens} tokens, $${totalCost.toFixed(4)}, ${files.length} files`)

    const response: AgentResponse<DeployerOutput> = {
      success: true,
      agentRunId,
      agentName: 'deployer',
      output,
      quality: { score: 10, passed: true, issues: [], criticalCount: 0 },
      control: {
        nextPhase: null,
        nextAgents: [],
        shouldRetry: false,
        retryAgent: null,
        retryReason: null,
        isComplete: true,
        abort: false,
        abortReason: null,
      },
      metrics: { durationMs, inputTokens: 0, outputTokens: 0, model: null, costUsd: 0 },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[DEPLOYER] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'DEPLOYER_ERROR',
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
