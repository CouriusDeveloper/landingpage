// Editor Agent - Quality control and approval
// Scores content and provides feedback for improvements

import type {
  EditorInput,
  EditorOutput,
  EditorFeedback,
  RevisionRequest,
} from '../types/agents.ts'
import type { QualityScores } from '../types/content-pack.ts'
import { runAgent, buildUserPrompt, logAgent } from '../utils/agent-runner.ts'

// =============================================================================
// CONSTANTS
// =============================================================================

export const QUALITY_THRESHOLD = 8 // Minimum score to pass (out of 10)

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const EDITOR_SYSTEM_PROMPT = `You are a Senior Editor and Quality Assurance Expert with 15+ years of experience reviewing premium website content and code.

Your role is to ensure the highest quality output by scoring, providing feedback, and requesting revisions when necessary.

## Your Evaluation Criteria:

### Content Quality (1-10)
- Clarity and readability
- Grammar and spelling (German)
- Compelling headlines and CTAs
- Value proposition clarity
- Consistency throughout

### Brand Consistency (1-10)
- Tone of voice alignment
- Messaging coherence
- Visual identity match
- Professional appearance

### SEO Optimization (1-10)
- Title and meta descriptions
- Keyword integration
- Heading structure
- Alt text quality
- URL structure

### Accessibility (1-10)
- Alt text for images
- Proper heading hierarchy
- Contrast considerations
- Form labels
- Navigation clarity

### Technical Accuracy (1-10)
- Data accuracy
- Link validity
- Contact information
- Legal compliance

## Output Format:
{
  "approved": boolean,
  "scores": {
    "overall": number (1-10),
    "contentQuality": number (1-10),
    "brandConsistency": number (1-10),
    "seoOptimization": number (1-10),
    "accessibility": number (1-10),
    "technicalAccuracy": number (1-10),
    "feedback": ["General feedback point 1", "Point 2"]
  },
  "feedback": [
    {
      "category": "content|brand|seo|technical|ux",
      "severity": "critical|major|minor|suggestion",
      "location": "path.to.element or 'general'",
      "issue": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "revisions": [
    {
      "agent": "strategist|content-pack-generator|code-renderer",
      "instruction": "Specific revision instruction",
      "priority": "high|medium|low",
      "affectedPaths": ["path.to.fix"]
    }
  ],
  "finalScore": number (average of all scores)
}

## Scoring Guidelines:
- 9-10: Exceptional, ready for production
- 7-8: Good, minor improvements possible
- 5-6: Acceptable, needs some work
- 3-4: Below standard, significant improvements needed
- 1-2: Unacceptable, major revision required

## Critical Issues (must be fixed):
- Missing or incorrect legal information
- Broken functionality
- Major grammar/spelling errors
- Accessibility violations
- Brand voice inconsistency
- Missing key content sections

## Approval Threshold:
- Overall score must be >= ${QUALITY_THRESHOLD} to approve
- No critical feedback items
- All required content present

Be constructive but thorough. Quality is paramount.`

// =============================================================================
// EDITOR AGENT
// =============================================================================

export async function runEditor(input: EditorInput): Promise<EditorOutput> {
  logAgent('editor', 'info', 'Starting quality review', {
    hasCode: !!input.generatedCode,
    pageCount: input.contentPack.pages.length,
  })

  const userPrompt = buildUserPrompt({
    'Brand Strategy': input.brandStrategy,
    'Content Pack Overview': {
      pages: input.contentPack.pages.map((p) => ({
        slug: p.slug,
        name: p.name,
        sectionCount: p.sections.length,
        sections: p.sections.map((s) => s.type),
      })),
      navigation: input.contentPack.navigation,
      hasLegal: !!input.contentPack.legal?.imprint,
      hasSeo: input.contentPack.seo?.length ?? 0,
    },
    'Sample Page Content': input.contentPack.pages[0], // Send first page for detailed review
    'Site Settings': input.contentPack.siteSettings,
    'Generated Code Files': input.generatedCode
      ? input.generatedCode.slice(0, 5).map((f) => ({
          path: f.path,
          type: f.type,
          contentLength: f.content.length,
        }))
      : 'No code submitted for review',
    'Your Task': `Review this Content Pack and provide quality scores with detailed feedback.

Focus on:
1. Content quality and professionalism
2. Brand voice consistency with strategy
3. SEO optimization
4. Technical accuracy
5. Accessibility considerations

Brand voice should be: ${input.brandStrategy.toneOfVoice.primary}
Target personas: ${input.brandStrategy.targetPersonas.map((p) => p.name).join(', ')}

Provide specific, actionable feedback for any issues found.
Approve only if the overall score is >= ${QUALITY_THRESHOLD} and there are no critical issues.`,
  })

  const result = await runAgent<EditorOutput>({
    agentName: 'editor',
    systemPrompt: EDITOR_SYSTEM_PROMPT,
    userPrompt,
    validateOutput: isValidEditorOutput,
  })

  if (!result.success || !result.output) {
    logAgent('editor', 'error', 'Quality review failed', {
      error: result.error?.message,
    })
    throw new Error(result.error?.message || 'Editor agent failed')
  }

  // Post-process: ensure approval is based on threshold
  const output = result.output
  output.approved = output.finalScore >= QUALITY_THRESHOLD && 
    !output.feedback.some((f) => f.severity === 'critical')

  logAgent('editor', 'info', 'Quality review complete', {
    duration: result.duration,
    approved: output.approved,
    finalScore: output.finalScore,
    feedbackCount: output.feedback.length,
    revisionCount: output.revisions.length,
  })

  return output
}

