// =============================================================================
// PIPELINE & AGENT TYPES
// Standardized JSON interfaces for inter-agent communication
// =============================================================================

export type AgentName =
  | 'strategist'
  | 'seo'
  | 'legal'
  | 'visual'
  | 'image'
  | 'collector'
  | 'content-pack'
  | 'editor'
  | 'code-renderer'
  | 'shared-components'
  | 'page-builder'
  | 'code-collector'
  | 'cms'
  | 'email'
  | 'analytics'
  | 'deployer'

export type PipelineStatus =
  | 'pending'
  | 'phase_1'
  | 'phase_2'
  | 'phase_3'
  | 'phase_4'
  | 'phase_5'
  | 'phase_6'
  | 'completed'
  | 'failed'
  | 'needs_human'
  | 'cancelled'

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

// =============================================================================
// AGENT ENVELOPE - Input for every agent
// =============================================================================
export interface AgentEnvelope {
  meta: {
    pipelineRunId: string
    projectId: string
    correlationId: string
    agentName: AgentName
    phase: number
    sequence: number
    attempt: number
    maxAttempts: number
    timestamp: string
  }
  
  project: ProjectData
  
  // IDs of previous agent runs to load outputs from
  previousAgentRunIds?: Partial<Record<AgentName, string>>
}

export interface ProjectData {
  id: string
  name: string
  brief: string
  targetAudience: string
  websiteStyle: string
  packageType: 'basic' | 'professional' | 'enterprise'
  primaryColor: string
  secondaryColor: string
  brandVoice: string
  industry: string
  companySize: string
  foundedYear?: number
  location: {
    city: string
    country: string
  }
  contact: {
    email: string
    phone: string
    address: string
  }
  pages: Array<{
    id: string
    name: string
    slug: string
    sections: string[]
  }>
  addons: string[]
  competitors: string[]
  usps: string[]
  existingContent?: Record<string, unknown>
  seoPreferences?: Record<string, unknown>
}

// =============================================================================
// AGENT RESPONSE - Output from every agent
// =============================================================================
export interface AgentResponse<T = unknown> {
  success: boolean
  agentRunId: string
  agentName: AgentName
  
  output: T
  
  quality: {
    score: number
    passed: boolean
    issues: string[]
    criticalCount: number
  }
  
  control: {
    nextPhase: number | null
    nextAgents: AgentName[]
    shouldRetry: boolean
    retryAgent: AgentName | null
    retryReason: string | null
    isComplete: boolean
    abort: boolean
    abortReason: string | null
  }
  
  metrics: {
    durationMs: number
    inputTokens: number
    outputTokens: number
    model: string
    costUsd: number
  }
  
  error?: {
    code: string
    message: string
    recoverable: boolean
  }
}

// =============================================================================
// PHASE CONFIGURATION
// =============================================================================
export const PHASE_CONFIG = {
  1: {
    name: 'Foundation',
    agents: ['strategist', 'seo', 'legal', 'visual', 'image'] as AgentName[],
    parallel: true,
    required: ['strategist'], // Must complete for next phase
  },
  2: {
    name: 'Content Generation',
    agents: ['content-pack'] as AgentName[],
    parallel: false,
    required: ['content-pack'],
  },
  3: {
    name: 'Quality Gate',
    agents: ['editor'] as AgentName[],
    parallel: false,
    required: ['editor'],
    qualityThreshold: 8.0,
    canRetryPrevious: true,
  },
  4: {
    name: 'Code Generation',
    agents: ['code-renderer'] as AgentName[],
    parallel: false,
    required: ['code-renderer'],
  },
  5: {
    name: 'Integrations',
    agents: ['cms', 'email', 'analytics'] as AgentName[],
    parallel: true,
    required: [], // All optional based on addons
    addonMapping: {
      'cms': ['cms_base'],
      'email': ['booking_form'],
      'analytics': [], // Always run if enterprise
    },
  },
  6: {
    name: 'Deployment',
    agents: ['deployer'] as AgentName[],
    parallel: false,
    required: ['deployer'],
  },
} as const

// =============================================================================
// AGENT OUTPUT TYPES
// =============================================================================

