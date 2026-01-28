// Content Pack Types - Single Source of Truth for all website content
// The Content Pack contains ALL textual and structural content
// Code generation ONLY renders this - never invents content

// =============================================================================
// CORE CONTENT PACK STRUCTURE
// =============================================================================

export interface ContentPack {
  // Metadata
  version: '1.0.0'
  generatedAt: string
  projectId: string
  hash: string // SHA-256 of content for caching
  
  // Site-wide settings
  siteSettings: SiteSettings
  
  // All pages with their content
  pages: PageContent[]
  
  // SEO metadata for all pages
  seo: SeoContent[]
  
  // Legal pages content
  legal: LegalContent
  
  // Navigation structure
  navigation: NavigationContent
  
  // Footer content
  footer: FooterContent
  
  // Blog content (if addon enabled)
  blog?: BlogContent
  
  // Component-specific content
  components: ComponentContent
}

// =============================================================================
// SITE SETTINGS
// =============================================================================

export interface SiteSettings {
  // Brand identity
  brand: BrandIdentity
  
  // Color scheme
  colors: ColorScheme
  
  // Typography
  typography: TypographySettings
  
  // Contact information
  contact: ContactInfo
  
  // Social media links
  social: SocialLinks
  
  // Business information
  business: BusinessInfo
}

export interface BrandIdentity {
  name: string
  tagline: string
  shortDescription: string // 1-2 sentences
  longDescription: string // Full brand story
  logoUrl: string | null
  favicon: string | null
  brandVoice: 'professional' | 'friendly' | 'playful' | 'luxurious' | 'technical'
  personality: string[] // e.g., ["innovative", "trustworthy", "approachable"]
}

export interface ColorScheme {
  primary: string // HEX
  primaryDark: string
  primaryLight: string
  secondary: string
  secondaryDark: string
  secondaryLight: string
  accent: string
  background: string
  backgroundAlt: string
  text: string
  textMuted: string
  textInverse: string
  success: string
  warning: string
  error: string
  
  // Dark mode variants
  dark: {
    background: string
    backgroundAlt: string
    text: string
    textMuted: string
  }
}

export interface TypographySettings {
  headingFont: string
  bodyFont: string
  monoFont: string
  baseFontSize: number
  lineHeight: number
  fontWeights: {
    light: number
    regular: number
    medium: number
    semibold: number
    bold: number
  }
}

export interface ContactInfo {
  email: string
  phone: string | null
  address: AddressInfo | null
  mapEmbed: string | null
}

export interface AddressInfo {
  street: string
  city: string
  state: string | null
  postalCode: string
  country: string
  formatted: string // Full formatted address
}

export interface SocialLinks {
  linkedin: string | null
  twitter: string | null
  instagram: string | null
  facebook: string | null
  youtube: string | null
  github: string | null
  tiktok: string | null
  discord: string | null
  custom: { name: string; url: string; icon: string }[]
}

export interface BusinessInfo {
  legalName: string
  type: 'freelancer' | 'agency' | 'startup' | 'enterprise' | 'nonprofit'
  foundedYear: number | null
  employeeCount: string | null // "1-10", "11-50", etc.
  industries: string[]
  services: string[]
  certifications: string[]
  awards: string[]
}

// =============================================================================
// PAGE CONTENT
// =============================================================================

export interface PageContent {
  id: string
  slug: string // "/" for home, "/about", etc.
  name: string
  title: string // H1
  subtitle: string | null
  description: string // Meta description
  
  // Sections in order
  sections: SectionContent[]
  
  // Page-specific settings
  settings: PageSettings
}

export interface PageSettings {
  showInNavigation: boolean
  navigationLabel: string | null
  navigationOrder: number
  isLandingPage: boolean
  template: 'default' | 'full-width' | 'sidebar' | 'minimal'
}

export interface SectionContent {
  id: string
  type: SectionType
  order: number
  
  // Common section properties
  headline: string | null
  subheadline: string | null
  eyebrow: string | null // Small text above headline
  description: string | null
  
  // Section-specific content
  content: SectionSpecificContent
  
  // Visual settings
  style: SectionStyle
}

export type SectionType =
  | 'hero'
  | 'features'
  | 'services'
  | 'about'
  | 'team'
  | 'testimonials'
  | 'portfolio'
  | 'pricing'
  | 'faq'
  | 'contact'
  | 'cta'
  | 'stats'
  | 'logos'
  | 'timeline'
  | 'comparison'
  | 'gallery'
  | 'newsletter'
  | 'blog-preview'
  | 'custom'

