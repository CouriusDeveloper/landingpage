// Agent Types - Interfaces for all Multi-Agent system components
// Each agent has a specific role and produces typed output

import type {
  ContentPack,
  BrandIdentity,
  ColorScheme,
  SeoContent,
  PageContent,
  QualityScores,
} from './content-pack.ts'

// Re-export QualityScores for convenience
export type { QualityScores } from './content-pack.ts'

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

export interface AgentConfig {
  name: AgentName
  model: ModelName
  temperature: number
  maxTokens: number
  timeout: number // ms
  retries: number
  systemPrompt: string
}

export type AgentName =
  | 'strategist'
  | 'content-pack-generator'
  | 'seo-specialist'
  | 'legal-expert'
  | 'visual-designer'
  | 'code-renderer'
  | 'editor'
  | 'project-manager'

export type ModelName = 'gpt-5.2-chat-latest' | 'gpt-5.2-codex'

// =============================================================================
// AGENT INPUT/OUTPUT TYPES
// =============================================================================

// ----- Project Manager (Orchestrator) -----

export interface ProjectManagerInput {
  projectData: ProjectDataExtended
  existingContentPack: ContentPack | null
  forceRegenerate: boolean
}

export interface ProjectManagerOutput {
  success: boolean
  contentPack: ContentPack
  generatedFiles: GeneratedFileOutput[]
  metrics: GenerationMetrics
  errors: AgentError[]
}

export interface GenerationMetrics {
  totalDuration: number
  phases: PhaseMetric[]
  tokenUsage: TokenUsage
  cacheHit: boolean
}

export interface PhaseMetric {
  name: string
  duration: number
  agents: string[]
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
}

// ----- Strategist Agent -----

export interface StrategistInput {
  projectName: string
  brief: string
  targetAudience: string
  websiteStyle: string
  packageType: string
  industry: string | null
}

export interface StrategistOutput {
  brandStrategy: BrandStrategy
  contentStrategy: ContentStrategy
  siteStructure: SiteStructure
  competitiveAnalysis: CompetitiveInsight[]
  recommendations: string[]
}

export interface BrandStrategy {
  identity: BrandIdentity
  positioning: string
  uniqueValueProposition: string
  keyMessages: string[]
  toneOfVoice: ToneOfVoice
  targetPersonas: PersonaDefinition[]
}

export interface ToneOfVoice {
  primary: string // e.g., "professional", "friendly"
  descriptors: string[] // e.g., ["confident", "approachable", "expert"]
  doList: string[] // Writing guidelines to follow
  dontList: string[] // Writing guidelines to avoid
  examplePhrases: string[]
}

export interface PersonaDefinition {
  name: string
  role: string
  goals: string[]
  painPoints: string[]
  preferences: string[]
}

export interface ContentStrategy {
  pillars: ContentPillar[]
  keyTopics: string[]
  callToActions: CtaStrategy[]
  contentGaps: string[]
}

export interface ContentPillar {
  name: string
  description: string
  topics: string[]
}

export interface CtaStrategy {
  type: 'primary' | 'secondary' | 'micro'
  text: string
  placement: string[]
  goal: string
}

export interface SiteStructure {
  pages: PageStructure[]
  navigationFlow: string
  conversionFunnel: string[]
}

export interface PageStructure {
  slug: string
  name: string
  purpose: string
  sections: string[] // section types
  priority: 'high' | 'medium' | 'low'
}

export interface CompetitiveInsight {
  aspect: string
  observation: string
  opportunity: string
}

// ----- Content Pack Generator Agent -----

export interface ContentPackGeneratorInput {
  strategy: StrategistOutput
  projectData: ProjectDataExtended
  pages: PageDefinition[]
  addons: string[]
}

export interface ContentPackGeneratorOutput {
  contentPack: ContentPack
  generationNotes: string[]
  todoMarkers: TodoMarker[]
}

export interface PageDefinition {
  slug: string
  name: string
  sections: SectionDefinition[]
}

