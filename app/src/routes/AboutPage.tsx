import { Section } from '../components/ui/Section'
import { FoundersSection } from '../components/sections/about/FoundersSection'
import { PrinciplesSection } from '../components/sections/about/PrinciplesSection'
import { Button } from '../components/ui/Button'

export function AboutPage() {
  return (
    <>
      <Section
        title="Über uns"
        description="Brüder, Designer & Engineers. Wir bauen Websites, die unsere Kund:innen verstehen – ohne Over-Engineering."
        actions={<Button to="/register">Lass uns sprechen</Button>}
      >
        <FoundersSection />
      </Section>
      <Section background="muted">
        <PrinciplesSection />
      </Section>
    </>
  )
}