export type SectionSpecificContent =
  | HeroContent
  | FeaturesContent
  | ServicesContent
  | AboutContent
  | TeamContent
  | TestimonialsContent
  | PortfolioContent
  | PricingContent
  | FaqContent
  | ContactContent
  | CtaContent
  | StatsContent
  | LogosContent
  | TimelineContent
  | ComparisonContent
  | GalleryContent
  | NewsletterContent
  | BlogPreviewContent
  | CustomContent

export interface SectionStyle {
  background: 'light' | 'dark' | 'gradient' | 'image' | 'transparent'
  backgroundImage: string | null
  padding: 'none' | 'small' | 'medium' | 'large' | 'xl'
  width: 'narrow' | 'default' | 'wide' | 'full'
  alignment: 'left' | 'center' | 'right'
  animation: 'none' | 'fade' | 'slide-up' | 'slide-left' | 'slide-right' | 'zoom'
}

// =============================================================================
// SECTION-SPECIFIC CONTENT TYPES
// =============================================================================

export interface HeroContent {
  type: 'hero'
  variant: 'centered' | 'split' | 'video' | 'slider' | 'minimal'
  headline: string
  subheadline: string
  description: string | null
  primaryCta: CtaButton
  secondaryCta: CtaButton | null
  image: ImageContent | null
  video: VideoContent | null
  badges: string[] // Trust badges, e.g., "5★ Rated", "100+ Clients"
  announcement: AnnouncementBanner | null
}

export interface FeaturesContent {
  type: 'features'
  variant: 'grid' | 'list' | 'cards' | 'icons' | 'alternating'
  items: FeatureItem[]
  columns: 2 | 3 | 4
}

export interface FeatureItem {
  id: string
  icon: string // Lucide icon name
  title: string
  description: string
  link: string | null
}

export interface ServicesContent {
  type: 'services'
  variant: 'cards' | 'list' | 'detailed' | 'tabs'
  items: ServiceItem[]
}

export interface ServiceItem {
  id: string
  icon: string
  title: string
  shortDescription: string
  fullDescription: string
  features: string[]
  price: PriceInfo | null
  cta: CtaButton | null
  image: ImageContent | null
}

export interface PriceInfo {
  amount: number | null
  currency: string
  period: 'one-time' | 'monthly' | 'yearly' | 'custom'
  customLabel: string | null // "Starting at", "From", etc.
  note: string | null
}

export interface AboutContent {
  type: 'about'
  variant: 'story' | 'values' | 'mission' | 'combined'
  story: string | null
  mission: string | null
  vision: string | null
  values: ValueItem[]
  image: ImageContent | null
}

export interface ValueItem {
  id: string
  icon: string
  title: string
  description: string
}

export interface TeamContent {
  type: 'team'
  variant: 'grid' | 'list' | 'carousel'
  members: TeamMember[]
}

export interface TeamMember {
  id: string
  name: string
  role: string
  bio: string
  image: ImageContent | null
  social: Partial<SocialLinks>
}

export interface TestimonialsContent {
  type: 'testimonials'
  variant: 'cards' | 'slider' | 'masonry' | 'featured'
  items: TestimonialItem[]
}

export interface TestimonialItem {
  id: string
  quote: string
  author: string
  role: string
  company: string
  image: ImageContent | null
  rating: number | null // 1-5
  logo: ImageContent | null // Company logo
}

export interface PortfolioContent {
  type: 'portfolio'
  variant: 'grid' | 'masonry' | 'slider' | 'case-studies'
  items: PortfolioItem[]
  categories: string[]
}

export interface PortfolioItem {
  id: string
  title: string
  category: string
  shortDescription: string
  fullDescription: string | null
  image: ImageContent
  images: ImageContent[]
  link: string | null
  technologies: string[]
  client: string | null
  date: string | null
  results: string[] // Key results/metrics
}

export interface PricingContent {
  type: 'pricing'
  variant: 'cards' | 'table' | 'comparison'
  plans: PricingPlan[]
  features: PricingFeature[]
  faq: FaqItem[]
}

export interface PricingPlan {
  id: string
  name: string
  description: string
  price: PriceInfo
  features: string[]
  highlighted: boolean
  cta: CtaButton
  badge: string | null // "Popular", "Best Value", etc.
}

export interface PricingFeature {
  id: string
  name: string
  tooltip: string | null
  plans: Record<string, boolean | string> // plan.id -> included/value
}

export interface FaqContent {
  type: 'faq'
  variant: 'accordion' | 'grid' | 'categories'
  items: FaqItem[]
  categories: FaqCategory[]
}

