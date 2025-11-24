import { Section } from '../components/ui/Section'
import { ContactForm } from '../components/sections/contact/ContactForm'

export function ContactPage() {
  return (
    <Section
      title="Erzähl uns von deinem Projekt"
      description="Schreib uns in 2–3 Sätzen, was du brauchst. Wir melden uns in 24 Stunden."
    >
      <ContactForm />
    </Section>
  )
}
