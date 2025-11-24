import { projects } from '../../../content/site'
import { Section } from '../../ui/Section'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'

export function PortfolioTeaser() {
  return (
    <Section
      id="portfolio"
      eyebrow="Ausgewählte Projekte"
      title="Kein Template-Matsch"
      description="Ein kleiner Auszug – mehr Beispiele findest du in unserem Portfolio."
      actions={<Button to="/portfolio" variant="secondary">Alle Projekte</Button>}
    >
      <div className="grid gap-6 md:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.name}>
            <div className="rounded-xl bg-slate-900/90 p-6 text-white">
              <p className="text-sm uppercase tracking-widest text-white/60">{project.industry}</p>
              <p className="mt-2 text-2xl font-semibold">{project.name}</p>
              <p className="mt-4 text-sm text-white/80">{project.beforeAfter}</p>
              <p className="mt-6 text-sm font-semibold text-emerald-300">{project.result}</p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}
