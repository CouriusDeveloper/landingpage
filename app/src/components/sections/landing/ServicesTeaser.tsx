import { servicePackages } from '../../../content/site'
import { Section } from '../../ui/Section'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'

export function ServicesTeaser() {
  return (
    <Section
      id="leistungen"
      eyebrow="Angebot"
      title="Unsere Leistungen in drei Paketen"
      description="Ob Onepager oder kompletter Unternehmensauftritt – jedes Paket startet mit einem klaren Konzept."
      actions={<Button to="/leistungen" variant="secondary">Alle Leistungen</Button>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {servicePackages.map((service) => (
          <Card key={service.name} className="flex h-full flex-col">
            <div className="flex-1">
              <p className="text-sm font-semibold text-accent">{service.name}</p>
              <h3 className="mt-2 text-2xl font-semibold text-primary">{service.description}</h3>
              <p className="mt-4 text-sm text-secondary">Für {service.audience}</p>
              <ul className="mt-6 space-y-3 text-sm text-secondary">
                {service.inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wider text-secondary">{service.investment}</p>
              <Button to={service.cta} size="md" variant="secondary">
                Mehr erfahren
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}
