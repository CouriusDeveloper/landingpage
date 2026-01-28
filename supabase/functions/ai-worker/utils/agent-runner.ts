// Agent Runner Utilities - Common functions for all agents
// Handles API calls, retries, JSON parsing, and model selection
// Uses OpenAI Responses API (2025)

import type { AgentConfig, AgentName, AgentError, AgentErrorCode } from '../types/agents.ts'

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

export const MODELS = {
  // GPT-5.2 Chat for strategic/creative work
  CHAT: 'gpt-5.2-chat-latest',
  // GPT-5.2 Codex for code generation
  CODEX: 'gpt-5.2-codex',
} as const

// Supabase Edge Functions have a 60s wall-clock limit (150s on Pro)
// Keep timeouts short to avoid hitting the limit
export const DEFAULT_AGENT_CONFIGS: Record<AgentName, Partial<AgentConfig>> = {
  strategist: {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 45000,
    retries: 1,
  },
  'content-pack-generator': {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.6,
    maxTokens: 8000,
    timeout: 50000,
    retries: 1,
  },
  'seo-specialist': {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.4,
    maxTokens: 2000,
    timeout: 30000,
    retries: 1,
  },
  'legal-expert': {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.3,
    maxTokens: 4000,
    timeout: 40000,
    retries: 1,
  },
  'visual-designer': {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.5,
    maxTokens: 2000,
    timeout: 30000,
    retries: 1,
  },
  'code-renderer': {
    model: 'gpt-5.2-codex',
    temperature: 0.2,
    maxTokens: 20000,
    timeout: 50000,
    retries: 1,
  },
  editor: {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.4,
    maxTokens: 4000,
    timeout: 40000,
    retries: 1,
  },
  'project-manager': {
    model: 'gpt-5.2-chat-latest',
    temperature: 0.3,
    maxTokens: 2000,
    timeout: 30000,
    retries: 1,
  },
}

// =============================================================================
// OPENAI CLIENT
// =============================================================================

// =============================================================================
// OPENAI RESPONSES API CLIENT
// =============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'

interface ResponsesAPIRequest {
  model: string
  input: string
  instructions?: string
  max_output_tokens?: number
  text?: {
    format?: { type: 'json_object' | 'text' }
  }
}

interface ResponsesAPIResponse {
  id: string
  output: string | Array<{
    type: string
    text?: string
    content?: Array<{
      type: string
      text?: string
    }>
  }>
  output_text?: string
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
  error?: {
    message: string
    code: string
  }
}

function extractTextFromResponse(response: ResponsesAPIResponse): string {
  // Handle direct string output
  if (typeof response.output === 'string') return response.output
  
  // Handle output_text field
  if (response.output_text) return response.output_text
  
  // Handle array output
  if (Array.isArray(response.output)) {
    const textPart = response.output.find((p) => p.type === 'text' || p.content)
    if (textPart?.text) return textPart.text
    if (textPart?.content?.[0]?.text) return textPart.content[0].text
  }
  
  return ''
}

async function callResponsesAPI(
  request: ResponsesAPIRequest,
  signal?: AbortSignal
): Promise<ResponsesAPIResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set')
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  return response.json()
}

// Legacy client getter for backward compatibility (unused with Responses API)
export function getOpenAIClient(): never {
  throw new Error('Legacy OpenAI client deprecated - use Responses API')
}

// =============================================================================
// AGENT RUNNER
// =============================================================================

export interface RunAgentOptions<T> {
  agentName: AgentName
  systemPrompt: string
  userPrompt: string
  config?: Partial<AgentConfig>
  validateOutput?: (output: unknown) => output is T
  correlationId?: string
}

export interface RunAgentResult<T> {
  success: boolean
  output: T | null
  error: AgentError | null
  duration: number
  tokensUsed: number
}

