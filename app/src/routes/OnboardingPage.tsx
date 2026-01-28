import { useMemo, useState } from 'react'
import { Section } from '../components/ui/Section'
import { StepIndicator } from '../components/ui/StepIndicator'
import { SelectableCard } from '../components/ui/SelectableCard'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { Card } from '../components/ui/Card'
import { ColorPicker } from '../components/ui/ColorPicker'
import { FileUpload } from '../components/ui/FileUpload'
import { StyleSelector, GoalSelector } from '../components/ui/StyleSelector'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePricing, formatPrice, calculateOneTimeTotal, calculateDeposit } from '../hooks/usePricing'

// ============================================================================
// MULTI-AGENT SYSTEM: Neues Onboarding
// Das Onboarding sammelt strategische Informationen für die KI-Agenten
// Keine manuelle Seiten/Sections-Konfiguration mehr - der Strategist übernimmt
// ============================================================================

const steps = ['Paket', 'CMS & Hosting', 'Unternehmen', 'Branding', 'Ziele', 'Briefing', 'Zusammenfassung']

// Industrie-Optionen für den Strategist Agent
const industries = [
  { value: 'technology', label: 'Technologie & Software' },
  { value: 'consulting', label: 'Beratung & Consulting' },
  { value: 'agency', label: 'Agentur & Kreativ' },
  { value: 'ecommerce', label: 'E-Commerce & Handel' },
  { value: 'healthcare', label: 'Gesundheit & Medizin' },
  { value: 'finance', label: 'Finanzen & Versicherung' },
  { value: 'realestate', label: 'Immobilien' },
  { value: 'legal', label: 'Recht & Steuerberatung' },
  { value: 'education', label: 'Bildung & Coaching' },
  { value: 'hospitality', label: 'Gastronomie & Hotel' },
  { value: 'manufacturing', label: 'Produktion & Industrie' },
  { value: 'nonprofit', label: 'Non-Profit & Verein' },
  { value: 'other', label: 'Andere Branche' },
]

// Firmengrößen
const companySizes = [
  { value: 'solo', label: 'Einzelunternehmer/Freelancer' },
  { value: '2-10', label: '2-10 Mitarbeiter' },
  { value: '11-50', label: '11-50 Mitarbeiter' },
  { value: '51-200', label: '51-200 Mitarbeiter' },
  { value: '200+', label: 'Über 200 Mitarbeiter' },
]

// Brand Voice Optionen
const brandVoices = [
  { value: 'professional', label: 'Professionell', description: 'Seriös, kompetent, vertrauenswürdig' },
  { value: 'friendly', label: 'Freundlich', description: 'Nahbar, einladend, warmherzig' },
  { value: 'playful', label: 'Spielerisch', description: 'Kreativ, unkonventionell, humorvoll' },
  { value: 'luxurious', label: 'Luxuriös', description: 'Exklusiv, edel, premium' },
  { value: 'technical', label: 'Technisch', description: 'Präzise, datengetrieben, innovativ' },
]

