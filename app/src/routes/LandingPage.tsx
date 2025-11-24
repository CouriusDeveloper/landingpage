import { Hero } from '../components/sections/landing/Hero'
import { TrustBar } from '../components/sections/landing/TrustBar'
import { ProblemSolutionSection } from '../components/sections/landing/ProblemSolutionSection'
import { ServicesTeaser } from '../components/sections/landing/ServicesTeaser'
import { PortfolioTeaser } from '../components/sections/landing/PortfolioTeaser'
import { ProcessTeaser } from '../components/sections/landing/ProcessTeaser'
import { FaqTeaser } from '../components/sections/landing/FaqTeaser'
import { StrongCta } from '../components/sections/landing/StrongCta'

export function LandingPage() {
  return (
    <>
      <Hero />
      <TrustBar />
      <ProblemSolutionSection />
      <ServicesTeaser />
      <PortfolioTeaser />
      <ProcessTeaser />
      <FaqTeaser />
      <StrongCta />
    </>
  )
}
