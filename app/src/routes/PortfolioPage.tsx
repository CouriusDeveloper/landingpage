import { Section } from '../components/ui/Section'
import { ProjectGrid } from '../components/sections/portfolio/ProjectGrid'
import { Button } from '../components/ui/Button'

export function PortfolioPage() {
  return (
    <>
      <Section
        title="Ausgewählte Projekte"
        description="Von Onepagern bis hin zu mehrseitigen Unternehmensauftritten – immer individuell gestaltet."
      >
        <ProjectGrid />
        <div className="mt-10 text-center">
            <Button to="/register" size="lg">
            Du willst hier auch stehen?
          </Button>
        </div>
      </Section>
    </>
  )
}