export function OnboardingPage() {
  const { user } = useAuth()
  const { pricing, loading: pricingLoading } = usePricing()

  const [currentStep, setCurrentStep] = useState(0)
  const [selectedPackageSlug, setSelectedPackageSlug] = useState<string>('basic')
  const [includeCms, setIncludeCms] = useState(false)
  
  // Unternehmensinformationen (NEU für Multi-Agent)
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [foundedYear, setFoundedYear] = useState('')
  const [locationCity, setLocationCity] = useState('')
  const [locationCountry, setLocationCountry] = useState('Deutschland')
  
  // Branding
  const [primaryColor, setPrimaryColor] = useState('#0F172A')
  const [secondaryColor, setSecondaryColor] = useState('#059669')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [websiteStyle, setWebsiteStyle] = useState('modern')
  const [brandVoice, setBrandVoice] = useState('professional')
  
  // Ziele & Zielgruppe (erweitert)
  const [optimizationGoal, setOptimizationGoal] = useState('leads')
  const [targetAudience, setTargetAudience] = useState('')
  const [uniqueSellingPoint, setUniqueSellingPoint] = useState('')
  const [competitors, setCompetitors] = useState('')
  
  // Briefing (ersetzt manuelle Sections)
  const [projectName, setProjectName] = useState('')
  const [existingWebsite, setExistingWebsite] = useState('')
  const [briefDescription, setBriefDescription] = useState('')
  const [services, setServices] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')
  
  // Add-ons
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  
  // Email/Contact form settings
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [emailDomain, setEmailDomain] = useState('')
  
  // Tracking Pixel IDs (new addons)
  const [googlePixelId, setGooglePixelId] = useState('')
  const [metaPixelId, setMetaPixelId] = useState('')
  
  // State
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Find selected package
  const selectedPackage = pricing.packages.find((pkg) => pkg.slug === selectedPackageSlug)
  const cmsBase = pricing.addons.find((a) => a.slug === 'cms_base')
  const cmsPerPage = pricing.addons.find((a) => a.slug === 'cms_per_page')
  const hostingPlan = pricing.hosting.find((h) => h.includes_cms === includeCms)
  
  // Optional add-ons (exclude CMS-related ones)
  const optionalAddons = pricing.addons.filter((a) => !a.slug.startsWith('cms_'))

  // Calculate prices
  const oneTimeTotal = useMemo(() => {
    if (!selectedPackage || !cmsBase || !cmsPerPage) return 0
    return calculateOneTimeTotal(
      selectedPackage.price_cents,
      includeCms,
      cmsBase.price_cents,
      cmsPerPage.price_cents,
      selectedPackage.max_pages,
      selectedAddons,
      pricing.addons,
    )
  }, [selectedPackage, includeCms, cmsBase, cmsPerPage, selectedAddons, pricing.addons])
  
  // Calculate addons total for display
  const addonsTotal = useMemo(() => {
    return selectedAddons.reduce((sum, slug) => {
      const addon = optionalAddons.find((a) => a.slug === slug)
      return sum + (addon?.price_cents ?? 0)
    }, 0)
  }, [selectedAddons, optionalAddons])
  
  const toggleAddon = (slug: string) => {
    setSelectedAddons((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  const deposit = calculateDeposit(oneTimeTotal)
  const monthlyHosting = hostingPlan?.price_cents_monthly ?? 0

  const handleNext = () => setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1))
  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0))

  // Build comprehensive brief for Multi-Agent System
  const buildComprehensiveBrief = () => {
    const parts = [
      briefDescription,
      '',
      `== UNTERNEHMEN ==`,
      `Name: ${companyName}`,
      industry ? `Branche: ${industries.find(i => i.value === industry)?.label}` : null,
      companySize ? `Größe: ${companySizes.find(s => s.value === companySize)?.label}` : null,
      foundedYear ? `Gegründet: ${foundedYear}` : null,
      locationCity ? `Standort: ${locationCity}, ${locationCountry}` : null,
      '',
      `== DIENSTLEISTUNGEN/PRODUKTE ==`,
      services || 'Nicht angegeben',
      '',
      `== ZIELGRUPPE ==`,
      targetAudience || 'Allgemein',
      '',
      `== ALLEINSTELLUNGSMERKMAL (USP) ==`,
      uniqueSellingPoint || 'Nicht angegeben',
      '',
      competitors ? `== WETTBEWERBER ==\n${competitors}` : null,
      '',
      existingWebsite ? `== BESTEHENDE WEBSITE ==\n${existingWebsite}` : null,
      '',
      specialRequirements ? `== BESONDERE ANFORDERUNGEN ==\n${specialRequirements}` : null,
      '',
      `== STIL & TONALITÄT ==`,
      `Website-Stil: ${websiteStyle}`,
      `Brand Voice: ${brandVoices.find(v => v.value === brandVoice)?.label} - ${brandVoices.find(v => v.value === brandVoice)?.description}`,
      `Optimierungsziel: ${optimizationGoal}`,
    ].filter(Boolean).join('\n')
    
    return parts
  }

  const startCheckout = async () => {
    setCheckoutMessage(null)
    setError(null)
    if (!supabase || !user) {
      setError('Supabase ist nicht konfiguriert oder du bist nicht eingeloggt.')
      return
    }
    if (!projectName.trim()) {
      setError('Bitte gib einen Projektnamen an.')
      return
    }
    if (!companyName.trim()) {
      setError('Bitte gib einen Firmennamen an.')
      return
    }

    setSaving(true)
    try {
      // Build full addons list including CMS if selected
      const fullAddonsList = includeCms 
        ? ['cms_base', ...selectedAddons] 
        : selectedAddons

      // Build comprehensive brief for Multi-Agent System
      const comprehensiveBrief = buildComprehensiveBrief()

      // Insert project with extended data for Multi-Agent System
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: project, error: projectError } = await (supabase as any)
        .from('projects')
        .insert({
          offer_id: user.id,
          name: projectName,
          package_type: selectedPackageSlug,
          status: 'pending_payment',
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          logo_url: logoUrl,
          website_style: websiteStyle,
          optimization_goal: optimizationGoal,
          target_audience: targetAudience,
          selected_addons: fullAddonsList,
          brief: comprehensiveBrief,
          // Extended fields for Multi-Agent System
          industry: industry || null,
          company_size: companySize || null,
          founded_year: foundedYear ? parseInt(foundedYear) : null,
          location_city: locationCity || null,
          location_country: locationCountry || 'Deutschland',
          brand_voice: brandVoice,
          // Email settings for contact form
          contact_email: contactEmail || user.email || null,
          contact_phone: contactPhone || null,
          email_domain: selectedAddons.includes('booking_form') ? emailDomain : null,
          // Tracking Pixel IDs
          google_pixel_id: selectedAddons.includes('google_pixel') ? googlePixelId : null,
          meta_pixel_id: selectedAddons.includes('meta_pixel') ? metaPixelId : null,
          // Preview visibility (admin must enable)
          preview_visible: false,
        })
        .select()
        .single()

      if (projectError) {
        console.error('Project insert error:', projectError)
        throw projectError
      }

      // Multi-Agent System: Keine manuellen Seiten mehr!
      // Der Strategist Agent generiert automatisch die optimale Seitenstruktur
      // basierend auf dem Briefing und der Brand Strategy

      // Create invoice for one-time payment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('invoices').insert({
        project_id: project.id,
        amount_total: oneTimeTotal / 100,
        amount_paid: 0,
        status: 'open',
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('project_phases').insert({
        project_id: project.id,
        phase: 'discovery',
        status: 'pending',
        customer_visible_status: 'Warte auf Anzahlung.',
      })

      setCheckoutMessage('Projekt gespeichert! Weiterleitung zum Checkout…')
      
      // Call Stripe Checkout Edge Function
      const { data: session } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({
            projectId: project.id,
            depositAmountCents: deposit,
            customerEmail: user.email ?? '',
            successUrl: `${window.location.origin}/portal?checkout=success`,
            cancelUrl: `${window.location.origin}/onboarding?checkout=cancelled`,
          }),
        },
      )

      const checkoutData = await response.json()

      if (!response.ok) {
        throw new Error(checkoutData.error || 'Checkout konnte nicht gestartet werden')
      }

      // Redirect to Stripe Checkout
      window.location.href = checkoutData.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projekt konnte nicht angelegt werden.')
    } finally {
      setSaving(false)
    }
  }

  if (pricingLoading) {
    return (
      <Section title="Onboarding" description="Preise werden geladen…">
        <div className="text-center text-secondary">Bitte warten…</div>
      </Section>
    )
  }

  return (
    <Section title="Projekt starten" description="In 7 einfachen Schritten zu Ihrer Premium-Website.">
      <div className="space-y-10">
        <StepIndicator steps={steps} currentStep={currentStep} />

        {/* Step 1: Package Selection */}
        {currentStep === 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            {pricing.packages.map((pkg) => (
              <SelectableCard
                key={pkg.slug}
                selected={pkg.slug === selectedPackageSlug}
                onClick={() => setSelectedPackageSlug(pkg.slug)}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                  Bis zu {pkg.max_pages} Seiten
                </p>
                <h3 className="mt-3 text-xl font-semibold text-primary">{pkg.name}</h3>
                <p className="mt-2 text-sm text-secondary">{pkg.description}</p>
                <p className="mt-4 text-2xl font-semibold text-primary">{formatPrice(pkg.price_cents)}</p>
              </SelectableCard>
            ))}
          </div>
        )}

        {/* Step 2: CMS & Hosting */}
        {currentStep === 1 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">CMS-Einbindung</h3>
              <SelectableCard selected={!includeCms} onClick={() => setIncludeCms(false)}>
                <h4 className="text-lg font-semibold text-primary">Ohne CMS</h4>
                <p className="mt-2 text-sm text-secondary">
                  Statische Website – Änderungen über uns oder direkt im Code.
                </p>
              </SelectableCard>
              <SelectableCard selected={includeCms} onClick={() => setIncludeCms(true)}>
                <h4 className="text-lg font-semibold text-primary">Mit Sanity CMS</h4>
                <p className="mt-2 text-sm text-secondary">
                  Bearbeite Inhalte selbst über ein benutzerfreundliches Dashboard.
                </p>
                <p className="mt-2 text-sm font-semibold text-accent">
                  + {formatPrice(cmsBase?.price_cents ?? 0)} Basis + {formatPrice(cmsPerPage?.price_cents ?? 0)}/Seite
                </p>
              </SelectableCard>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-primary">Zusatzleistungen</h3>
              {optionalAddons.map((addon) => (
                <SelectableCard
                  key={addon.slug}
                  selected={selectedAddons.includes(addon.slug)}
                  onClick={() => toggleAddon(addon.slug)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-primary">{addon.name}</h4>
                      <p className="mt-1 text-sm text-secondary">{addon.description}</p>
                    </div>
                    <span className="shrink-0 text-lg font-semibold text-accent">
                      +{formatPrice(addon.price_cents)}
                    </span>
                  </div>
                </SelectableCard>
              ))}
              
              {/* Email Domain Input for booking_form addon */}
              {selectedAddons.includes('booking_form') && (
                <Card className="mt-4 border-accent/30 bg-accent/5">
                  <h4 className="text-sm font-semibold text-primary">E-Mail Einstellungen</h4>
                  <p className="mt-1 text-xs text-secondary">
                    Für professionelle Kontaktformulare benötigen wir Ihre E-Mail-Domain.
                  </p>
                  <div className="mt-3 space-y-3">
                    <Input
                      label="Empfänger E-Mail"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="kontakt@ihrefirma.de"
                      type="email"
                    />
                    <Input
                      label="E-Mail Domain (für Absender)"
                      value={emailDomain}
                      onChange={(e) => setEmailDomain(e.target.value)}
                      placeholder="ihrefirma.de"
                    />
                    <p className="text-xs text-secondary">
                      Sie erhalten DNS-Einträge zur Verifizierung nach der Buchung.
                    </p>
                  </div>
                </Card>
              )}
              
              {/* Google Pixel ID Input */}
              {selectedAddons.includes('google_pixel') && (
                <Card className="mt-4 border-accent/30 bg-accent/5">
                  <h4 className="text-sm font-semibold text-primary">Google Analytics</h4>
                  <p className="mt-1 text-xs text-secondary">
                    Geben Sie Ihre Google Analytics 4 Tracking-ID ein.
                  </p>
                  <div className="mt-3">
                    <Input
                      label="GA4 Measurement ID"
                      value={googlePixelId}
                      onChange={(e) => setGooglePixelId(e.target.value)}
                      placeholder="G-XXXXXXXXXX"
                    />
                    <p className="mt-1 text-xs text-secondary">
                      Zu finden in Google Analytics unter Admin → Datenstreams
                    </p>
                  </div>
                </Card>
              )}
              
              {/* Meta Pixel ID Input */}
              {selectedAddons.includes('meta_pixel') && (
                <Card className="mt-4 border-accent/30 bg-accent/5">
                  <h4 className="text-sm font-semibold text-primary">Meta Pixel</h4>
                  <p className="mt-1 text-xs text-secondary">
                    Geben Sie Ihre Meta (Facebook) Pixel ID ein.
                  </p>
                  <div className="mt-3">
                    <Input
                      label="Meta Pixel ID"
                      value={metaPixelId}
                      onChange={(e) => setMetaPixelId(e.target.value)}
                      placeholder="123456789012345"
                    />
                    <p className="mt-1 text-xs text-secondary">
                      Zu finden im Meta Events Manager unter Datenquellen
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Unternehmensinformationen (NEU) */}
        {currentStep === 2 && (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-primary">Erzählen Sie uns von Ihrem Unternehmen</h3>
              <p className="mt-2 text-secondary">
                Diese Informationen helfen unserer KI, Ihre Website optimal zu gestalten.
              </p>
            </div>
            
            <Card>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Firmenname *"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Muster GmbH"
                />
                <div>
                  <label className="block text-sm font-medium text-primary">Branche</label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Bitte wählen...</option>
                    {industries.map((ind) => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-primary">Unternehmensgröße</label>
                  <select
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Bitte wählen...</option>
                    {companySizes.map((size) => (
                      <option key={size.value} value={size.value}>{size.label}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Gründungsjahr"
                  value={foundedYear}
                  onChange={(e) => setFoundedYear(e.target.value)}
                  placeholder="2020"
                  type="number"
                />
              </div>
              
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input
                  label="Stadt"
                  value={locationCity}
                  onChange={(e) => setLocationCity(e.target.value)}
                  placeholder="Berlin"
                />
                <Input
                  label="Land"
                  value={locationCountry}
                  onChange={(e) => setLocationCountry(e.target.value)}
                  placeholder="Deutschland"
                />
              </div>
              
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input
                  label="Telefon"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+49 30 123456"
                  type="tel"
                />
                <Input
                  label="E-Mail"
                  value={contactEmail || user?.email || ''}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="kontakt@firma.de"
                  type="email"
                />
              </div>
            </Card>
          </div>
        )}

        {/* Step 4: Branding */}
        {currentStep === 3 && (
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-primary">Branding & Design</h3>
              <p className="mt-2 text-secondary">
                Definieren Sie das visuelle Erscheinungsbild Ihrer Website.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h4 className="text-sm font-semibold text-primary">Farbschema</h4>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <ColorPicker
                    label="Primärfarbe"
                    value={primaryColor}
                    onChange={setPrimaryColor}
                  />
                  <ColorPicker
                    label="Akzentfarbe"
                    value={secondaryColor}
                    onChange={setSecondaryColor}
                  />
                </div>
              </Card>

              <Card>
                <h4 className="text-sm font-semibold text-primary">Logo (optional)</h4>
                <div className="mt-4">
                  <FileUpload
                    label="Logo hochladen"
                    value={logoUrl}
                    onChange={setLogoUrl}
                    accept="image/*"
                    maxSizeMB={5}
                  />
                </div>
              </Card>
            </div>

            <Card>
              <h4 className="text-sm font-semibold text-primary">Website-Stil</h4>
              <div className="mt-4">
                <StyleSelector value={websiteStyle} onChange={setWebsiteStyle} />
              </div>
            </Card>

            <Card>
              <h4 className="text-sm font-semibold text-primary">Tonalität / Brand Voice</h4>
              <p className="mt-1 text-xs text-secondary">
                Wie soll Ihre Marke kommunizieren?
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {brandVoices.map((voice) => (
                  <SelectableCard
                    key={voice.value}
                    selected={brandVoice === voice.value}
                    onClick={() => setBrandVoice(voice.value)}
                  >
                    <h5 className="font-semibold text-primary">{voice.label}</h5>
                    <p className="mt-1 text-xs text-secondary">{voice.description}</p>
                  </SelectableCard>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Step 5: Ziele & Zielgruppe */}
        {currentStep === 4 && (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-primary">Ziele & Zielgruppe</h3>
              <p className="mt-2 text-secondary">
                Helfen Sie uns zu verstehen, wen Sie erreichen möchten.
              </p>
            </div>

            <Card>
              <h4 className="text-sm font-semibold text-primary">Hauptziel der Website</h4>
              <div className="mt-4">
                <GoalSelector value={optimizationGoal} onChange={setOptimizationGoal} />
              </div>
            </Card>

            <Card>
              <Textarea
                label="Zielgruppe *"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Beschreiben Sie Ihre idealen Kunden: Wer sind sie? Was suchen sie? Welche Probleme haben sie?"
                rows={4}
              />
            </Card>

            <Card>
              <Textarea
                label="Was macht Sie einzigartig? (USP)"
                value={uniqueSellingPoint}
                onChange={(e) => setUniqueSellingPoint(e.target.value)}
                placeholder="Was unterscheidet Sie von der Konkurrenz? Warum sollten Kunden Sie wählen?"
                rows={3}
              />
            </Card>

            <Card>
              <Textarea
                label="Wettbewerber (optional)"
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
                placeholder="Nennen Sie 2-3 Wettbewerber oder Websites, die Ihnen gefallen..."
                rows={2}
              />
            </Card>
          </div>
        )}

        {/* Step 6: Briefing (ersetzt Seiten & Abschnitte) */}
        {currentStep === 5 && (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-primary">Briefing</h3>
              <p className="mt-2 text-secondary">
                Erzählen Sie uns alles, was wir wissen sollten. Unsere KI generiert automatisch 
                die optimale Seitenstruktur basierend auf Ihren Angaben.
              </p>
            </div>

            <Card>
              <Input
                label="Projektname *"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="z.B. Website Relaunch 2026"
              />
            </Card>

            <Card>
              <Textarea
                label="Beschreibung Ihres Unternehmens *"
                value={briefDescription}
                onChange={(e) => setBriefDescription(e.target.value)}
                placeholder="Beschreiben Sie Ihr Unternehmen, Ihre Geschichte und Ihre Mission. Was treibt Sie an? Was möchten Sie mit der Website erreichen?"
                rows={5}
              />
            </Card>

            <Card>
              <Textarea
                label="Ihre Dienstleistungen / Produkte"
                value={services}
                onChange={(e) => setServices(e.target.value)}
                placeholder="Listen Sie Ihre wichtigsten Dienstleistungen oder Produkte auf. Was bieten Sie an? Was kostet es ungefähr?"
                rows={4}
              />
            </Card>

            <Card>
              <Input
                label="Bestehende Website (falls vorhanden)"
                value={existingWebsite}
                onChange={(e) => setExistingWebsite(e.target.value)}
                placeholder="https://www.ihrewebsite.de"
                type="url"
              />
            </Card>

            <Card>
              <Textarea
                label="Besondere Anforderungen oder Wünsche"
                value={specialRequirements}
                onChange={(e) => setSpecialRequirements(e.target.value)}
                placeholder="Gibt es bestimmte Funktionen, Seiten oder Elemente, die Sie unbedingt haben möchten? (z.B. Terminbuchung, Portfolio-Galerie, Blog...)"
                rows={3}
              />
            </Card>

            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-6 w-6 text-cyan-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                <div>
                  <h4 className="font-semibold text-cyan-900">Automatische Struktur-Generierung</h4>
                  <p className="mt-1 text-sm text-cyan-700">
                    Basierend auf Ihren Angaben erstellt unsere KI automatisch die optimale 
                    Seitenstruktur mit allen passenden Abschnitten. Sie müssen keine einzelnen 
                    Seiten oder Abschnitte konfigurieren – das übernehmen wir für Sie!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Zusammenfassung */}
        {currentStep === 6 && (
          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="space-y-4">
              <Card>
                <h3 className="text-lg font-semibold text-primary">Projektübersicht</h3>
                
                {/* Projekt & Unternehmen */}
                <div className="mt-4 border-b border-slate-100 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                    Projekt
                  </p>
                  <p className="mt-2 text-lg font-semibold text-primary">{projectName || 'Kein Name'}</p>
                  <p className="text-sm text-secondary">{companyName}</p>
                </div>

                {/* Branche & Größe */}
                <div className="mt-4 grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                      Branche
                    </p>
                    <p className="mt-1 text-sm text-primary">
                      {industries.find(i => i.value === industry)?.label || 'Nicht angegeben'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                      Unternehmensgröße
                    </p>
                    <p className="mt-1 text-sm text-primary">
                      {companySizes.find(s => s.value === companySize)?.label || 'Nicht angegeben'}
                    </p>
                  </div>
                </div>

                {/* Branding */}
                <div className="mt-4 border-b border-slate-100 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                    Branding
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-8 w-8 rounded-full border border-slate-200"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div
                      className="h-8 w-8 rounded-full border border-slate-200"
                      style={{ backgroundColor: secondaryColor }}
                    />
                    <span className="text-sm text-secondary">
                      {websiteStyle} • {brandVoices.find(v => v.value === brandVoice)?.label}
                    </span>
                  </div>
                </div>

                {/* Zielgruppe */}
                <div className="mt-4 border-b border-slate-100 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                    Zielgruppe
                  </p>
                  <p className="mt-2 text-sm text-secondary line-clamp-2">
                    {targetAudience || 'Nicht angegeben'}
                  </p>
                </div>

                {/* KI-Hinweis */}
                <div className="mt-4 rounded-lg bg-gradient-to-r from-emerald-50 to-cyan-50 p-4">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                    <p className="text-sm font-medium text-emerald-800">
                      Multi-Agent KI generiert Ihre Website
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-emerald-700">
                    Unser Team aus spezialisierten KI-Agenten (Strategist, Content Creator, Editor, 
                    Code Renderer) arbeitet zusammen, um Ihre perfekte Website zu erstellen.
                  </p>
                </div>

                {(checkoutMessage || error) && (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-2 text-sm ${
                      error
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {error ?? checkoutMessage}
                  </div>
                )}
                
                <Button 
                  size="lg" 
                  onClick={startCheckout} 
                  disabled={saving || !projectName.trim() || !companyName.trim()}
                  className="mt-4 w-full"
                >
                  {saving ? 'Wird gespeichert…' : `${formatPrice(deposit)} Anzahlung starten`}
                </Button>
              </Card>
            </div>
            
            <PriceSummaryCard
              packageName={selectedPackage?.name ?? ''}
              packagePrice={selectedPackage?.price_cents ?? 0}
              includeCms={includeCms}
              cmsTotal={includeCms ? (cmsBase?.price_cents ?? 0) + (cmsPerPage?.price_cents ?? 0) * (selectedPackage?.max_pages ?? 0) : 0}
              addonsTotal={addonsTotal}
              addonsNames={selectedAddons.map((slug) => optionalAddons.find((a) => a.slug === slug)?.name ?? '')}
              oneTimeTotal={oneTimeTotal}
              deposit={deposit}
              monthlyHosting={monthlyHosting}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" onClick={handleBack} disabled={currentStep === 0}>
            Zurück
          </Button>
          {currentStep < steps.length - 1 && (
            <Button onClick={handleNext}>Weiter</Button>
          )}
        </div>
      </div>
    </Section>
  )
}

// Price Summary Card Component
function PriceSummaryCard({
  packageName,
  packagePrice,
  includeCms,
  cmsTotal,
  addonsTotal = 0,
  addonsNames = [],
  oneTimeTotal,
  deposit,
  monthlyHosting,
}: {
  packageName: string
  packagePrice: number
  includeCms: boolean
  cmsTotal: number
  addonsTotal?: number
  addonsNames?: string[]
  oneTimeTotal: number
  deposit: number
  monthlyHosting: number
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-6">
      <h3 className="text-lg font-semibold text-primary">Zusammenfassung</h3>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-secondary">Paket ({packageName})</span>
          <span className="font-semibold text-primary">{formatPrice(packagePrice)}</span>
        </div>
        {includeCms && (
          <div className="flex justify-between">
            <span className="text-secondary">CMS-Einbindung</span>
            <span className="font-semibold text-primary">{formatPrice(cmsTotal)}</span>
          </div>
        )}
        {addonsTotal > 0 && (
          <div className="flex justify-between">
            <span className="text-secondary" title={addonsNames.join(', ')}>Zusatzleistungen</span>
            <span className="font-semibold text-primary">{formatPrice(addonsTotal)}</span>
          </div>
        )}
        <div className="border-t border-dashed border-slate-200 pt-3">
          <div className="flex justify-between text-base font-semibold text-primary">
            <span>Einmalig gesamt</span>
            <span>{formatPrice(oneTimeTotal)}</span>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">Anzahlung (50%)</p>
        <p className="mt-2 text-2xl font-semibold">{formatPrice(deposit)}</p>
      </div>
      <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Monatliches Hosting</p>
        <p className="mt-2 text-xl font-semibold text-primary">{formatPrice(monthlyHosting)} / Monat</p>
      </div>
    </div>
  )
}
