// Orchestrator - Project Manager that coordinates all agents
// Implements phased execution with parallelization

import { createClient } from 'npm:@supabase/supabase-js@2'
import type {
  ProjectManagerInput,
  ProjectManagerOutput,
  GenerationMetrics,
  AgentError,
  ProjectDataExtended,
  StrategistOutput,
  ContentPackGeneratorOutput,
  EditorOutput,
  CodeRendererOutput,
  AgentContext,
} from './types/agents.ts'
import type { ContentPack } from './types/content-pack.ts'
import { runStrategist } from './agents/strategist.ts'
import { runContentPackGenerator, validateContentPack } from './agents/content-pack-generator.ts'
import { runEditor, quickQualityCheck, shouldRequestRevision, QUALITY_THRESHOLD } from './agents/editor.ts'
import { runCodeRenderer, getRequiredDependencies, getRequiredEnvVariables } from './agents/code-renderer.ts'
import { runParallel, runPhased, type Phase, type ParallelTask } from './utils/parallel-runner.ts'
import { generateCorrelationId, hashContent, logAgent } from './utils/agent-runner.ts'

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_REVISIONS = 2 // Maximum revision attempts
const CACHE_TTL_HOURS = 24 // Content Pack cache duration

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export async function orchestrate(input: ProjectManagerInput): Promise<ProjectManagerOutput> {
  const startTime = Date.now()
  const correlationId = generateCorrelationId()
  const errors: AgentError[] = []
  
  const context: AgentContext = {
    projectId: input.projectData.id,
    correlationId,
    startTime,
    currentPhase: 'initialization',
    completedAgents: [],
    pendingAgents: ['strategist', 'content-pack-generator', 'editor', 'code-renderer'],
    errors: [],
    metrics: {},
  }

  logAgent('project-manager', 'info', 'Starting orchestration', {
    correlationId,
    projectId: input.projectData.id,
    hasExistingContentPack: !!input.existingContentPack,
    forceRegenerate: input.forceRegenerate,
  })

  try {
    // ==========================================================================
    // PHASE 0: Check for cached Content Pack
    // ==========================================================================
    
    if (!input.forceRegenerate && input.existingContentPack) {
      const cacheValid = await checkContentPackCache(input.existingContentPack, input.projectData)
      
      if (cacheValid) {
        logAgent('project-manager', 'info', 'Using cached Content Pack')
        
        // Skip content generation, go straight to code rendering
        const codeOutput = await runCodeRenderer({
          contentPack: input.existingContentPack,
          projectData: input.projectData,
          addons: input.projectData.selectedAddons,
          framework: 'nextjs',
          version: '14.2.18',
        })
        
        return {
          success: true,
          contentPack: input.existingContentPack,
          generatedFiles: codeOutput.files,
          metrics: {
            totalDuration: Date.now() - startTime,
            phases: [{ name: 'code-render', duration: Date.now() - startTime, agents: ['code-renderer'] }],
            tokenUsage: { prompt: 0, completion: 0, total: 0 },
            cacheHit: true,
          },
          errors: [],
        }
      }
    }

    // ==========================================================================
    // PHASE 1: Strategy (Parallelized)
    // ==========================================================================
    
    context.currentPhase = 'strategy'
    logAgent('project-manager', 'info', 'Phase 1: Strategy')

    const strategyTasks: ParallelTask<StrategistOutput>[] = [
      {
        id: 'strategist',
        name: 'strategist',
        execute: () => runStrategist({
          projectName: input.projectData.name,
          brief: input.projectData.brief,
          targetAudience: input.projectData.targetAudience,
          websiteStyle: input.projectData.websiteStyle,
          packageType: input.projectData.packageType,
          industry: input.projectData.industry,
        }),
        timeout: 120000,
        critical: true,
      },
    ]

    const strategyResults = await runParallel(strategyTasks, {
      maxConcurrency: 3,
      stopOnCriticalFailure: true,
    })

    if (!strategyResults.success) {
      const strategyError = strategyResults.results.find((r) => !r.success)?.error
      if (strategyError) errors.push(strategyError)
      throw new Error('Strategy phase failed')
    }

    const strategy = strategyResults.results[0].result!
    context.completedAgents.push('strategist')

    // ==========================================================================
    // PHASE 2: Content Pack Generation
    // ==========================================================================
    
    context.currentPhase = 'content-generation'
    logAgent('project-manager', 'info', 'Phase 2: Content Pack Generation')

    // Prepare page definitions from strategy
    const pageDefinitions = strategy.siteStructure.pages.map((page) => ({
      slug: page.slug,
      name: page.name,
      sections: page.sections.map((sectionType, index) => ({
        type: sectionType,
        config: {},
      })),
    }))

    // Merge with user-defined pages
    const mergedPages = mergePageDefinitions(pageDefinitions, input.projectData.pages)

    let contentPackOutput: ContentPackGeneratorOutput | null = null
    let revisionCount = 0

    // Content generation with revision loop
    while (revisionCount <= MAX_REVISIONS) {
      contentPackOutput = await runContentPackGenerator({
        strategy,
        projectData: input.projectData,
        pages: mergedPages,
        addons: input.projectData.selectedAddons,
      })

      // Validate Content Pack
      const validation = validateContentPack(contentPackOutput.contentPack)
      if (!validation.valid) {
        logAgent('project-manager', 'warn', 'Content Pack validation failed', {
          errors: validation.errors,
        })
        
        if (revisionCount < MAX_REVISIONS) {
          revisionCount++
          continue
        }
      }

      break
    }

    if (!contentPackOutput) {
      throw new Error('Content Pack generation failed after all retries')
    }

    context.completedAgents.push('content-pack-generator')

    // ==========================================================================
    // PHASE 3: Quality Review
    // ==========================================================================
    
    context.currentPhase = 'quality-review'
    logAgent('project-manager', 'info', 'Phase 3: Quality Review')

    // Quick pre-check
    const quickCheck = quickQualityCheck({
      contentPack: contentPackOutput.contentPack,
      brandStrategy: strategy.brandStrategy,
      generatedCode: null,
    })

    if (!quickCheck.passed) {
      logAgent('project-manager', 'warn', 'Quick check failed', { issues: quickCheck.issues })
    }

    // Full editor review
    const editorOutput = await runEditor({
      contentPack: contentPackOutput.contentPack,
      brandStrategy: strategy.brandStrategy,
      generatedCode: null,
    })

    context.completedAgents.push('editor')

    // Handle revision requests
    if (shouldRequestRevision(editorOutput) && revisionCount < MAX_REVISIONS) {
      logAgent('project-manager', 'info', 'Editor requested revisions', {
        score: editorOutput.finalScore,
        revisionCount: editorOutput.revisions.length,
      })

      // Re-run content pack generator with editor feedback
      // For now, we proceed with a warning
      logAgent('project-manager', 'warn', 'Proceeding with imperfect content', {
        score: editorOutput.finalScore,
        approved: editorOutput.approved,
      })
    }

    // ==========================================================================
    // PHASE 4: Code Rendering
    // ==========================================================================
    
    context.currentPhase = 'code-generation'
    logAgent('project-manager', 'info', 'Phase 4: Code Rendering')

    const codeOutput = await runCodeRenderer({
      contentPack: contentPackOutput.contentPack,
      projectData: input.projectData,
      addons: input.projectData.selectedAddons,
      framework: 'nextjs',
      version: '14.2.18',
    })

    context.completedAgents.push('code-renderer')

    // ==========================================================================
    // PHASE 5: Final Assembly
    // ==========================================================================
    
    context.currentPhase = 'assembly'
    logAgent('project-manager', 'info', 'Phase 5: Final Assembly')

    // Store Content Pack in database for caching
    await storeContentPack(contentPackOutput.contentPack, input.projectData.id)

    const totalDuration = Date.now() - startTime

    const metrics: GenerationMetrics = {
      totalDuration,
      phases: [
        { name: 'strategy', duration: strategyResults.totalDuration, agents: ['strategist'] },
        { name: 'content-generation', duration: 0, agents: ['content-pack-generator'] },
        { name: 'quality-review', duration: 0, agents: ['editor'] },
        { name: 'code-generation', duration: 0, agents: ['code-renderer'] },
      ],
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      cacheHit: false,
    }

    logAgent('project-manager', 'info', 'Orchestration complete', {
      totalDuration,
      fileCount: codeOutput.files.length,
      qualityScore: editorOutput.finalScore,
      approved: editorOutput.approved,
    })

    return {
      success: true,
      contentPack: contentPackOutput.contentPack,
      generatedFiles: codeOutput.files,
      metrics,
      errors,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logAgent('project-manager', 'error', 'Orchestration failed', {
      phase: context.currentPhase,
      error: errorMessage,
    })

    errors.push({
      agent: 'project-manager',
      phase: context.currentPhase,
      code: 'UNKNOWN',
      message: errorMessage,
      details: null,
      recoverable: false,
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      contentPack: input.existingContentPack ?? ({} as ContentPack),
      generatedFiles: [],
      metrics: {
        totalDuration: Date.now() - startTime,
        phases: [],
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        cacheHit: false,
      },
      errors,
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function checkContentPackCache(
  contentPack: ContentPack,
  projectData: ProjectDataExtended
): Promise<boolean> {
  // Check if Content Pack is still valid
  const packAge = Date.now() - new Date(contentPack.generatedAt).getTime()
  const maxAge = CACHE_TTL_HOURS * 60 * 60 * 1000

  if (packAge > maxAge) {
    return false
  }

  // Check if project data hash matches
  const currentHash = hashContent({
    brief: projectData.brief,
    targetAudience: projectData.targetAudience,
    websiteStyle: projectData.websiteStyle,
    pages: projectData.pages,
  })

  // If hash changed significantly, invalidate cache
  // (In production, you'd compare with stored hash)
  
  return true
}

function mergePageDefinitions(
  strategyPages: Array<{ slug: string; name: string; sections: Array<{ type: string; config: Record<string, unknown> }> }>,
  userPages: Array<{ id: string; name: string; slug: string; sections: Array<{ id: string; sectionType: string; config: Record<string, unknown> }> }>
): Array<{ slug: string; name: string; sections: Array<{ type: string; config: Record<string, unknown> }> }> {
  // User-defined pages take precedence
  const merged = new Map<string, typeof strategyPages[0]>()

  // Add strategy pages first
  strategyPages.forEach((page) => {
    merged.set(page.slug, page)
  })

  // Override with user pages
  userPages.forEach((page) => {
    merged.set(page.slug, {
      slug: page.slug,
      name: page.name,
      sections: page.sections.map((s) => ({
        type: s.sectionType,
        config: s.config,
      })),
    })
  })

  return Array.from(merged.values())
}

async function storeContentPack(contentPack: ContentPack, projectId: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      logAgent('project-manager', 'warn', 'Supabase credentials not found, skipping cache')
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Store in project_content_packs table
    const { error } = await supabase
      .from('project_content_packs')
      .upsert({
        project_id: projectId,
        hash: contentPack.hash,
        content: contentPack,
        quality_score: 0, // Will be updated after editor review
        generated_at: contentPack.generatedAt,
        generation_duration: 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id',
      })

    if (error) {
      logAgent('project-manager', 'warn', 'Failed to store Content Pack', { error: error.message })
    } else {
      logAgent('project-manager', 'info', 'Content Pack stored successfully')
    }
  } catch (error) {
    logAgent('project-manager', 'warn', 'Error storing Content Pack', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { QUALITY_THRESHOLD, MAX_REVISIONS }
