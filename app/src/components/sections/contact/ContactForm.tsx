import type { FormEvent } from 'react'
import { Input } from '../../ui/Input'
import { Textarea } from '../../ui/Textarea'
import { Button } from '../../ui/Button'
import { contactInfo } from '../../../content/site'

export function ContactForm() {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    console.table(Object.fromEntries(formData.entries()))
    alert('Danke für deine Nachricht! Wir melden uns innerhalb von 24 Stunden.')
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[2fr,1fr]">
      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-100 bg-white/90 p-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Input label="Name" name="name" placeholder="Dein Name" required />
          <Input label="E-Mail" name="email" type="email" placeholder="mail@beispiel.de" required />
          <Input label="Website" name="website" placeholder="optional" />
          <Input label="Unternehmen / Branche" name="company" placeholder="z.B. Coaching" />
          <Input label="Budget" name="budget" placeholder="5.000 € – 10.000 €" />
        </div>
        <Textarea label="Projektbeschreibung" name="message" rows={5} placeholder="Beschreib in 2–3 Sätzen, worum es geht." required />
        <label className="flex items-center gap-3 text-sm text-secondary">
          <input type="checkbox" required className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent" />
          Ich stimme der Speicherung meiner Angaben zur Kontaktaufnahme zu.
        </label>
        <Button type="submit" size="lg">
          Abschicken
        </Button>
      </form>
      <div className="rounded-3xl border border-slate-100 bg-slate-900/95 p-8 text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">Direkter Draht</p>
        <h3 className="mt-4 text-3xl font-semibold">{contactInfo.email}</h3>
        <p className="mt-2 text-white/80">{contactInfo.responseTime}</p>
        <a href={contactInfo.calendly} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center font-semibold text-accentAlt">
          Direkt einen Call buchen →
        </a>
      </div>
    </div>
  )
}
