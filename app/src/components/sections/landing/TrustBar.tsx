import { trustLogos } from '../../../content/site'

export function TrustBar() {
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-content rounded-3xl border border-slate-100 bg-white/70 px-6 py-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-secondary">Vertrauen ist kein Plugin</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-8 text-lg font-semibold text-primary/60">
          {trustLogos.map((logo) => (
            <span key={logo}>{logo}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
