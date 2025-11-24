import { Section } from '../components/ui/Section'
import { FoundersSection } from '../components/sections/about/FoundersSection'
import { PrinciplesSection } from '../components/sections/about/PrinciplesSection'
import { Button } from '../components/ui/Button'

export function AboutPage() {
  return (
    <>
      <Section
        title="Wir sind Fynn & Jan"
        description="Brüder, Designer & Engineers. Wir bauen Websites, die unsere Kund:innen verstehen – ohne Over-Engineering."
        actions={<Button to="/kontakt">Lass uns sprechen</Button>}
      >
        <FoundersSection />
      </Section>
      <Section background="muted">
        <PrinciplesSection />
      </Section>
    </>
  )
}