export async function runAgent<T>(
  options: RunAgentOptions<T>
): Promise<RunAgentResult<T>> {
  const startTime = Date.now()
  const config = {
    ...DEFAULT_AGENT_CONFIGS[options.agentName],
    ...options.config,
  }
  
  const model = config.model === 'gpt-5.2-chat-latest' ? MODELS.CHAT : MODELS.CODEX
  const maxRetries = config.retries ?? 2
  const timeout = config.timeout ?? 120000
  
  let lastError: AgentError | null = null
  let tokensUsed = 0
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      try {
        // Use OpenAI Responses API (no temperature - not supported by these models)
        const response = await callResponsesAPI({
          model,
          instructions: options.systemPrompt,
          input: options.userPrompt,
          max_output_tokens: config.maxTokens ?? 8000,
          text: {
            format: { type: 'json_object' }
          }
        }, controller.signal)
        
        clearTimeout(timeoutId)
        
        // Handle API error response
        if (response.error) {
          throw new Error(`API Error: ${response.error.message}`)
        }
        
        tokensUsed = response.usage?.total_tokens ?? 0
        
        // Extract text content from response
        const content = extractTextFromResponse(response)
        
        if (!content) {
          throw new Error('Empty response from API')
        }
        
        const parsed = parseJSON<T>(content)
        if (!parsed.success) {
          throw new Error(`JSON parse error: ${parsed.error}`)
        }
        
        // Validate output if validator provided
        if (options.validateOutput && !options.validateOutput(parsed.data)) {
          throw new Error('Output validation failed')
        }
        
        return {
          success: true,
          output: parsed.data,
          error: null,
          duration: Date.now() - startTime,
          tokensUsed,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      const errorCode = getErrorCode(error)
      lastError = {
        agent: options.agentName,
        phase: 'execution',
        code: errorCode,
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? { stack: error.stack } : null,
        recoverable: isRecoverable(errorCode),
        timestamp: new Date().toISOString(),
      }
      
      // Don't retry non-recoverable errors
      if (!lastError.recoverable) {
        break
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000)
      }
    }
  }
  
  return {
    success: false,
    output: null,
    error: lastError,
    duration: Date.now() - startTime,
    tokensUsed,
  }
}

// =============================================================================
// JSON PARSING
// =============================================================================

export interface ParseJSONResult<T> {
  success: boolean
  data: T
  error?: string
}

export function parseJSON<T>(input: string): ParseJSONResult<T> {
  try {
    // Try to extract JSON from markdown code blocks if present
    let jsonString = input.trim()
    
    // Remove markdown code blocks
    const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim()
    }
    
    // Parse JSON
    const data = JSON.parse(jsonString) as T
    
    return {
      success: true,
      data,
    }
  } catch (error) {
    return {
      success: false,
      data: null as T,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

function getErrorCode(error: unknown): AgentErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    
    if (message.includes('timeout') || message.includes('aborted')) {
      return 'TIMEOUT'
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return 'RATE_LIMIT'
    }
    if (message.includes('invalid') && message.includes('input')) {
      return 'INVALID_INPUT'
    }
    if (message.includes('validation')) {
      return 'VALIDATION_ERROR'
    }
    if (message.includes('api') || message.includes('openai')) {
      return 'API_ERROR'
    }
  }
  
  return 'UNKNOWN'
}

function isRecoverable(code: AgentErrorCode): boolean {
  return ['TIMEOUT', 'RATE_LIMIT', 'API_ERROR'].includes(code)
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function hashContent(content: unknown): string {
  const str = JSON.stringify(content)
  // Simple hash for caching - in production use crypto.subtle
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// =============================================================================
// PROMPT HELPERS
// =============================================================================

export function formatPromptSection(title: string, content: unknown): string {
  if (content === null || content === undefined) {
    return ''
  }
  
  const formatted = typeof content === 'string' 
    ? content 
    : JSON.stringify(content, null, 2)
  
  return `## ${title}\n\n${formatted}\n\n`
}

export function buildUserPrompt(sections: Record<string, unknown>): string {
  return Object.entries(sections)
    .map(([title, content]) => formatPromptSection(title, content))
    .filter(Boolean)
    .join('')
}

// =============================================================================
// LOGGING
// =============================================================================

export function logAgent(
  agentName: AgentName,
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${agentName.toUpperCase()}]`
  
  const logData = data ? ` ${JSON.stringify(data)}` : ''
  
  switch (level) {
    case 'info':
      console.log(`${prefix} ${message}${logData}`)
      break
    case 'warn':
      console.warn(`${prefix} ⚠️ ${message}${logData}`)
      break
    case 'error':
      console.error(`${prefix} ❌ ${message}${logData}`)
      break
  }
}