export interface FaqItem {
  id: string
  question: string
  answer: string
  category: string | null
}

export interface FaqCategory {
  id: string
  name: string
  icon: string | null
}

export interface ContactContent {
  type: 'contact'
  variant: 'form' | 'split' | 'minimal' | 'map'
  headline: string
  description: string
  formFields: FormField[]
  submitButton: CtaButton
  successMessage: string
  errorMessage: string
  showMap: boolean
  showSocial: boolean
  showInfo: boolean
}

export interface FormField {
  id: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio'
  name: string
  label: string
  placeholder: string
  required: boolean
  options: string[] | null // For select, radio
  validation: string | null // Regex pattern
}

export interface CtaContent {
  type: 'cta'
  variant: 'banner' | 'split' | 'minimal' | 'floating'
  headline: string
  description: string
  primaryCta: CtaButton
  secondaryCta: CtaButton | null
  image: ImageContent | null
}

export interface StatsContent {
  type: 'stats'
  variant: 'inline' | 'cards' | 'counters'
  items: StatItem[]
}

export interface StatItem {
  id: string
  value: string // "500+", "99%", "$2M"
  label: string
  description: string | null
  icon: string | null
}

export interface LogosContent {
  type: 'logos'
  variant: 'grid' | 'slider' | 'marquee'
  headline: string | null
  items: LogoItem[]
}

export interface LogoItem {
  id: string
  name: string
  image: ImageContent
  link: string | null
}

export interface TimelineContent {
  type: 'timeline'
  variant: 'vertical' | 'horizontal' | 'alternating'
  items: TimelineItem[]
}

export interface TimelineItem {
  id: string
  date: string
  title: string
  description: string
  icon: string | null
  image: ImageContent | null
}

export interface ComparisonContent {
  type: 'comparison'
  variant: 'table' | 'cards' | 'side-by-side'
  headline: string
  items: ComparisonItem[]
  columns: ComparisonColumn[]
}

export interface ComparisonColumn {
  id: string
  name: string
  highlighted: boolean
}

export interface ComparisonItem {
  id: string
  feature: string
  values: Record<string, string | boolean>
}

export interface GalleryContent {
  type: 'gallery'
  variant: 'grid' | 'masonry' | 'lightbox' | 'slider'
  items: ImageContent[]
  columns: 2 | 3 | 4 | 5
}

export interface NewsletterContent {
  type: 'newsletter'
  variant: 'inline' | 'popup' | 'footer'
  headline: string
  description: string
  placeholder: string
  buttonText: string
  successMessage: string
  privacyNote: string
}

export interface BlogPreviewContent {
  type: 'blog-preview'
  variant: 'grid' | 'list' | 'featured'
  headline: string
  description: string | null
  postCount: number
  showCategories: boolean
  cta: CtaButton | null
}

export interface CustomContent {
  type: 'custom'
  html: string
  css: string | null
}

// =============================================================================
// SHARED CONTENT TYPES
// =============================================================================

export interface CtaButton {
  text: string
  url: string
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link'
  icon: string | null
  iconPosition: 'left' | 'right'
  openInNewTab: boolean
}

export interface ImageContent {
  src: string
  alt: string
  width: number | null
  height: number | null
  caption: string | null
  credit: string | null
}

export interface VideoContent {
  type: 'youtube' | 'vimeo' | 'file' | 'embed'
  url: string
  poster: ImageContent | null
  autoplay: boolean
  muted: boolean
  loop: boolean
}

export interface AnnouncementBanner {
  text: string
  link: string | null
  linkText: string | null
  dismissible: boolean
}

// =============================================================================
// SEO CONTENT
// =============================================================================

export interface SeoContent {
  pageSlug: string
  title: string // 50-60 chars
  description: string // 150-160 chars
  keywords: string[]
  ogImage: ImageContent | null
  ogType: 'website' | 'article' | 'product'
  canonical: string | null
  noIndex: boolean
  structuredData: StructuredDataContent | null
}

export interface StructuredDataContent {
  '@type': string
  data: Record<string, unknown>
}

// =============================================================================
// LEGAL CONTENT
// =============================================================================

export interface LegalContent {
  imprint: ImprintContent | null
  privacy: PrivacyContent | null
  terms: TermsContent | null
  cookies: CookiesContent | null
}

export interface ImprintContent {
  companyName: string
  legalForm: string | null
  representative: string | null // "{{TODO: Geschäftsführer Name}}" if unknown
  address: AddressInfo
  email: string
  phone: string | null
  vatId: string | null // "{{TODO: USt-IdNr.}}" if unknown
  registryCourt: string | null
  registryNumber: string | null
  responsibleForContent: string | null
  additionalInfo: string | null
}

