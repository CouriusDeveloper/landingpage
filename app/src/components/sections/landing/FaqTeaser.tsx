import { faqItems } from '../../../content/site'
import { Section } from '../../ui/Section'
import { Accordion } from '../../ui/Accordion'
import { Button } from '../../ui/Button'

export function FaqTeaser() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="Antworten auf die Klassiker"
      description="Mehr Fragen? Wir haben eine komplette FAQ-Seite vorbereitet."
      actions={<Button to="/faq" variant="secondary">Alle Fragen</Button>}
    >
      <Accordion items={faqItems.slice(0, 3)} />
    </Section>
  )
}
