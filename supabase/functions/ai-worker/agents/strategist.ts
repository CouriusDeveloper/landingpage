// Strategist Agent - Develops brand strategy and content architecture
// First agent to run - provides foundation for all other agents

import type {
  StrategistInput,
  StrategistOutput,
  BrandStrategy,
  ContentStrategy,
  SiteStructure,
} from '../types/agents.ts'
import { runAgent, buildUserPrompt, logAgent } from '../utils/agent-runner.ts'

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const STRATEGIST_SYSTEM_PROMPT = `You are an elite Brand Strategist and Digital Marketing Expert with 20+ years of experience creating successful website strategies for premium brands.

Your role is to analyze the client's business and create a comprehensive brand and content strategy that will make their website stand out and convert visitors into customers.

## Your Expertise:
- Brand positioning and differentiation
- Target audience analysis and persona development
- Content strategy and information architecture
- Competitive analysis
- Conversion optimization
- User experience best practices

## Output Requirements:
You MUST return a valid JSON object with this exact structure:

{
  "brandStrategy": {
    "identity": {
      "name": "string",
      "tagline": "string (10-15 words max)",
      "shortDescription": "string (1-2 sentences)",
      "longDescription": "string (brand story, 3-5 paragraphs)",
      "logoUrl": null,
      "favicon": null,
      "brandVoice": "professional|friendly|playful|luxurious|technical",
      "personality": ["trait1", "trait2", "trait3"]
    },
    "positioning": "string (unique position in market)",
    "uniqueValueProposition": "string (what makes them special)",
    "keyMessages": ["message1", "message2", "message3"],
    "toneOfVoice": {
      "primary": "string",
      "descriptors": ["desc1", "desc2", "desc3"],
      "doList": ["guideline1", "guideline2"],
      "dontList": ["avoid1", "avoid2"],
      "examplePhrases": ["phrase1", "phrase2"]
    },
    "targetPersonas": [{
      "name": "string",
      "role": "string",
      "goals": ["goal1", "goal2"],
      "painPoints": ["pain1", "pain2"],
      "preferences": ["pref1", "pref2"]
    }]
  },
  "contentStrategy": {
    "pillars": [{
      "name": "string",
      "description": "string",
      "topics": ["topic1", "topic2"]
    }],
    "keyTopics": ["topic1", "topic2"],
    "callToActions": [{
      "type": "primary|secondary|micro",
      "text": "string",
      "placement": ["hero", "services"],
      "goal": "string"
    }],
    "contentGaps": ["gap1", "gap2"]
  },
  "siteStructure": {
    "pages": [{
      "slug": "string",
      "name": "string",
      "purpose": "string",
      "sections": ["hero", "features"],
      "priority": "high|medium|low"
    }],
    "navigationFlow": "string",
    "conversionFunnel": ["step1", "step2"]
  },
  "competitiveAnalysis": [{
    "aspect": "string",
    "observation": "string",
    "opportunity": "string"
  }],
  "recommendations": ["rec1", "rec2"]
}

## Guidelines:
1. Create a UNIQUE brand voice - avoid generic corporate speak
2. Focus on what makes THIS business special
3. Target personas should be specific and realistic
4. CTAs should be action-oriented and compelling
5. Site structure should support the conversion funnel
6. All content should serve the target audience's needs
7. Be creative but stay grounded in business reality`

// =============================================================================
// STRATEGIST AGENT
// =============================================================================

export async function runStrategist(input: StrategistInput): Promise<StrategistOutput> {
  logAgent('strategist', 'info', 'Starting brand strategy development', {
    projectName: input.projectName,
    targetAudience: input.targetAudience,
  })

  const userPrompt = buildUserPrompt({
    'Project Overview': {
      name: input.projectName,
      brief: input.brief,
      targetAudience: input.targetAudience,
      style: input.websiteStyle,
      packageType: input.packageType,
      industry: input.industry,
    },
    'Your Task': `Analyze this business and create a comprehensive brand strategy, content strategy, and site structure that will make their website exceptional.

Focus on:
1. Creating a unique and memorable brand identity
2. Understanding the target audience deeply
3. Developing compelling key messages
4. Structuring the site for maximum conversion
5. Identifying competitive opportunities

The website style should be: ${input.websiteStyle}
The package type is: ${input.packageType}
${input.industry ? `The industry is: ${input.industry}` : ''}

Return your complete strategy as a JSON object.`,
  })

  const result = await runAgent<StrategistOutput>({
    agentName: 'strategist',
    systemPrompt: STRATEGIST_SYSTEM_PROMPT,
    userPrompt,
    validateOutput: isValidStrategistOutput,
  })

  if (!result.success || !result.output) {
    logAgent('strategist', 'error', 'Strategy generation failed', {
      error: result.error?.message,
    })
    throw new Error(result.error?.message || 'Strategist agent failed')
  }

  logAgent('strategist', 'info', 'Strategy complete', {
    duration: result.duration,
    tokensUsed: result.tokensUsed,
    pages: result.output.siteStructure.pages.length,
    personas: result.output.brandStrategy.targetPersonas.length,
  })

  return result.output
}

