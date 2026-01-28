import { Button } from '../../ui/Button'

export function StrongCta() {
  return (
    <section className="px-4 pb-20">
      <div className="mx-auto max-w-content rounded-3xl bg-primary px-8 py-12 text-white shadow-card">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accentAlt">Nächster Schritt</p>
        <h2 className="mt-4 font-heading text-3xl font-semibold">Bereit für eine Website, die einfach funktioniert?</h2>
        <p className="mt-4 text-lg text-white/80">Schreib uns kurz, was du vorhast – wir melden uns innerhalb von 24 Stunden.</p>
        <div className="mt-8 flex flex-col gap-4 text-primary sm:flex-row">
          <Button to="/register" size="lg">
            Projekt anfragen
          </Button>
          <Button
            to="/prozess"
            variant="ghost"
            size="lg"
            className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            Ablauf ansehen
          </Button>
        </div>
      </div>
    </section>
  )
}
