import { techStack } from '../../../content/site'

export function TechStackSection() {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-900/95 px-8 py-10 text-white">
      <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Tech-Stack</p>
      <h3 className="mt-4 font-heading text-3xl font-semibold">Wie wir bauen</h3>
      <ul className="mt-6 space-y-4 text-white/80">
        {techStack.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-2 h-1.5 w-8 rounded-full bg-accentAlt" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