export interface SectionDefinition {
  type: string
  config: Record<string, unknown>
}

export interface TodoMarker {
  path: string
  placeholder: string
  description: string
  required: boolean
}

// ----- SEO Specialist Agent -----

export interface SeoSpecialistInput {
  contentPack: ContentPack
  targetAudience: string
  industry: string | null
  keywords: string[]
}

export interface SeoSpecialistOutput {
  seoContent: SeoContent[]
  keywordStrategy: KeywordStrategy
  technicalSeoRecommendations: TechnicalSeoRec[]
  structuredDataSuggestions: StructuredDataSuggestion[]
}

export interface KeywordStrategy {
  primary: KeywordData[]
  secondary: KeywordData[]
  longTail: KeywordData[]
}

export interface KeywordData {
  keyword: string
  intent: 'informational' | 'navigational' | 'transactional' | 'commercial'
  targetPage: string
  priority: number
}

export interface TechnicalSeoRec {
  category: string
  recommendation: string
  impact: 'high' | 'medium' | 'low'
  implementation: string
}

export interface StructuredDataSuggestion {
  type: string
  page: string
  schema: Record<string, unknown>
}

// ----- Legal Expert Agent -----

export interface LegalExpertInput {
  businessInfo: BusinessInfoInput
  country: string
  services: string[]
  collectsData: boolean
  usesCookies: boolean
  hasNewsletter: boolean
}

export interface BusinessInfoInput {
  name: string
  legalName: string | null
  address: AddressInput | null
  email: string
  phone: string | null
  vatId: string | null
  registryNumber: string | null
}

export interface AddressInput {
  street: string | null
  city: string | null
  postalCode: string | null
  country: string
}

export interface LegalExpertOutput {
  imprint: ImprintOutput
  privacy: PrivacyOutput
  terms: TermsOutput | null
  cookies: CookiesOutput | null
  todoMarkers: TodoMarker[]
}

export interface ImprintOutput {
  content: string
  requiredFields: RequiredField[]
}

export interface RequiredField {
  field: string
  currentValue: string | null
  placeholder: string
  legalRequirement: string
}

export interface PrivacyOutput {
  content: string
  sections: { title: string; content: string }[]
  dataProcessingActivities: string[]
}

export interface TermsOutput {
  content: string
  sections: { title: string; content: string }[]
}

export interface CookiesOutput {
  content: string
  categories: { name: string; cookies: string[] }[]
}

// ----- Visual Designer Agent -----

export interface VisualDesignerInput {
  brandIdentity: BrandIdentity
  primaryColor: string
  secondaryColor: string
  websiteStyle: string
  targetAudience: string
}

export interface VisualDesignerOutput {
  colorScheme: ColorScheme
  typography: TypographyOutput
  spacing: SpacingOutput
  components: ComponentStyleOutput
  darkMode: DarkModeOutput
  recommendations: string[]
}

export interface TypographyOutput {
  headingFont: string
  bodyFont: string
  monoFont: string
  scale: number[]
  lineHeights: Record<string, number>
}

export interface SpacingOutput {
  base: number
  scale: number[]
  sections: Record<string, string>
}

export interface ComponentStyleOutput {
  buttons: ButtonStyleOutput
  cards: CardStyleOutput
  inputs: InputStyleOutput
}

export interface ButtonStyleOutput {
  borderRadius: string
  padding: string
  fontSize: string
  fontWeight: number
  transition: string
}

export interface CardStyleOutput {
  borderRadius: string
  shadow: string
  padding: string
  hoverShadow: string
}

export interface InputStyleOutput {
  borderRadius: string
  borderColor: string
  focusRing: string
  padding: string
}

export interface DarkModeOutput {
  background: string
  backgroundAlt: string
  text: string
  textMuted: string
  cardBackground: string
  borderColor: string
}

// ----- Code Renderer Agent -----

