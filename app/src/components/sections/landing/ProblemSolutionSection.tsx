import { Section } from '../../ui/Section'

const pains = ['Langsame Ladezeiten & schlechte Mobilwerte', 'Plugin-Updates, Sicherheitslücken, White Screens', 'Unübersichtliche Admins, niemand fühlt sich zuständig', 'Agentur verschwunden, keine Dokumentation']
const solutions = ['Statische React-Setups ohne Ballast', 'Hosting auf Netlify/Vercel mit SSL & CI', 'Saubere Komponentensysteme und klare Struktur', 'Übergabe inkl. Video, Docs und Support-Option']

export function ProblemSolutionSection() {
  return (
    <Section
      background="muted"
      eyebrow="WordPress-Drama? Nicht mit uns."
      title="Was schief läuft – und wie wir es anders machen"
      description="Unsere Kund:innen kommen oft von Themes, die überladen sind. Wir bauen lieber schlanke Systeme mit klarer Verantwortung."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-secondary">Vorher</p>
          <h3 className="mt-2 text-2xl font-semibold text-primary">Womit unsere Kunden kämpfen</h3>
          <ul className="mt-6 space-y-4 text-secondary">
            {pains.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-rose-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-secondary">Nachher</p>
          <h3 className="mt-2 text-2xl font-semibold text-primary">So arbeiten wir</h3>
          <ul className="mt-6 space-y-4 text-secondary">
            {solutions.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 h-2 w-8 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}
