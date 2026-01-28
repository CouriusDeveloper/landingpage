import { Section } from '../components/ui/Section'
import { Accordion } from '../components/ui/Accordion'
import { faqItems } from '../content/site'
import { Button } from '../components/ui/Button'

export function FaqPage() {
  return (
    <Section
      title="Häufige Fragen"
      description="Keine Frage zu klein. Und wenn deine fehlt, schreib uns einfach."
      actions={<Button to="/register">Kontakt aufnehmen</Button>}
    >
      <Accordion items={faqItems} />
    </Section>
  )
}
