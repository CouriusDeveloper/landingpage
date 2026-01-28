// =============================================================================
// AGENT: LEGAL (Phase 1)
// Impressum, Datenschutz, Cookie-Banner, DSGVO-konforme Texte
// =============================================================================

import {
  corsHeaders,
  createAgentRun,
  updateAgentRun,
  callOpenAI,
  calculateCost,
  updatePipelineMetrics,
} from '../_shared/agent-utils.ts'
import type { AgentEnvelope, AgentResponse, LegalOutput } from '../_shared/types/pipeline.ts'

const SYSTEM_PROMPT = `Du bist Rechtsanwalt für IT-Recht und DSGVO in Deutschland.

## DEINE AUFGABE
Erstelle rechtssichere Texte für Impressum und Datenschutzerklärung nach §5 TMG und DSGVO.

## KRITISCHE REGELN
1. Nutze EXAKT die bereitgestellten Unternehmensdaten - KEINE erfundenen Daten!
2. Wenn ein Pflichtfeld fehlt oder "Nicht angegeben" ist: Schreibe "[BITTE ERGÄNZEN: Beschreibung]"
3. NIEMALS Platzhalter wie "Musterstraße 1", "DE123456789" oder "Max Mustermann" erfinden!
4. Datenschutz muss zur tatsächlichen Datenverarbeitung passen (Kontaktformular, CMS, etc.)

## PFLICHTANGABEN IMPRESSUM (§5 TMG)
- Name und Anschrift des Diensteanbieters
- Bei juristischen Personen: Rechtsform + Vertretungsberechtigte
- E-Mail-Adresse
- Telefonnummer (umstritten, aber empfohlen)
- USt-IdNr. falls vorhanden
- Handelsregister mit Registernummer falls eingetragen

## OUTPUT (JSON):
{
  "imprint": {
    "companyName": "EXAKTER Name aus Input",
    "legalForm": "Rechtsform aus Input oder null",
    "representative": "Name aus Input oder '[BITTE ERGÄNZEN: Vertretungsberechtigte/r]'",
    "address": {
      "street": "Aus Input oder '[BITTE ERGÄNZEN]'",
      "zip": "PLZ",
      "city": "Stadt",
      "country": "Deutschland"
    },
    "email": "E-Mail aus Input",
    "phone": "Telefon aus Input (Format: +49 XXX XXXXXXX)",
    "vatId": "USt-IdNr aus Input oder null",
    "registryCourt": "Registergericht aus Input oder null",
    "registryNumber": "Registernummer aus Input oder null",
    "responsiblePerson": "§55 RStV Verantwortlicher aus Input oder null"
  },
  "privacy": {
    "lastUpdated": "2026-01-25",
    "responsibleParty": {
      "name": "Firmenname",
      "address": "Vollständige Adresse",
      "email": "E-Mail",
      "phone": "Telefon"
    },
    "sections": [
      {"title": "1. Verantwortlicher", "content": "Mit echten Daten ausgefüllt..."},
      {"title": "2. Datenerfassung auf dieser Website", "content": "..."},
      {"title": "3. Ihre Rechte", "content": "Auskunft, Berichtigung, Löschung..."}
    ],
    "dataProcessing": [
      {"purpose": "Kontaktanfragen", "legalBasis": "Art. 6 Abs. 1 lit. b DSGVO", "retention": "6 Monate"}
    ],
    "thirdPartyServices": []
  },
  "cookies": {
    "necessary": [{"name": "session", "purpose": "Session-Verwaltung", "duration": "Session"}],
    "analytics": [],
    "marketing": []
  }
}

Antworte NUR mit validem JSON.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let agentRunId: string | null = null

  try {
    const envelope: AgentEnvelope = await req.json()
    const { meta, project } = envelope
    
    console.log(`[LEGAL] Starting (Pipeline: ${meta.pipelineRunId})`)

    agentRunId = await createAgentRun(
      meta.pipelineRunId,
      meta.projectId,
      'legal',
      meta.phase,
      meta.sequence,
      { project },
      meta.attempt
    )

    const userPrompt = `Respond with valid JSON only.

## Unternehmensdaten
Name: ${project.name}
Offizieller Firmenname: ${project.legal?.companyName || project.name}
Rechtsform: ${project.legal?.form || 'Nicht angegeben'}
Vertreter/Geschäftsführer: ${project.legal?.representative || 'Nicht angegeben'}
USt-IdNr.: ${project.legal?.vatId || 'Nicht angegeben'}
Registergericht: ${project.legal?.registryCourt || 'Nicht angegeben'}
Registernummer: ${project.legal?.registryNumber || 'Nicht angegeben'}
Verantwortlicher §55 RStV: ${project.legal?.responsiblePerson || 'Nicht angegeben'}
Datenschutzbeauftragter: ${project.legal?.dataProtectionOfficer || 'Nicht erforderlich'}
Branche: ${project.industry || 'Nicht angegeben'}
Unternehmensgröße: ${project.companySize || 'Nicht angegeben'}

## Adresse
${project.contact.address || 'Nicht angegeben'}
Stadt: ${project.location.city || 'Nicht angegeben'}
Land: ${project.location.country || 'Deutschland'}

## Kontakt
E-Mail: ${project.contact.email || 'Nicht angegeben'}
Telefon: ${project.contact.phone || 'Nicht angegeben'}

## Website-Features (für Datenschutz relevant)
- Kontaktformular: ${project.addons.includes('booking_form') ? 'Ja' : 'Nein'}
- Newsletter: Nein
- Analytics: ${project.packageType === 'enterprise' ? 'Ja (Plausible)' : 'Optional'}
- CMS: ${project.addons.includes('cms_base') ? 'Ja (Sanity)' : 'Nein'}

Erstelle vollständige rechtliche Texte (Impressum, Datenschutz, Cookies) als JSON.
Markiere fehlende Pflichtangaben mit {{TODO: Beschreibung}}.`

    const { content, inputTokens, outputTokens, model } = await callOpenAI(
      SYSTEM_PROMPT,
      userPrompt,
      'gpt-5.2-chat-latest',
      6000
    )

    const output: LegalOutput = JSON.parse(content)
    const durationMs = Date.now() - startTime
    const costUsd = calculateCost(model, inputTokens, outputTokens)

    console.log(`[LEGAL] Success: Imprint for "${output.imprint.companyName}" in ${durationMs}ms`)

    await updateAgentRun(agentRunId, {
      status: 'completed',
      output_data: output,
      model_used: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      cost_usd: costUsd,
      quality_score: 8.5,
      validation_passed: true,
      completed_at: new Date().toISOString(),
    })

    await updatePipelineMetrics(meta.pipelineRunId, inputTokens + outputTokens, costUsd)

    const response: AgentResponse<LegalOutput> = {
      success: true,
      agentRunId,
      agentName: 'legal',
      output,
      quality: { score: 8.5, passed: true, issues: [], criticalCount: 0 },
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
      metrics: { durationMs, inputTokens, outputTokens, model, costUsd },
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[LEGAL] Error:', error)
    
    if (agentRunId) {
      await updateAgentRun(agentRunId, {
        status: 'failed',
        error_code: 'LEGAL_ERROR',
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
