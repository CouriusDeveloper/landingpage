// Parallel Runner - Execute multiple agents concurrently
// Supports timeout, retries, and error aggregation

import type { AgentError, AgentName } from '../types/agents.ts'
import { sleep } from './agent-runner.ts'

// =============================================================================
// TYPES
// =============================================================================

export interface ParallelTask<T> {
  id: string
  name: AgentName | string
  execute: () => Promise<T>
  timeout?: number
  retries?: number
  critical?: boolean // If true, failure stops all tasks
}

export interface ParallelResult<T> {
  id: string
  name: string
  success: boolean
  result: T | null
  error: AgentError | null
  duration: number
}

export interface ParallelRunnerOptions {
  maxConcurrency?: number
  stopOnCriticalFailure?: boolean
  defaultTimeout?: number
  defaultRetries?: number
}

// =============================================================================
// PARALLEL RUNNER
// =============================================================================

export async function runParallel<T>(
  tasks: ParallelTask<T>[],
  options: ParallelRunnerOptions = {}
): Promise<{
  results: ParallelResult<T>[]
  success: boolean
  totalDuration: number
}> {
  const startTime = Date.now()
  const {
    maxConcurrency = 5,
    stopOnCriticalFailure = true,
    defaultTimeout = 120000,
    defaultRetries = 2,
  } = options

  const results: ParallelResult<T>[] = []
  let criticalFailure = false

  // Process tasks in batches for controlled concurrency
  const batches: ParallelTask<T>[][] = []
  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    batches.push(tasks.slice(i, i + maxConcurrency))
  }

  for (const batch of batches) {
    if (criticalFailure && stopOnCriticalFailure) {
      // Mark remaining tasks as skipped
      for (const task of batch) {
        results.push({
          id: task.id,
          name: task.name,
          success: false,
          result: null,
          error: {
            agent: task.name as AgentName,
            phase: 'skipped',
            code: 'UNKNOWN',
            message: 'Task skipped due to critical failure',
            details: null,
            recoverable: false,
            timestamp: new Date().toISOString(),
          },
          duration: 0,
        })
      }
      continue
    }

    // Execute batch concurrently
    const batchResults = await Promise.all(
      batch.map((task) =>
        executeTask(task, {
          timeout: task.timeout ?? defaultTimeout,
          retries: task.retries ?? defaultRetries,
        })
      )
    )

    // Check for critical failures
    for (const result of batchResults) {
      results.push(result)
      const task = batch.find((t) => t.id === result.id)
      if (!result.success && task?.critical) {
        criticalFailure = true
      }
    }
  }

  return {
    results,
    success: results.every((r) => r.success),
    totalDuration: Date.now() - startTime,
  }
}

// =============================================================================
// TASK EXECUTION
// =============================================================================

async function executeTask<T>(
  task: ParallelTask<T>,
  options: { timeout: number; retries: number }
): Promise<ParallelResult<T>> {
  const startTime = Date.now()
  let lastError: AgentError | null = null

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Task ${task.id} timed out after ${options.timeout}ms`)),
          options.timeout
        )
      })

      // Race between task and timeout
      const result = await Promise.race([task.execute(), timeoutPromise])

      return {
        id: task.id,
        name: task.name,
        success: true,
        result,
        error: null,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      lastError = {
        agent: task.name as AgentName,
        phase: 'execution',
        code: error instanceof Error && error.message.includes('timed out') 
          ? 'TIMEOUT' 
          : 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? { stack: error.stack, attempt } : { attempt },
        recoverable: attempt < options.retries,
        timestamp: new Date().toISOString(),
      }

      // Wait before retry with exponential backoff
      if (attempt < options.retries) {
        await sleep(Math.pow(2, attempt) * 1000)
      }
    }
  }

  return {
    id: task.id,
    name: task.name,
    success: false,
    result: null,
    error: lastError,
    duration: Date.now() - startTime,
  }
}

// =============================================================================
// SEQUENTIAL RUNNER (for dependent tasks)
// =============================================================================

export async function runSequential<T>(
  tasks: ParallelTask<T>[],
  options: ParallelRunnerOptions = {}
): Promise<{
  results: ParallelResult<T>[]
  success: boolean
  totalDuration: number
}> {
  return runParallel(tasks, { ...options, maxConcurrency: 1 })
}

// =============================================================================
// PHASED RUNNER (for multi-phase execution)
// =============================================================================

export interface Phase<T> {
  name: string
  tasks: ParallelTask<T>[]
  options?: ParallelRunnerOptions
}

export interface PhasedResult<T> {
  phases: {
    name: string
    results: ParallelResult<T>[]
    success: boolean
    duration: number
  }[]
  success: boolean
  totalDuration: number
}

export async function runPhased<T>(
  phases: Phase<T>[],
  stopOnPhaseFailure = true
): Promise<PhasedResult<T>> {
  const startTime = Date.now()
  const phaseResults: PhasedResult<T>['phases'] = []
  let allSuccess = true

  for (const phase of phases) {
    if (!allSuccess && stopOnPhaseFailure) {
      // Skip remaining phases
      phaseResults.push({
        name: phase.name,
        results: phase.tasks.map((task) => ({
          id: task.id,
          name: task.name,
          success: false,
          result: null,
          error: {
            agent: task.name as AgentName,
            phase: 'skipped',
            code: 'UNKNOWN',
            message: 'Phase skipped due to previous phase failure',
            details: null,
            recoverable: false,
            timestamp: new Date().toISOString(),
          },
          duration: 0,
        })),
        success: false,
        duration: 0,
      })
      continue
    }

    const phaseStart = Date.now()
    const { results, success } = await runParallel(phase.tasks, phase.options)

    phaseResults.push({
      name: phase.name,
      results,
      success,
      duration: Date.now() - phaseStart,
    })

    if (!success) {
      allSuccess = false
    }
  }

  return {
    phases: phaseResults,
    success: allSuccess,
    totalDuration: Date.now() - startTime,
  }
}

// =============================================================================
// RETRY UTILITIES
// =============================================================================

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number
    delay?: number
    backoff?: 'linear' | 'exponential'
    onRetry?: (error: Error, attempt: number) => void
  } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 'exponential', onRetry } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < retries) {
        onRetry?.(lastError, attempt)

        const waitTime = backoff === 'exponential' 
          ? delay * Math.pow(2, attempt) 
          : delay * (attempt + 1)

        await sleep(waitTime)
      }
    }
  }

  throw lastError
}

// =============================================================================
// BATCH UTILITIES
// =============================================================================

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export async function mapAsync<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results: R[] = []
  const chunks = chunk(items, concurrency)

  for (const batch of chunks) {
    const batchResults = await Promise.all(
      batch.map((item, index) => fn(item, results.length + index))
    )
    results.push(...batchResults)
  }

  return results
}