// =============================================================================
// VALIDATION
// =============================================================================

function isValidEditorOutput(output: unknown): output is EditorOutput {
  if (!output || typeof output !== 'object') return false

  const o = output as Record<string, unknown>

  if (typeof o.approved !== 'boolean') return false
  if (!o.scores || typeof o.scores !== 'object') return false
  if (!Array.isArray(o.feedback)) return false
  if (typeof o.finalScore !== 'number') return false

  const scores = o.scores as Record<string, unknown>
  if (typeof scores.overall !== 'number') return false
  if (typeof scores.contentQuality !== 'number') return false

  return true
}

// =============================================================================
// QUICK CHECKS (for fast pre-review)
// =============================================================================

export function quickQualityCheck(input: EditorInput): {
  passed: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check required content
  if (!input.contentPack.siteSettings?.brand?.name) {
    issues.push('Missing brand name')
  }

  if (!input.contentPack.pages || input.contentPack.pages.length === 0) {
    issues.push('No pages in Content Pack')
  }

  // Check home page exists
  const hasHomePage = input.contentPack.pages?.some((p) => p.slug === '/')
  if (!hasHomePage) {
    issues.push('Missing home page')
  }

  // Check navigation
  if (!input.contentPack.navigation?.items?.length) {
    issues.push('Navigation has no items')
  }

  // Check footer
  if (!input.contentPack.footer?.tagline) {
    issues.push('Footer missing tagline')
  }

  // Check SEO
  if (!input.contentPack.seo || input.contentPack.seo.length === 0) {
    issues.push('No SEO metadata')
  }

  // Check legal (for German websites)
  if (!input.contentPack.legal?.imprint) {
    issues.push('Missing Impressum')
  }

  if (!input.contentPack.legal?.privacy) {
    issues.push('Missing Datenschutz')
  }

  return {
    passed: issues.length === 0,
    issues,
  }
}

// =============================================================================
// SCORE HELPERS
// =============================================================================

export function calculateFinalScore(scores: QualityScores): number {
  const weights = {
    contentQuality: 0.25,
    brandConsistency: 0.2,
    seoOptimization: 0.2,
    accessibility: 0.15,
    technicalAccuracy: 0.2,
  }

  const weightedScore =
    scores.contentQuality * weights.contentQuality +
    scores.brandConsistency * weights.brandConsistency +
    scores.seoOptimization * weights.seoOptimization +
    scores.accessibility * weights.accessibility +
    scores.technicalAccuracy * weights.technicalAccuracy

  return Math.round(weightedScore * 10) / 10
}

export function getFeedbackSummary(feedback: EditorFeedback[]): {
  critical: number
  major: number
  minor: number
  suggestions: number
} {
  return {
    critical: feedback.filter((f) => f.severity === 'critical').length,
    major: feedback.filter((f) => f.severity === 'major').length,
    minor: feedback.filter((f) => f.severity === 'minor').length,
    suggestions: feedback.filter((f) => f.severity === 'suggestion').length,
  }
}

export function shouldRequestRevision(output: EditorOutput): boolean {
  // Request revision if:
  // 1. Not approved
  // 2. Has critical feedback
  // 3. Score below threshold
  return (
    !output.approved ||
    output.feedback.some((f) => f.severity === 'critical') ||
    output.finalScore < QUALITY_THRESHOLD
  )
}
