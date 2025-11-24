import { principles } from '../../../content/site'

export function PrinciplesSection() {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white/90 px-6 py-8">
      <p className="text-sm font-semibold uppercase tracking-[0.4em] text-secondary">Working Principles</p>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {principles.map((principle) => (
          <div key={principle.title}>
            <h3 className="text-lg font-semibold text-primary">{principle.title}</h3>
            <p className="mt-2 text-sm text-secondary">{principle.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