// =============================================================================
// VALIDATION
// =============================================================================

function isValidStrategistOutput(output: unknown): output is StrategistOutput {
  if (!output || typeof output !== 'object') return false
  
  const o = output as Record<string, unknown>
  
  // Check required top-level properties
  if (!o.brandStrategy || typeof o.brandStrategy !== 'object') return false
  if (!o.contentStrategy || typeof o.contentStrategy !== 'object') return false
  if (!o.siteStructure || typeof o.siteStructure !== 'object') return false
  
  // Check brandStrategy.identity
  const brandStrategy = o.brandStrategy as Record<string, unknown>
  if (!brandStrategy.identity || typeof brandStrategy.identity !== 'object') return false
  
  const identity = brandStrategy.identity as Record<string, unknown>
  if (typeof identity.name !== 'string') return false
  if (typeof identity.tagline !== 'string') return false
  
  // Check siteStructure.pages
  const siteStructure = o.siteStructure as Record<string, unknown>
  if (!Array.isArray(siteStructure.pages)) return false
  
  return true
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getDefaultSiteStructure(packageType: string): SiteStructure {
  const basePages = [
    {
      slug: '/',
      name: 'Home',
      purpose: 'Primary landing page for conversions',
      sections: ['hero', 'features', 'services', 'testimonials', 'cta'],
      priority: 'high' as const,
    },
    {
      slug: '/about',
      name: 'About',
      purpose: 'Build trust and show brand story',
      sections: ['hero', 'about', 'team', 'values'],
      priority: 'medium' as const,
    },
    {
      slug: '/contact',
      name: 'Contact',
      purpose: 'Lead generation',
      sections: ['hero', 'contact', 'faq'],
      priority: 'high' as const,
    },
  ]

  // Add more pages for premium packages
  if (packageType === 'premium' || packageType === 'enterprise') {
    basePages.push(
      {
        slug: '/services',
        name: 'Services',
        purpose: 'Showcase offerings in detail',
        sections: ['hero', 'services', 'pricing', 'cta'],
        priority: 'high' as const,
      },
      {
        slug: '/portfolio',
        name: 'Portfolio',
        purpose: 'Show work and build credibility',
        sections: ['hero', 'portfolio', 'testimonials'],
        priority: 'medium' as const,
      }
    )
  }

  return {
    pages: basePages,
    navigationFlow: 'Home → Services → Portfolio → About → Contact',
    conversionFunnel: ['Awareness', 'Interest', 'Desire', 'Action'],
  }
}

export function mergeWithDefaultStrategy(
  output: Partial<StrategistOutput>,
  input: StrategistInput
): StrategistOutput {
  return {
    brandStrategy: output.brandStrategy ?? {
      identity: {
        name: input.projectName,
        tagline: '',
        shortDescription: '',
        longDescription: '',
        logoUrl: null,
        favicon: null,
        brandVoice: 'professional',
        personality: [],
      },
      positioning: '',
      uniqueValueProposition: '',
      keyMessages: [],
      toneOfVoice: {
        primary: 'professional',
        descriptors: [],
        doList: [],
        dontList: [],
        examplePhrases: [],
      },
      targetPersonas: [],
    },
    contentStrategy: output.contentStrategy ?? {
      pillars: [],
      keyTopics: [],
      callToActions: [],
      contentGaps: [],
    },
    siteStructure: output.siteStructure ?? getDefaultSiteStructure(input.packageType),
    competitiveAnalysis: output.competitiveAnalysis ?? [],
    recommendations: output.recommendations ?? [],
  }
}