export interface StrategistOutput {
  brandStrategy: {
    identity: {
      name: string
      tagline: string
      shortDescription: string
      longDescription: string
      brandVoice: string
      personality: string[]
    }
    positioning: string
    uniqueValueProposition: string
    keyMessages: string[]
    toneOfVoice: {
      primary: string
      descriptors: string[]
      doList: string[]
      dontList: string[]
    }
    targetPersonas: Array<{
      name: string
      role: string
      goals: string[]
      painPoints: string[]
    }>
  }
  contentStrategy: {
    pillars: Array<{
      name: string
      description: string
      topics: string[]
    }>
    keyTopics: string[]
    callToActions: Array<{
      type: string
      text: string
      placement: string[]
    }>
  }
  siteStructure: {
    pages: Array<{
      slug: string
      name: string
      purpose: string
      sections: string[]
      priority: string
    }>
    navigationFlow: string
    conversionFunnel: string[]
  }
}

export interface SeoOutput {
  keywordStrategy: {
    primary: string[]
    secondary: string[]
    longTail: string[]
  }
  metaStrategy: Array<{
    pageSlug: string
    title: string
    description: string
    keywords: string[]
    ogType: string
  }>
  structuredData: Array<{
    pageSlug: string
    type: string
    data: Record<string, unknown>
  }>
  technicalRecommendations: string[]
}

export interface LegalOutput {
  imprint: {
    companyName: string
    legalForm: string | null
    representative: string | null
    address: {
      street: string
      zip: string
      city: string
      country: string
    }
    email: string
    phone: string | null
    vatId: string | null
    registryCourt: string | null
    registryNumber: string | null
  }
  privacy: {
    lastUpdated: string
    sections: Array<{
      title: string
      content: string
    }>
    dataProcessingPurposes: string[]
    thirdPartyServices: Array<{
      name: string
      purpose: string
      privacyUrl: string
    }>
  }
  cookies: {
    necessary: Array<{ name: string; purpose: string; duration: string }>
    functional: Array<{ name: string; purpose: string; duration: string }>
    analytics: Array<{ name: string; purpose: string; duration: string }>
    marketing: Array<{ name: string; purpose: string; duration: string }>
  }
}

export interface VisualOutput {
  colorScheme: {
    primary: string
    secondary: string
    accent: string
    background: string
    surface: string
    text: string
    textMuted: string
    border: string
    success: string
    warning: string
    error: string
  }
  typography: {
    headingFont: string
    bodyFont: string
    scale: {
      h1: string
      h2: string
      h3: string
      h4: string
      body: string
      small: string
    }
  }
  spacing: {
    section: string
    component: string
    element: string
  }
  borderRadius: string
  shadows: {
    sm: string
    md: string
    lg: string
  }
}

export interface ImageOutput {
  images: Array<{
    id: string
    purpose: string // 'hero', 'about', 'team', 'feature-1', etc.
    source: 'pexels' | 'pixabay' | 'uploaded'
    url: string
    thumbnailUrl: string
    alt: string
    credit: {
      name: string
      url: string
    }
    width: number
    height: number
  }>
  placeholders: Array<{
    purpose: string
    fallbackColor: string
    aspectRatio: string
  }>
}

export interface ContentPackOutput {
  siteSettings: {
    name: string
    tagline: string
    description: string
    colors: Record<string, string>
    fonts: { heading: string; body: string }
    contact: { email: string; phone: string; address: string }
    social: Record<string, string>
  }
  pages: Array<{
    slug: string
    name: string
    title: string
    description: string
    sections: Array<{
      type: string
      content: Record<string, unknown>
    }>
  }>
  navigation: {
    main: Array<{ label: string; href: string }>
    footer: Array<{ label: string; href: string }>
  }
  footer: {
    copyright: string
    links: Array<{ label: string; href: string }>
  }
}

export interface EditorOutput {
  qualityScore: {
    overall: number
    categories: {
      brandConsistency: number
      contentQuality: number
      seoOptimization: number
      userExperience: number
      technicalAccuracy: number
    }
  }
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low'
    category: string
    description: string
    location: string
    suggestion: string
  }>
  improvements: Record<string, unknown>
  approved: boolean
}

export interface CodeRendererOutput {
  files: Array<{
    path: string
    content: string
  }>
}

export interface CmsOutput {
  sanityProjectId: string
  sanityDataset: string
  schemas: string[]
  documentsCreated: number
  studioUrl: string
}

export interface EmailOutput {
  resendDomainId: string
  domain: string
  dnsRecords: Array<{
    type: string
    name: string
    value: string
    ttl: number
  }>
  verified: boolean
}

export interface AnalyticsOutput {
  provider: 'ga4' | 'plausible'
  trackingId: string
  eventsConfigured: string[]
  conversionGoals: string[]
}

export interface DeployerOutput {
  deploymentId: string
  previewUrl: string
  productionUrl: string | null
  status: 'success' | 'building' | 'failed'
  buildLogs: string[]
}
