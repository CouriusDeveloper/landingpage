import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Badge'

const highlights = ['Ladezeit unter 1 Sekunde*', 'Kein Plugin-Chaos', 'Modernes Design']

export function Hero() {
  return (
    <section className="px-4 pb-20 pt-16 md:pb-28 md:pt-24">
      <div className="mx-auto flex max-w-content flex-col items-center gap-12 lg:flex-row">
        <div className="flex-1">
          <Badge variant="accent">React-Webagentur</Badge>
          <h1 className="mt-6 font-heading text-4xl font-semibold text-primary sm:text-5xl">
            Individuelle Websites ohne WordPress.
          </h1>
          <p className="mt-6 text-lg text-secondary">
            Schnelle, stabile React-Websites für Selbstständige und kleine Unternehmen. Performance, Klarheit und ein Prozess, der Spaß macht.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Button to="/kontakt" size="lg">
              Projekt anfragen
            </Button>
            <Button to="/portfolio" variant="secondary" size="lg">
              Beispiele ansehen
            </Button>
          </div>
          <ul className="mt-10 flex flex-col gap-2 text-sm text-secondary">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1">
          <div className="relative rounded-3xl border border-slate-100 bg-white/80 p-8 shadow-card">
            <div className="absolute -top-5 right-8 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg">
              Core Web Vitals 98+
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-900/95 p-6 text-white shadow-lg">
                <p className="text-sm uppercase tracking-widest text-white/60">Projekt-Status</p>
                <p className="mt-4 text-2xl font-semibold">Launch bereit</p>
                <p className="mt-2 text-sm text-white/70">React · Tailwind · Netlify</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-6">
                <p className="text-sm font-semibold text-secondary">Was Kund:innen sagen</p>
                <p className="mt-4 text-lg font-medium text-primary">
                  „Keine Angst mehr vor Updates – die Seite läuft einfach.“
                </p>
                <p className="mt-2 text-sm text-secondary">Ärztin · Launch in 3 Wochen</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
