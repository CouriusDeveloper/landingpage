import { processSteps } from '../../../content/site'

export function StepsTimeline() {
  return (
    <ol className="space-y-6 border-l border-slate-200 pl-6">
      {processSteps.map((step, index) => (
        <li key={step.title} className="relative rounded-2xl bg-white/80 p-6 shadow-sm">
          <span className="absolute -left-3 top-6 h-6 w-6 rounded-full border-2 border-white bg-accent shadow" />
          <p className="text-sm font-semibold text-accent">Phase {index + 1}</p>
          <h3 className="mt-2 text-2xl font-semibold text-primary">{step.title}</h3>
          <p className="mt-3 text-secondary">{step.description}</p>
        </li>
      ))}
    </ol>
  )
}
