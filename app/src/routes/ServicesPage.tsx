import { Section } from '../components/ui/Section'
import { ServicePackageGrid } from '../components/sections/services/ServicePackageGrid'
import { TechStackSection } from '../components/sections/services/TechStackSection'
import { Button } from '../components/ui/Button'

export function ServicesPage() {
  return (
    <>
      <Section
        title="Unsere Leistungen"
        description="Wir bauen Websites, die schnell sind, klar wirken und ohne WordPress auskommen."
        actions={<Button to="/register">Beratungsgespräch</Button>}
      >
        <ServicePackageGrid />
      </Section>
      <Section background="muted">
        <TechStackSection />
      </Section>
    </>
  )
}