export interface CodeRendererInput {
  contentPack: ContentPack
  projectData: ProjectDataExtended
  addons: string[]
  framework: 'nextjs'
  version: string
}

export interface CodeRendererOutput {
  files: GeneratedFileOutput[]
  dependencies: DependencyOutput[]
  envVariables: EnvVariableOutput[]
  buildInstructions: string[]
}

export interface GeneratedFileOutput {
  path: string
  content: string
  type: 'component' | 'page' | 'config' | 'style' | 'utility' | 'api' | 'schema'
}

export interface DependencyOutput {
  name: string
  version: string
  dev: boolean
  reason: string
}

export interface EnvVariableOutput {
  name: string
  value: string | null
  description: string
  required: boolean
}

// ----- Editor Agent -----

export interface EditorInput {
  contentPack: ContentPack
  brandStrategy: BrandStrategy
  generatedCode: GeneratedFileOutput[] | null
}

export interface EditorOutput {
  approved: boolean
  scores: QualityScores
  feedback: EditorFeedback[]
  revisions: RevisionRequest[]
  finalScore: number
}

export interface EditorFeedback {
  category: 'content' | 'brand' | 'seo' | 'technical' | 'ux'
  severity: 'critical' | 'major' | 'minor' | 'suggestion'
  location: string
  issue: string
  suggestion: string
}

export interface RevisionRequest {
  agent: AgentName
  instruction: string
  priority: 'high' | 'medium' | 'low'
  affectedPaths: string[]
}

// =============================================================================
// EXTENDED PROJECT DATA
// =============================================================================

export interface ProjectDataExtended {
  id: string
  name: string
  packageType: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
  websiteStyle: string
  optimizationGoal: string
  targetAudience: string
  brief: string
  selectedAddons: string[]
  pages: PageInput[]
  
  // Extended fields
  industry: string | null
  companySize: string | null
  foundedYear: number | null
  location: LocationInput | null
  contactEmail: string
  contactPhone: string | null
  
  // CMS fields
  sanityProjectId: string | null
  sanityDataset: string
  sanityApiToken: string | null
  
  // Email fields
  emailDomain: string | null
  emailDomainVerified: boolean
  
  // Tracking Pixel IDs
  googlePixelId: string | null
  metaPixelId: string | null
}

export interface PageInput {
  id: string
  name: string
  slug: string
  sections: SectionInput[]
}

export interface SectionInput {
  id: string
  sectionType: string
  config: Record<string, unknown>
}

export interface LocationInput {
  city: string | null
  country: string
  timezone: string | null
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

export interface AgentError {
  agent: AgentName
  phase: string
  code: AgentErrorCode
  message: string
  details: Record<string, unknown> | null
  recoverable: boolean
  timestamp: string
}

export type AgentErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'INVALID_INPUT'
  | 'INVALID_OUTPUT'
  | 'API_ERROR'
  | 'VALIDATION_ERROR'
  | 'QUALITY_THRESHOLD'
  | 'UNKNOWN'

// =============================================================================
// AGENT COMMUNICATION
// =============================================================================

export interface AgentMessage {
  from: AgentName
  to: AgentName
  type: 'request' | 'response' | 'feedback' | 'revision'
  payload: unknown
  timestamp: string
  correlationId: string
}

export interface AgentContext {
  projectId: string
  correlationId: string
  startTime: number
  currentPhase: string
  completedAgents: AgentName[]
  pendingAgents: AgentName[]
  errors: AgentError[]
  metrics: Partial<GenerationMetrics>
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

export interface ContentPackRecord {
  id: string
  project_id: string
  hash: string
  content: ContentPack
  quality_score: number
  generated_at: string
  generation_duration: number
  agent_metrics: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AgentMetricRecord {
  id: string
  project_id: string
  content_pack_id: string
  agent_name: AgentName
  phase: string
  duration: number
  tokens_used: number
  success: boolean
  error_code: AgentErrorCode | null
  created_at: string
}
