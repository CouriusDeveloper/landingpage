import { Section } from '../components/ui/Section'
import { StepsTimeline } from '../components/sections/process/StepsTimeline'
import { Button } from '../components/ui/Button'

export function ProcessPage() {
  return (
    <>
      <Section
        title="So arbeiten wir zusammen"
        description="Transparente Steps, klare Deadlines und direkte Kommunikation."
        actions={<Button to="/register">Projekt starten</Button>}
      >
        <div className="grid gap-10 lg:grid-cols-[2fr,1fr]">
          <StepsTimeline />
          <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-6 text-sm text-secondary">
            <p className="font-semibold text-primary">Zeit & Erwartung</p>
            <ul className="mt-4 space-y-3">
              <li>Onepager: 10–14 Tage*</li>
              <li>Business-Sites: 3–5 Wochen</li>
              <li>Feedback via Loom, Slack oder WhatsApp</li>
              <li>Wir brauchen: Inhalte, Bilder, schnelles Feedback</li>
            </ul>
          </div>
        </div>
      </Section>
    </>
  )
}
