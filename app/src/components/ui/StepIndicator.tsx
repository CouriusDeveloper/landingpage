import clsx from 'clsx'

type StepIndicatorProps = {
  steps: string[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {steps.map((step, index) => {
        const isActive = index === currentStep
        const isDone = index < currentStep
        return (
          <div
            key={step}
            className={clsx(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold',
              isActive && 'border-accent bg-accent/10 text-accent',
              isDone && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              !isActive && !isDone && 'border-slate-200 text-secondary',
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold shadow">
              {index + 1}
            </span>
            {step}
          </div>
        )
      })}
    </div>
  )
}