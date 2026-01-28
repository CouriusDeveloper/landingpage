import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type PackagePricing = {
  id: string
  slug: string
  name: string
  description: string | null
  max_pages: number
  price_cents: number
}

export type AddonPricing = {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  price_type: 'fixed' | 'per_page'
}

export type HostingPricing = {
  id: string
  slug: string
  name: string
  description: string | null
  includes_cms: boolean
  price_cents_monthly: number
  min_months: number
  notice_months: number
}

export type PricingData = {
  packages: PackagePricing[]
  addons: AddonPricing[]
  hosting: HostingPricing[]
}

// Fallback data if Supabase is not configured
const fallbackPricing: PricingData = {
  packages: [
    { id: '1', slug: 'basic', name: 'Basic', description: 'Bis zu 3 Unterseiten.', max_pages: 3, price_cents: 100000 },
    { id: '2', slug: 'business', name: 'Business', description: 'Bis zu 7 Unterseiten.', max_pages: 7, price_cents: 180000 },
    { id: '3', slug: 'enterprise', name: 'Enterprise', description: 'Bis zu 10 Unterseiten.', max_pages: 10, price_cents: 240000 },
  ],
  addons: [
    { id: '1', slug: 'cms_base', name: 'CMS-Einbindung', description: 'Headless CMS Setup mit Sanity.', price_cents: 50000, price_type: 'fixed' },
    { id: '2', slug: 'cms_per_page', name: 'CMS pro Seite', description: 'Je Unterseite.', price_cents: 25000, price_type: 'per_page' },
    { id: '3', slug: 'booking_form', name: 'Kontaktformular', description: 'Formular mit E-Mail-Benachrichtigung via Resend.', price_cents: 50000, price_type: 'fixed' },
    { id: '4', slug: 'google_pixel', name: 'Google Analytics', description: 'Google Analytics 4 Integration mit Cookie Consent.', price_cents: 15000, price_type: 'fixed' },
    { id: '5', slug: 'meta_pixel', name: 'Meta Pixel', description: 'Facebook/Instagram Tracking mit Cookie Consent.', price_cents: 15000, price_type: 'fixed' },
    { id: '6', slug: 'seo_package', name: 'SEO-Paket', description: 'Sitemap, robots.txt, Meta-Tags Optimierung.', price_cents: 25000, price_type: 'fixed' },
    { id: '7', slug: 'blog_addon', name: 'Blog-System', description: 'Vollständiges Blog mit Sanity CMS, Kategorien und Artikeln.', price_cents: 75000, price_type: 'fixed' },
    { id: '8', slug: 'cookie_consent', name: 'Cookie Consent Banner', description: 'DSGVO-konformer Cookie Banner.', price_cents: 10000, price_type: 'fixed' },
  ],
  hosting: [
    { id: '1', slug: 'hosting_standard', name: 'Managed Hosting', description: 'Ohne CMS.', includes_cms: false, price_cents_monthly: 10000, min_months: 12, notice_months: 3 },
    { id: '2', slug: 'hosting_cms', name: 'Managed Hosting + CMS', description: 'Mit CMS-Wartung.', includes_cms: true, price_cents_monthly: 30000, min_months: 12, notice_months: 3 },
  ],
}

export function usePricing() {
  const [pricing, setPricing] = useState<PricingData>(fallbackPricing)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const load = async () => {
      // TypeScript narrowing - supabase is guaranteed non-null here due to guard above
      const client = supabase!
      try {
        const [packagesRes, addonsRes, hostingRes] = await Promise.all([
          client.from('package_pricing').select('*').eq('active', true).order('sort_order'),
          client.from('addon_pricing').select('*').eq('active', true).order('sort_order'),
          client.from('hosting_pricing').select('*').eq('active', true).order('sort_order'),
        ])

        if (packagesRes.error) throw packagesRes.error
        if (addonsRes.error) throw addonsRes.error
        if (hostingRes.error) throw hostingRes.error

        setPricing({
          packages: packagesRes.data ?? fallbackPricing.packages,
          addons: addonsRes.data ?? fallbackPricing.addons,
          hosting: hostingRes.data ?? fallbackPricing.hosting,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Preise konnten nicht geladen werden.')
        // Keep fallback data on error
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  return { pricing, loading, error }
}

// Helper to format cents to EUR
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

// Calculate total one-time cost
export function calculateOneTimeTotal(
  packagePrice: number,
  includeCms: boolean,
  cmsBasePrice: number,
  cmsPerPagePrice: number,
  pageCount: number,
  selectedAddons: string[] = [],
  addons: AddonPricing[] = [],
): number {
  let total = packagePrice
  if (includeCms) {
    total += cmsBasePrice + cmsPerPagePrice * pageCount
  }
  // Add selected optional addons (fixed price only)
  for (const addonSlug of selectedAddons) {
    const addon = addons.find((a) => a.slug === addonSlug && a.price_type === 'fixed')
    if (addon) {
      total += addon.price_cents
    }
  }
  return total
}

// Calculate deposit (50%)
export function calculateDeposit(totalCents: number): number {
  return Math.round(totalCents * 0.5)
}
