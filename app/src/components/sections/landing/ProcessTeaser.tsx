import { processSteps } from '../../../content/site'
import { Section } from '../../ui/Section'
import { Button } from '../../ui/Button'

export function ProcessTeaser() {
  return (
    <Section
      id="prozess"
      eyebrow="Transparenter Ablauf"
      title="In vier Schritten live"
      actions={<Button to="/prozess" variant="secondary">So arbeiten wir</Button>}
    >
      <ol className="grid gap-6 md:grid-cols-4">
        {processSteps.slice(0, 4).map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-slate-100 bg-white/80 p-5">
            <span className="text-sm font-semibold text-accent">0{index + 1}</span>
            <h3 className="mt-2 text-xl font-semibold text-primary">{step.title}</h3>
            <p className="mt-3 text-sm text-secondary">{step.description}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
