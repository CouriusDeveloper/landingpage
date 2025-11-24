import { servicePackages, addons } from '../../../content/site'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'

export function ServicePackageGrid() {
  return (
    <div className="space-y-12">
      <div className="grid gap-6 lg:grid-cols-3">
        {servicePackages.map((service) => (
          <Card key={service.name} className="flex h-full flex-col">
            <p className="text-sm font-semibold text-accent">{service.name}</p>
            <h3 className="mt-2 text-2xl font-semibold text-primary">{service.description}</h3>
            <p className="mt-2 text-sm text-secondary">Für {service.audience}</p>
            <ul className="mt-6 space-y-3 text-sm text-secondary">
              {service.inclusions.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-secondary">{service.investment}</span>
              <Button to={service.cta} variant="secondary" size="md">
                Projekt starten
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="rounded-3xl border border-slate-100 bg-white/90 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-secondary">Add-ons</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {addons.map((addon) => (
            <div key={addon.title} className="rounded-2xl border border-slate-100/80 bg-slate-50/70 px-5 py-4">
              <p className="font-semibold text-primary">{addon.title}</p>
              <p className="mt-1 text-sm text-secondary">{addon.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
