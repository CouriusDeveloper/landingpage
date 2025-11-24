import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'

export type AccordionItem = {
  question: string
  answer: string
}

type AccordionProps = {
  items: AccordionItem[]
}

export function Accordion({ items }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-100 bg-white/80">
      {items.map((item, index) => {
        const isOpen = openIndex === index
        return (
          <button
            key={item.question}
            className="flex w-full flex-col text-left"
            onClick={() => setOpenIndex(isOpen ? -1 : index)}
            type="button"
          >
            <div className="flex items-center justify-between gap-6 px-6 py-5">
              <div>
                <p className="font-semibold text-primary">{item.question}</p>
                {isOpen && <p className="mt-3 text-base text-secondary">{item.answer}</p>}
              </div>
              <ChevronDown className={clsx('h-5 w-5 flex-none transition-transform', isOpen && 'rotate-180 text-accent')} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
