export const navAnchors = [
  { label: 'Leistungen', path: '/leistungen' },
  { label: 'Portfolio', path: '/portfolio' },
  { label: 'Prozess', path: '/prozess' },
  { label: 'Über uns', path: '/ueber-uns' },
  { label: 'FAQ', path: '/faq' },
  { label: 'Portal', path: '/portal' },
]

export const servicePackages = [
  {
    name: 'Onepager',
    description: 'Für Solo-Selbstständige, die eine klare, schnelle Präsenz brauchen.',
    audience: 'Coaches, Berater:innen, Creators',
    inclusions: ['1 Seite, max. 5 Sektionen', 'Basis-SEO & Tracking', 'Onboarding & Projekt-Portal'],
    investment: 'ab 2.400 €',
    cta: '/register',
  },
  {
    name: 'Business-Website',
    description: 'Mehr Seiten, mehr Storytelling, mehr Beratung im Prozess.',
    audience: 'Agenturen, Kanzleien, Praxen',
    inclusions: ['3–6 Inhaltsseiten', 'Content-Plan & Wireframes', 'Option auf Blog/News statisch'],
    investment: 'ab 4.800 €',
    cta: '/register',
  },
  {
    name: 'Landingpage-Funnel',
    description: 'Conversion-starke Kampagnenseiten mit Fokus auf Leads.',
    audience: 'Productized Services, Launches, Ads',
    inclusions: ['A/B-Test-Ready Sektionen', 'Klares Copy Framework', 'Tracking-Setup & Handover'],
    investment: 'ab 3.200 €',
    cta: '/register',
  },
]

export const addons = [
  { title: 'Copy & Messaging', detail: 'Workshops + Feinschliff für Headlines & Story.' },
  { title: 'SEO-Basics', detail: 'Keyword-Setup, Meta-Daten, schlanke OnPage Checks.' },
  { title: 'Branding-Light', detail: 'Logo-Refresh, Farb- und Typo-System in Figma.' },
  { title: 'Wartung', detail: 'Monatliche Stundenkontingente für kleine Updates.' },
]

export const techStack = [
  'React & TypeScript',
  'Optional: Next.js für SSG/SSR',
  'Tailwind CSS oder handgeschriebenes CSS',
  'Hosting über Netlify / Vercel',
  'Formulare via Formspree, Netlify Forms oder Simple APIs',
]

export const projects = [
  {
    name: 'Studio Nord',
    industry: 'Kreativagentur',
    result: 'PageSpeed 98/100 · +32% Anfragen',
    beforeAfter: 'Vorher: WordPress-Theme · Nachher: Statische React-Site',
  },
  {
    name: 'Dr. Weber Praxis',
    industry: 'Zahnarztpraxis',
    result: 'Core Web Vitals durchgehend grün',
    beforeAfter: 'Vorher: Baukasten · Nachher: Custom React + Netlify',
  },
  {
    name: 'Freiraum Coaching',
    industry: 'Coach & Speakerin',
    result: 'Launch in 14 Tagen inkl. Copy',
    beforeAfter: 'Vorher: Wix · Nachher: Onepager mit Funnel',
  },
]

export const processSteps = [
  {
    title: 'Kennenlernen & Ziele',
    description: '30–45 Minuten Call, Ziele, Inhalte, Budget, Hosting.',
  },
  {
    title: 'Struktur & Wireframe',
    description: 'Wir planen Seitenarchitektur, Content und UX-Flows.',
  },
  {
    title: 'Design & Review',
    description: 'Moodboard, erstes Screen-Design, Feedbackrunde in Figma.',
  },
  {
    title: 'Entwicklung & QA',
    description: 'React + Tailwind, Performance-Check, Content-Befüllung.',
  },
  {
    title: 'Launch & Übergabe',
    description: 'Domain, Hosting, Video-Walkthrough, kleine Dokumentation.',
  },
]

export const faqItems = [
  {
    question: 'Warum baut ihr nicht mit WordPress?',
    answer:
      'Statische React-Sites laden schneller, sind sicherer und brauchen kein Plugin-Management. Für 90% der Projekte reicht das völlig aus.',
  },
  {
    question: 'Kann ich Inhalte selbst ändern?',
    answer: 'Ja. Wir strukturieren Inhalte so, dass ihr Texte & Bilder via Git, Headless CMS oder kleinen Änderungsservice updaten könnt.',
  },
  {
    question: 'Wie lange dauert ein Projekt?',
    answer: 'Onepager dauern 10–14 Tage, größere Seiten 3–5 Wochen – abhängig von Feedbackschleifen und Content-Lieferung.',
  },
  {
    question: 'Was ist, wenn ich später ausbauen möchte?',
    answer: 'Wir bauen Komponenten-basiert. Spätere Features oder CMS-Anbindung lassen sich sauber ergänzen.',
  },
  {
    question: 'Wie läuft die Zusammenarbeit ab?',
    answer: 'Direkte Chats via Slack/WhatsApp, klare Meilensteine in Notion, wöchentliche Updates.',
  },
]

export const founders = [
  {
    name: '',
    role: 'Struktur & UX',
    bio: 'Analysiert, ordnet und übersetzt Business-Ziele in klare Informationsarchitektur.',
  },
  {
    name: '',
    role: 'Design & Frontend',
    bio: 'Verpasst jedem Projekt eine visuelle Handschrift und baut saubere React-Interfaces.',
  },
]

export const principles = [
  { title: 'Direkte Kommunikation', detail: 'Keine Ticketsysteme – lieber kurze Sprachnachricht und weiter geht’s.' },
  { title: 'Klare Deadlines', detail: 'Jede Phase hat Start/Ende und sichtbare Deliverables.' },
  { title: 'Nur nötige Tools', detail: 'Kein Tech-Zoo. Wir setzen genau das ein, was Mehrwert schafft.' },
]

export const contactInfo = {
  email: '',
  responseTime: 'Antwort innerhalb von 24 Stunden',
  calendly: 'https://calendly.com/',
}

export const trustLogos = ['Studio Nord', 'Freiraum', 'BetterTax', 'Praxis Weber', 'Boldworks']
