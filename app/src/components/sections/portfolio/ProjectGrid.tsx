import { projects } from '../../../content/site'
import { Card } from '../../ui/Card'

export function ProjectGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {projects.map((project) => (
        <Card key={project.name}>
          <div className="rounded-2xl bg-slate-900/95 p-6 text-white">
            <p className="text-sm uppercase tracking-[0.4em] text-white/60">{project.industry}</p>
            <h3 className="mt-2 text-2xl font-semibold">{project.name}</h3>
            <p className="mt-4 text-sm text-white/80">{project.beforeAfter}</p>
            <p className="mt-6 text-sm font-semibold text-emerald-300">{project.result}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