export interface PrivacyContent {
  lastUpdated: string
  introduction: string
  sections: PrivacySection[]
  contactInfo: string
  dpoInfo: string | null // Data Protection Officer
}

export interface PrivacySection {
  id: string
  title: string
  content: string
}

export interface TermsContent {
  lastUpdated: string
  introduction: string
  sections: TermsSection[]
}

export interface TermsSection {
  id: string
  title: string
  content: string
}

export interface CookiesContent {
  introduction: string
  categories: CookieCategory[]
  managementInfo: string
}

export interface CookieCategory {
  id: string
  name: string
  description: string
  required: boolean
  cookies: CookieItem[]
}

export interface CookieItem {
  name: string
  purpose: string
  duration: string
  provider: string
}

// =============================================================================
// NAVIGATION & FOOTER
// =============================================================================

export interface NavigationContent {
  logo: ImageContent | null
  logoText: string | null
  items: NavItem[]
  ctaButton: CtaButton | null
  showThemeToggle: boolean
  sticky: boolean
  transparent: boolean
}

export interface NavItem {
  id: string
  label: string
  url: string
  children: NavItem[]
  icon: string | null
  badge: string | null
}

export interface FooterContent {
  logo: ImageContent | null
  tagline: string
  columns: FooterColumn[]
  bottom: FooterBottom
  newsletter: NewsletterContent | null
}

export interface FooterColumn {
  id: string
  title: string
  links: FooterLink[]
}

export interface FooterLink {
  label: string
  url: string
  external: boolean
}

export interface FooterBottom {
  copyright: string
  links: FooterLink[]
  showSocial: boolean
}

// =============================================================================
// BLOG CONTENT (if addon enabled)
// =============================================================================

export interface BlogContent {
  settings: BlogSettings
  categories: BlogCategory[]
  tags: BlogTag[]
  posts: BlogPost[]
  authors: BlogAuthor[]
}

export interface BlogSettings {
  postsPerPage: number
  showAuthor: boolean
  showDate: boolean
  showReadingTime: boolean
  showCategories: boolean
  showTags: boolean
  showRelatedPosts: boolean
  commentSystem: 'none' | 'disqus' | 'giscus' | null
}

export interface BlogCategory {
  id: string
  name: string
  slug: string
  description: string
  image: ImageContent | null
}

export interface BlogTag {
  id: string
  name: string
  slug: string
}

export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string // MDX content
  author: string // author id
  category: string // category id
  tags: string[] // tag ids
  image: ImageContent
  publishedAt: string
  updatedAt: string | null
  readingTime: number // minutes
  featured: boolean
  seo: SeoContent
}

export interface BlogAuthor {
  id: string
  name: string
  slug: string
  bio: string
  image: ImageContent | null
  social: Partial<SocialLinks>
}

// =============================================================================
// COMPONENT CONTENT (reusable across pages)
// =============================================================================

export interface ComponentContent {
  // Global announcement bar
  announcement: AnnouncementBanner | null
  
  // 404 page content
  notFound: NotFoundContent
  
  // Loading states
  loading: LoadingContent
  
  // Error states
  error: ErrorContent
  
  // Toast messages
  toasts: ToastMessages
}

export interface NotFoundContent {
  headline: string
  description: string
  cta: CtaButton
  image: ImageContent | null
}

export interface LoadingContent {
  text: string
  showSpinner: boolean
}

export interface ErrorContent {
  headline: string
  description: string
  retryCta: CtaButton
}

export interface ToastMessages {
  contactSuccess: string
  contactError: string
  newsletterSuccess: string
  newsletterError: string
  genericError: string
}

// =============================================================================
// CONTENT PACK METADATA
// =============================================================================

export interface ContentPackMetadata {
  // Generation info
  generatedBy: string // agent name
  generatedAt: string
  generationDuration: number // ms
  
  // Quality scores from Editor agent
  qualityScores: QualityScores
  
  // Revision history
  revisions: ContentRevision[]
  
  // Validation results
  validation: ValidationResult
}

export interface QualityScores {
  overall: number // 1-10
  contentQuality: number
  brandConsistency: number
  seoOptimization: number
  accessibility: number
  technicalAccuracy: number
  feedback: string[]
}

export interface ContentRevision {
  version: number
  timestamp: string
  changes: string[]
  score: number
  editorFeedback: string
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  path: string // JSON path to error
  message: string
  code: string
}

export interface ValidationWarning {
  path: string
  message: string
  suggestion: string
}
