// =============================================================================
// AGENT: SANITY-SETUP (Phase 5) - Erstellt Sanity Schema & Content
// 
// Workflow:
// 1. Filtert nur Sanity-relevante Code-Bereiche aus generated_files (Token-effizient)
// 2. Extrahiert Types und Fields aus diesen Bereichen
// 3. Lädt Content-Pack als primäre Datenquelle für den Seed
// 4. Erstellt Sanity Dataset, Schema und Content
// =============================================================================

import { createClient as createSanityClient } from 'npm:@sanity/client@6'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  triggerAgent,
  loadAgentOutput,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, ContentPackOutput } from '../_shared/types/pipeline.ts'

interface SanitySetupOutput {
  projectId: string
  dataset: string
  apiToken: string
  studioUrl: string
  contentCreated: boolean
  schemaTypes: string[]
  documentsCreated: number
}

interface ExtractedSanityType {
  name: string
  fields: Array<{
    name: string
    type: string
    isArray: boolean
    arrayItemFields?: Array<{ name: string; type: string }>
  }>
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
      .select('sanity_project_id, sanity_dataset, sanity_api_token, sanity_studio_url')
      .eq('id', meta.projectId)
      .single()

    if (projectData?.sanity_project_id && projectData?.sanity_api_token && projectData?.sanity_dataset) {
      console.log('[SANITY-SETUP] Already configured - using existing dataset:', projectData.sanity_dataset)
      const output: SanitySetupOutput = {
        projectId: projectData.sanity_project_id,
        dataset: projectData.sanity_dataset,
        apiToken: projectData.sanity_api_token,
        studioUrl: projectData.sanity_studio_url || `/studio/${meta.projectId}`,
        contentCreated: false,
        schemaTypes: [],
        documentsCreated: 0,
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

    // =========================================================================
    // STEP 1: Load Content Pack (PRIMARY data source for Sanity seed)
    // =========================================================================
    console.log('[SANITY-SETUP] Loading Content Pack as primary data source...')
    const contentPack = await loadAgentOutput<ContentPackOutput>(meta.pipelineRunId, 'content-pack')
    
    if (!contentPack) {
      throw new Error('Content Pack not found - Content-Pack Agent must run first')
    }
    console.log('[SANITY-SETUP] Content Pack loaded with', contentPack.pages?.length || 0, 'pages')

    // =========================================================================
    // STEP 2: Extract ONLY Sanity-relevant code snippets (token-efficient)
    // =========================================================================
    console.log('[SANITY-SETUP] Loading and filtering generated code for Sanity references...')
    
    const { data: generatedFiles } = await supabase
      .from('generated_files')
      .select('file_path, content')
      .eq('project_id', meta.projectId)
    
    if (!generatedFiles || generatedFiles.length === 0) {
      throw new Error('No generated files found - Code Renderer must run first')
    }

    // Filter only Sanity-relevant code sections
    const sanityCodeSnippets = extractSanityRelevantCode(generatedFiles)
    console.log(`[SANITY-SETUP] Extracted ${sanityCodeSnippets.length} Sanity-relevant code snippets from ${generatedFiles.length} files`)

    // =========================================================================
    // STEP 3: Extract Sanity types and fields from filtered code
    // =========================================================================
    let extractedTypes = extractSanityTypesFromSnippets(sanityCodeSnippets)
    console.log(`[SANITY-SETUP] Regex-extracted ${extractedTypes.length} types:`, 
      extractedTypes.map(t => t.name).join(', '))

    // =========================================================================
    // STEP 3b: Use AI to refine/enrich schema based on code + content pack
    // =========================================================================
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (openAiKey && sanityCodeSnippets.length > 0) {
      console.log('[SANITY-SETUP] Using AI to refine Sanity schema...')
      try {
        extractedTypes = await refineTypesWithAI(
          extractedTypes,
          sanityCodeSnippets,
          contentPack,
          openAiKey
        )
        console.log(`[SANITY-SETUP] AI-refined to ${extractedTypes.length} types:`,
          extractedTypes.map(t => `${t.name}(${t.fields.length} fields)`).join(', '))
      } catch (aiError) {
        console.warn('[SANITY-SETUP] AI refinement failed, using regex extraction:', aiError)
      }
    }

    // =========================================================================
    // STEP 4: Setup Sanity (dataset, token)
    // =========================================================================
    const datasetName = `p-${meta.projectId.slice(0, 8).toLowerCase()}`
    const sanityProjectId = 'cmrv2qwc'
    
    console.log(`[SANITY-SETUP] Setting up dataset: ${datasetName}`)

    // Create dataset
    const createDatasetRes = await fetch(
      `https://api.sanity.io/v2021-06-07/projects/${sanityProjectId}/datasets/${datasetName}`,
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
      const errorText = await createDatasetRes.text()
      if (!errorText.includes('already exists')) {
        console.warn('[SANITY-SETUP] Dataset warning:', errorText)
      }
    }

    // Create token
    const tokenLabel = `${project.name} - ${datasetName} - ${Date.now()}`
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
    const apiToken = tokenData.key
    console.log(`[SANITY-SETUP] Created token for dataset: ${datasetName}`)

    // =========================================================================
    // STEP 5: Create Sanity content from Content Pack + extracted types
    // =========================================================================
    const documentsCreated = await createSanityContentFromExtracted(
      sanityProjectId,
      datasetName,
      apiToken,
      extractedTypes,
      contentPack,  // Now required, not optional
      project
    )

    // =========================================================================
    // STEP 6: Generate and save Sanity schema files
    // =========================================================================
    const schemaFiles = generateSanitySchemaFiles(extractedTypes)
    for (const file of schemaFiles) {
      await supabase.from('generated_files').upsert({
        project_id: meta.projectId,
        file_path: file.path,
        content: file.content,
        created_at: new Date().toISOString(),
      }, { onConflict: 'project_id,file_path' })
    }
    console.log(`[SANITY-SETUP] Generated ${schemaFiles.length} schema files`)

    // Save config to DB
    const studioUrl = `/studio/${meta.projectId}`
    await supabase
      .from('projects')
      .update({
        sanity_project_id: sanityProjectId,
        sanity_dataset: datasetName,
        sanity_api_token: apiToken,
        sanity_studio_url: studioUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meta.projectId)

    const output: SanitySetupOutput = {
      projectId: sanityProjectId,
      dataset: datasetName,
      apiToken: apiToken,
      studioUrl: studioUrl,
      contentCreated: true,
      schemaTypes: extractedTypes.map(t => t.name),
      documentsCreated,
    }

    const durationMs = Date.now() - startTime
    console.log(`[SANITY-SETUP] Complete in ${durationMs}ms - ${documentsCreated} documents created`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })

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

// =============================================================================
// HELPER: Extract ONLY Sanity-relevant code snippets (Token-efficient)
// =============================================================================
interface SanityCodeSnippet {
  filePath: string
  code: string
  lineStart: number
  lineEnd: number
}

function extractSanityRelevantCode(
  files: Array<{ file_path: string; content: string }>
): SanityCodeSnippet[] {
  const snippets: SanityCodeSnippet[] = []
  
  // Patterns that indicate Sanity usage
  const sanityPatterns = [
    /sanityClient\.fetch/,
    /client\.fetch.*_type/,
    /\*\[_type\s*==\s*["']\w+["']\]/,
    /getImageUrl\(/,
    /urlFor\(/,
  ]
  
  // Content type variable patterns (hero, features, etc.)
  const contentVarPattern = /\b(const|let)\s+(hero|features|testimonials|faq|cta|contact|siteSettings|settings|about|services|team|portfolio|pricing|stats|logos|newsletter|blog)\b/
  
  for (const file of files) {
    // Skip non-code files
    if (!file.file_path.match(/\.(tsx?|jsx?)$/)) continue
    
    const lines = file.content.split('\n')
    let inRelevantBlock = false
    let blockStart = 0
    let braceCount = 0
    let currentSnippet: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Check if line contains Sanity patterns
      const hasSanityPattern = sanityPatterns.some(p => p.test(line))
      const hasContentVar = contentVarPattern.test(line)
      
      if (hasSanityPattern || hasContentVar) {
        if (!inRelevantBlock) {
          // Start capturing - include 2 lines before for context
          blockStart = Math.max(0, i - 2)
          currentSnippet = lines.slice(blockStart, i)
          inRelevantBlock = true
          braceCount = 0
        }
      }
      
      if (inRelevantBlock) {
        currentSnippet.push(line)
        
        // Track braces to capture complete blocks
        braceCount += (line.match(/{/g) || []).length
        braceCount -= (line.match(/}/g) || []).length
        
        // End block after 15 lines or when braces balance
        const linesInBlock = currentSnippet.length
        if ((braceCount <= 0 && linesInBlock > 3) || linesInBlock > 20) {
          snippets.push({
            filePath: file.file_path,
            code: currentSnippet.join('\n'),
            lineStart: blockStart + 1,
            lineEnd: i + 1,
          })
          inRelevantBlock = false
          currentSnippet = []
        }
      }
    }
    
    // Capture any remaining block
    if (currentSnippet.length > 0) {
      snippets.push({
        filePath: file.file_path,
        code: currentSnippet.join('\n'),
        lineStart: blockStart + 1,
        lineEnd: lines.length,
      })
    }
  }
  
  return snippets
}

// =============================================================================
// HELPER: Extract Sanity types from filtered snippets
// =============================================================================
function extractSanityTypesFromSnippets(
  snippets: SanityCodeSnippet[]
): ExtractedSanityType[] {
  const types = new Map<string, ExtractedSanityType>()
  
  for (const snippet of snippets) {
    const content = snippet.code
    
    // Find _type references: *[_type == "hero"]
    const typeMatches = content.matchAll(/\*\[_type\s*==\s*["'](\w+)["']\]/g)
    for (const match of typeMatches) {
      const typeName = match[1]
      if (!types.has(typeName)) {
        types.set(typeName, { name: typeName, fields: [] })
      }
    }
    
    // Find field accesses: hero.headline, settings.siteName
    const fieldMatches = content.matchAll(/\b(hero|features|testimonials|faq|cta|contact|siteSettings|settings|about|services|team|portfolio|pricing|stats|logos|newsletter|blog)\b\.(\w+)/g)
    for (const match of fieldMatches) {
      const typeName = match[1] === 'settings' ? 'siteSettings' : match[1]
      const fieldName = match[2]
      
      if (!types.has(typeName)) {
        types.set(typeName, { name: typeName, fields: [] })
      }
      
      const typeInfo = types.get(typeName)!
      if (!typeInfo.fields.find(f => f.name === fieldName)) {
        const fieldType = inferFieldType(fieldName)
        const isArray = fieldName === 'items' || (fieldName.endsWith('s') && !['address', 'openingHours', 'hours'].includes(fieldName))
        typeInfo.fields.push({ name: fieldName, type: fieldType, isArray })
      }
    }
    
    // Find array item fields: item.title, feature.description
    const itemFieldMatches = content.matchAll(/\b(?:item|feature|testimonial|service|question|member|stat|logo)\.(\w+)/g)
    for (const match of itemFieldMatches) {
      const fieldName = match[1]
      // Add to all types that have 'items' field
      for (const typeInfo of types.values()) {
        const itemsField = typeInfo.fields.find(f => f.name === 'items' && f.isArray)
        if (itemsField) {
          if (!itemsField.arrayItemFields) itemsField.arrayItemFields = []
          if (!itemsField.arrayItemFields.find(f => f.name === fieldName)) {
            itemsField.arrayItemFields.push({ name: fieldName, type: inferFieldType(fieldName) })
          }
        }
      }
    }
  }
  
  return Array.from(types.values())
}

// =============================================================================
// HELPER: Extract Sanity types from generated code (legacy - kept for fallback)
// =============================================================================
function extractSanityTypesFromCode(
  files: Array<{ file_path: string; content: string }>
): ExtractedSanityType[] {
  const types = new Map<string, ExtractedSanityType>()
  
  // Patterns to find Sanity fetch calls
  // e.g., sanityClient.fetch(`*[_type == "hero"][0]`)
  // e.g., await client.fetch<Hero>('*[_type == "hero"][0]')
  const fetchPattern = /(?:sanityClient|client)\.fetch[^`]*`\*\[_type\s*==\s*["'](\w+)["']\]/g
  
  // Pattern to find field access: hero.headline, features.items, etc.
  const fieldAccessPattern = /(?:const|let)\s+\{([^}]+)\}\s*=\s*(?:await\s+)?(?:sanityClient|client)\.fetch|(\w+)\.(\w+)(?:\?\.|\.|(?=\s*&&|\s*\|\||\s*\?))/g
  
  // Pattern for destructuring: const { headline, subheadline } = hero
  const destructurePattern = /const\s+\{\s*([^}]+)\s*\}\s*=\s*(\w+)/g

  for (const file of files) {
    const content = file.content
    
    // Skip non-code files
    if (!file.file_path.match(/\.(tsx?|jsx?)$/)) continue
    
    // Find all _type references
    let match
    while ((match = fetchPattern.exec(content)) !== null) {
      const typeName = match[1]
      if (!types.has(typeName)) {
        types.set(typeName, { name: typeName, fields: [] })
      }
    }
    
    // Find field accesses like: hero.headline, hero.subheadline
    const simpleFieldPattern = /\b(hero|features|testimonials|faq|cta|contact|siteSettings|settings|about|services|team|portfolio|pricing|stats|logos|newsletter|blog)\b\.(\w+)/g
    while ((match = simpleFieldPattern.exec(content)) !== null) {
      const typeName = match[1] === 'settings' ? 'siteSettings' : match[1]
      const fieldName = match[2]
      
      if (!types.has(typeName)) {
        types.set(typeName, { name: typeName, fields: [] })
      }
      
      const typeInfo = types.get(typeName)!
      if (!typeInfo.fields.find(f => f.name === fieldName)) {
        // Infer type from field name
        const fieldType = inferFieldType(fieldName)
        typeInfo.fields.push({ 
          name: fieldName, 
          type: fieldType,
          isArray: fieldName === 'items' || fieldName.endsWith('s') && !['address', 'openingHours'].includes(fieldName)
        })
      }
    }
    
    // Find array item field accesses: item.title, item.description
    const arrayItemPattern = /\.map\([^)]*\(\s*(?:\{[^}]*\}|\w+)\s*(?:,\s*\w+)?\)\s*=>\s*[\s\S]*?(?=\.map\(|$)/g
    const itemFieldPattern = /(?:item|testimonial|feature|service|question|member)\.(\w+)/g
    
    while ((match = itemFieldPattern.exec(content)) !== null) {
      const fieldName = match[1]
      // These are typically array item fields for features, testimonials, etc.
      for (const [typeName, typeInfo] of types) {
        const itemsField = typeInfo.fields.find(f => f.name === 'items' && f.isArray)
        if (itemsField) {
          if (!itemsField.arrayItemFields) {
            itemsField.arrayItemFields = []
          }
          if (!itemsField.arrayItemFields.find(f => f.name === fieldName)) {
            itemsField.arrayItemFields.push({
              name: fieldName,
              type: inferFieldType(fieldName)
            })
          }
        }
      }
    }
  }
  
  // Ensure we have at least the base types
  const baseTypes = ['siteSettings', 'hero']
  for (const baseName of baseTypes) {
    if (!types.has(baseName)) {
      types.set(baseName, { 
        name: baseName, 
        fields: baseName === 'siteSettings' 
          ? [
              { name: 'siteName', type: 'string', isArray: false },
              { name: 'siteDescription', type: 'text', isArray: false },
              { name: 'primaryColor', type: 'string', isArray: false },
              { name: 'secondaryColor', type: 'string', isArray: false },
              { name: 'logo', type: 'image', isArray: false },
              { name: 'contactEmail', type: 'string', isArray: false },
              { name: 'contactPhone', type: 'string', isArray: false },
            ]
          : [
              { name: 'headline', type: 'string', isArray: false },
              { name: 'subheadline', type: 'text', isArray: false },
              { name: 'ctaText', type: 'string', isArray: false },
              { name: 'ctaLink', type: 'string', isArray: false },
            ]
      })
    }
  }
  
  return Array.from(types.values())
}

function inferFieldType(fieldName: string): string {
  const lowerName = fieldName.toLowerCase()
  
  if (lowerName.includes('image') || lowerName === 'logo' || lowerName === 'avatar' || lowerName === 'photo') {
    return 'image'
  }
  if (lowerName.includes('description') || lowerName.includes('text') || lowerName === 'quote' || lowerName === 'answer' || lowerName === 'content') {
    return 'text'
  }
  if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('href')) {
    return 'url'
  }
  if (lowerName.includes('email')) {
    return 'email'
  }
  if (lowerName.includes('color')) {
    return 'color'
  }
  if (lowerName.includes('date') || lowerName.includes('time')) {
    return 'datetime'
  }
  if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('rating') || lowerName.includes('count')) {
    return 'number'
  }
  if (lowerName === 'items' || lowerName.endsWith('List')) {
    return 'array'
  }
  
  return 'string'
}

// =============================================================================
// HELPER: Create Sanity content from Content Pack (PRIMARY) + extracted types
// =============================================================================
async function createSanityContentFromExtracted(
  sanityProjectId: string,
  dataset: string,
  apiToken: string,
  extractedTypes: ExtractedSanityType[],
  contentPack: ContentPackOutput,
  project: AgentEnvelope['project']
): Promise<number> {
  const client = createSanityClient({
    projectId: sanityProjectId,
    dataset,
    token: apiToken,
    apiVersion: '2024-01-01',
    useCdn: false
  })

  console.log('[SANITY-SETUP] Creating Sanity content from Content Pack...')

  const transaction = client.transaction()
  let docCount = 0

  // =========================================================================
  // Build content map from Content Pack (PRIMARY SOURCE)
  // =========================================================================
  const contentByType = new Map<string, Record<string, unknown>>()
  
  // Site settings from Content Pack
  if (contentPack.siteSettings) {
    contentByType.set('siteSettings', {
      siteName: contentPack.siteSettings.name || project.name,
      siteDescription: contentPack.siteSettings.description || project.brief,
      tagline: contentPack.siteSettings.tagline,
      primaryColor: contentPack.siteSettings.colors?.primary || project.primaryColor,
      secondaryColor: contentPack.siteSettings.colors?.secondary || project.secondaryColor,
      contactEmail: contentPack.siteSettings.contact?.email || project.contact?.email,
      contactPhone: contentPack.siteSettings.contact?.phone || project.contact?.phone,
      address: contentPack.siteSettings.contact?.address || project.contact?.address,
    })
  }

  // Extract section content from pages
  if (contentPack.pages) {
    for (const page of contentPack.pages) {
      for (const section of page.sections || []) {
        const sectionType = (section.type || '').toLowerCase()
        if (!sectionType) continue
        
        // Map section content to Sanity document format
        const sectionContent = section.content as Record<string, unknown> || {}
        
        // Merge with existing (first occurrence wins for most fields)
        const existing = contentByType.get(sectionType) || {}
        contentByType.set(sectionType, { ...sectionContent, ...existing })
      }
    }
  }

  console.log('[SANITY-SETUP] Content types from Content Pack:', Array.from(contentByType.keys()).join(', '))

  // =========================================================================
  // Create Sanity documents for each extracted type
  // =========================================================================
  for (const sanityType of extractedTypes) {
    const typeName = sanityType.name
    const packContent = contentByType.get(typeName) || {}
    
    // Build document
    const doc: Record<string, unknown> = {
      _id: typeName,
      _type: typeName,
    }

    // Fill fields from Content Pack first, then fallbacks
    for (const field of sanityType.fields) {
      let value = packContent[field.name]
      
      // Try common field name variations
      if (value === undefined) {
        const variations = getFieldNameVariations(field.name)
        for (const variation of variations) {
          if (packContent[variation] !== undefined) {
            value = packContent[variation]
            break
          }
        }
      }
      
      // Use fallback only if Content Pack doesn't have the value
      if (value === undefined || value === null) {
        value = getDefaultValueFromProject(field.name, project, contentPack)
      }
      
      // Handle arrays with _key
      if (field.isArray && Array.isArray(value)) {
        doc[field.name] = value.map((item: Record<string, unknown>, i: number) => ({
          _key: `${field.name}-${i}`,
          ...item
        }))
      } else if (value !== undefined && value !== null) {
        doc[field.name] = value
      }
    }

    transaction.createOrReplace(doc)
    docCount++
    console.log(`[SANITY-SETUP] Created: ${typeName} with ${Object.keys(doc).length - 2} fields`)
  }

  // =========================================================================
  // Create documents for Content Pack types not in extracted types
  // =========================================================================
  for (const [typeName, content] of contentByType) {
    if (!extractedTypes.find(t => t.name === typeName)) {
      // Create basic document for types found in Content Pack but not in code
      const doc: Record<string, unknown> = {
        _id: typeName,
        _type: typeName,
        ...content
      }
      
      // Add _key to arrays
      for (const [key, value] of Object.entries(doc)) {
        if (Array.isArray(value)) {
          doc[key] = value.map((item: unknown, i: number) => 
            typeof item === 'object' && item !== null 
              ? { _key: `${key}-${i}`, ...item as Record<string, unknown> }
              : item
          )
        }
      }
      
      transaction.createOrReplace(doc)
      docCount++
      console.log(`[SANITY-SETUP] Created from Content Pack: ${typeName}`)
    }
  }

  await transaction.commit()
  return docCount
}

function getFieldNameVariations(fieldName: string): string[] {
  const variations = [fieldName]
  
  // camelCase <-> snake_case
  variations.push(fieldName.replace(/([A-Z])/g, '_$1').toLowerCase())
  variations.push(fieldName.replace(/_([a-z])/g, (_, c) => c.toUpperCase()))
  
  // Common variations
  const variationMap: Record<string, string[]> = {
    'headline': ['title', 'heading', 'header'],
    'subheadline': ['subtitle', 'subheading', 'description'],
    'ctaText': ['buttonText', 'button_text', 'cta_text'],
    'ctaLink': ['buttonLink', 'button_link', 'cta_link', 'href', 'url'],
    'sectionTitle': ['title', 'headline', 'heading'],
    'sectionSubtitle': ['subtitle', 'description', 'subheading'],
    'items': ['features', 'services', 'testimonials', 'questions', 'list'],
  }
  
  if (variationMap[fieldName]) {
    variations.push(...variationMap[fieldName])
  }
  
  return variations
}

function getDefaultValueFromProject(
  fieldName: string, 
  project: AgentEnvelope['project'],
  contentPack: ContentPackOutput
): unknown {
  const lowerName = fieldName.toLowerCase()
  
  // Direct project mappings
  if (lowerName === 'sitename') return project.name
  if (lowerName === 'sitedescription') return project.brief
  if (lowerName === 'primarycolor') return project.primaryColor
  if (lowerName === 'secondarycolor') return project.secondaryColor
  if (lowerName === 'contactemail' || lowerName === 'email') return project.contact?.email
  if (lowerName === 'contactphone' || lowerName === 'phone') return project.contact?.phone
  if (lowerName === 'address') return project.contact?.address
  
  // Use tagline from Content Pack
  if (lowerName === 'headline' || lowerName === 'tagline') {
    return contentPack.siteSettings?.tagline || `Willkommen bei ${project.name}`
  }
  
  // Default CTAs
  if (lowerName === 'ctatext' || lowerName === 'buttontext') return 'Jetzt starten'
  if (lowerName === 'ctalink' || lowerName === 'buttonlink') return '/kontakt'
  
  // Default items from USPs
  if (lowerName === 'items' && project.usps?.length) {
    return project.usps.map((usp, i) => ({
      title: usp,
      description: 'Professionelle Lösungen für Ihre Anforderungen.',
      icon: ['Star', 'Check', 'Heart', 'Zap'][i % 4]
    }))
  }
  
  return undefined
}

// =============================================================================
// HELPER: Generate Sanity schema files from extracted types
// =============================================================================
function generateSanitySchemaFiles(types: ExtractedSanityType[]): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []
  
  // Generate individual schema files
  for (const type of types) {
    const schemaContent = generateSchemaForType(type)
    files.push({
      path: `sanity/schemaTypes/${type.name}.ts`,
      content: schemaContent
    })
  }
  
  // Generate index.ts that exports all schemas
  const indexContent = [
    "// Auto-generated Sanity schema index",
    "// Based on Code Renderer output",
    "",
    ...types.map(t => `import ${t.name} from './${t.name}'`),
    "",
    "export const schemaTypes = [",
    ...types.map(t => `  ${t.name},`),
    "]",
  ].join('\n')
  
  files.push({
    path: 'sanity/schemaTypes/index.ts',
    content: indexContent
  })
  
  return files
}

function generateSchemaForType(type: ExtractedSanityType): string {
  const titleMap: Record<string, string> = {
    siteSettings: 'Website Einstellungen',
    hero: 'Hero Sektion',
    features: 'Leistungen',
    services: 'Services',
    testimonials: 'Kundenstimmen',
    faq: 'Häufige Fragen',
    cta: 'Call to Action',
    contact: 'Kontakt',
    about: 'Über uns',
    team: 'Team',
    portfolio: 'Portfolio',
    pricing: 'Preise',
    stats: 'Statistiken',
    logos: 'Partner Logos',
    newsletter: 'Newsletter',
    blog: 'Blog',
  }
  
  const title = titleMap[type.name] || type.name.charAt(0).toUpperCase() + type.name.slice(1)
  
  const fieldDefinitions = type.fields.map(field => {
    if (field.isArray && field.arrayItemFields) {
      // Array with object items
      const itemFields = field.arrayItemFields.map(f => 
        `          defineField({ name: '${f.name}', title: '${formatTitle(f.name)}', type: '${mapToSanityType(f.type)}' }),`
      ).join('\n')
      
      return `    defineField({
      name: '${field.name}',
      title: '${formatTitle(field.name)}',
      type: 'array',
      of: [defineArrayMember({
        type: 'object',
        fields: [
${itemFields}
        ],
      })],
    }),`
    } else if (field.type === 'image') {
      return `    defineField({ name: '${field.name}', title: '${formatTitle(field.name)}', type: 'image', options: { hotspot: true } }),`
    } else {
      return `    defineField({ name: '${field.name}', title: '${formatTitle(field.name)}', type: '${mapToSanityType(field.type)}' }),`
    }
  }).join('\n')
  
  const hasArrayMember = type.fields.some(f => f.isArray && f.arrayItemFields)
  const imports = hasArrayMember 
    ? "import { defineType, defineField, defineArrayMember } from 'sanity'"
    : "import { defineType, defineField } from 'sanity'"
  
  return `${imports}

export default defineType({
  name: '${type.name}',
  title: '${title}',
  type: 'document',
  fields: [
${fieldDefinitions}
  ],
})
`
}

function formatTitle(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

function mapToSanityType(inferredType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    text: 'text',
    url: 'url',
    email: 'string', // Sanity doesn't have email type, use string
    color: 'color',
    datetime: 'datetime',
    number: 'number',
    image: 'image',
    array: 'array',
  }
  return typeMap[inferredType] || 'string'
}

// =============================================================================
// HELPER: Trigger next agent
// Phase 5 Flow: sanity-setup → resend-setup (if booking) → analytics (if enterprise) → deployer
// =============================================================================
async function triggerNextAgent(envelope: AgentEnvelope, meta: AgentEnvelope['meta']) {
  const addons = envelope.project.addons || []
  const packageType = envelope.project.packageType || 'starter'
  const hasBooking = addons.includes('booking_form')
  const hasAnalytics = packageType === 'enterprise' || addons.includes('analytics')

  if (hasBooking) {
    // Next: resend-setup
    console.log('[SANITY-SETUP] Triggering resend-setup...')
    await triggerAgent('resend-setup', {
      ...envelope,
      meta: { ...meta, agentName: 'email', phase: 5, sequence: 2, timestamp: new Date().toISOString() },
    })
  } else if (hasAnalytics) {
    // Next: analytics (skip resend)
    console.log('[SANITY-SETUP] Triggering analytics...')
    await triggerAgent('analytics', {
      ...envelope,
      meta: { ...meta, agentName: 'analytics', phase: 5, sequence: 3, timestamp: new Date().toISOString() },
    })
  } else {
    // Next: deployer (skip resend + analytics)
    console.log('[SANITY-SETUP] Triggering deployer...')
    await triggerAgent('deployer', {
      ...envelope,
      meta: { ...meta, agentName: 'deployer', phase: 6, sequence: 1, timestamp: new Date().toISOString() },
    })
  }
}

// =============================================================================
// AI-POWERED: Refine schema types using GPT based on code + Content Pack
// =============================================================================

async function refineTypesWithAI(
  regexTypes: ExtractedSanityType[],
  codeSnippets: SanityCodeSnippet[],
  contentPack: ContentPackOutput,
  apiKey: string
): Promise<ExtractedSanityType[]> {
  
  // Build a compact summary of snippets (limit tokens)
  const snippetSummary = codeSnippets
    .slice(0, 15) // Max 15 snippets
    .map(s => `// ${s.filePath}:${s.lineStart}\n${s.code}`)
    .join('\n\n')
  
  // Build content pack summary (only section types and field names)
  const contentSummary = contentPack.pages?.map(page => ({
    slug: page.slug,
    sections: page.sections?.map(s => ({
      type: s.type,
      fields: Object.keys(s.content || {}),
    }))
  }))

  const systemPrompt = `You are a Sanity CMS schema expert. Analyze the code snippets and content pack to generate accurate Sanity document types.

Return a JSON array of types with this exact structure:
{
  "types": [
    {
      "name": "hero",
      "fields": [
        { "name": "headline", "type": "string", "isArray": false },
        { "name": "subheadline", "type": "text", "isArray": false },
        { "name": "items", "type": "array", "isArray": true, "arrayItemFields": [
          { "name": "title", "type": "string" },
          { "name": "description", "type": "text" }
        ]}
      ]
    }
  ]
}

Valid field types: string, text, url, number, image, datetime, color, array
Only include types actually used in the code. Match field names exactly to what the code expects.`

  const userPrompt = `## Regex-extracted types (starting point):
${JSON.stringify(regexTypes, null, 2)}

## Sanity-related code snippets:
${snippetSummary}

## Content Pack structure:
${JSON.stringify(contentSummary, null, 2)}

Analyze and return the refined Sanity types JSON. Ensure all fields accessed in code are included.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.2-codex',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No response from AI')
  }

  const parsed = JSON.parse(content)
  
  // Validate structure
  if (!Array.isArray(parsed.types)) {
    throw new Error('Invalid AI response format')
  }

  console.log(`[SANITY-SETUP] AI tokens used: ${data.usage?.total_tokens || 'unknown'}`)
  
  return parsed.types as ExtractedSanityType[]
}
