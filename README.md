Perfekt, machen wir euch jetzt zur kleinen, sauberen **React-Webagentur** ✹ „individuelle Websites ohne WordPress & Backend-Bloat“.

Ich gebe dir wieder:

1. **Konzept & Positionierung**
2. **Seitenstruktur & Routen**
3. **Wireframe Landingpage**
4. **Wireframes für Untersites**
5. **Design Requirements (Farben, Typo, UI)**
6. **React-Struktur (Komponenten & Ordner)**

Du kannst das 1:1 als Grundlage für Figma + Code nehmen.

---

## 1. Konzept & Positionierung

### Angebot

Ihr (Fynn & Jan Albrecht) verkauft:

* **Individuelle, statische Websites** auf Basis von **React** (gern auch später Next.js)
* **Kein WordPress, kein klassisches Backend**, kein Baukastensystem
* Fokus auf:

  * **Performance** (Core Web Vitals, Lighthouse)
  * **Stabilität** (kein Plugin-Chaos)
  * **Klarheit** (gute Struktur, sauberes UX)
  * **Wartungsarm** (Updates minimal, einfacher Host)

### Zielgruppe

* Selbstständige, Solo-Unternehmer:innen (Coaches, Berater:innen, Creators)
* Kleine Unternehmen & Dienstleister (Agenturen, Ärzte, Kanzleien, Handwerker)
* Lokale Businesses, die „eine gute Seite“ wollen, ohne sich mit Tech zu beschäftigen

### Kernbotschaften (Messaging-Pfeiler)

1. **Schnell & leichtgewichtig** – statische React-Sites, superschnelle Ladezeiten.
2. **Individuell statt Template-Matsch** – jedes Projekt wirklich gestaltet, kein Theme-Overkill.
3. **Kein WordPress-Drama** – keine Updates, keine Pluginkonflikte, keine Sicherheitslöcher.
4. **Klarer Prozess** – 4–5 Schritte von Erstgespräch bis Launch, transparent & planbar.

---

## 2. Seitenstruktur & Routen

**Top-Level-Routen:**

* `/` – **Landingpage**
* `/leistungen` – Was ihr anbietet (Pakete, Features)
* `/portfolio` – Beispiele, Case-Studies
* `/prozess` – Ablauf vom Erstgespräch bis Launch
* `/ueber-uns` – Fynn & Jan, Philosophie
* `/faq` – Häufige Fragen
* `/kontakt` – Anfrage & Termin

Optional später:

* `/blog` – Artikel zu „kein WordPress“, „statische Sites“, „SEO-Basics“

---

## 3. Wireframe: Landingpage (`/`)

### 3.1 Struktur (Desktop)

```text
[HEADER – sticky]
-------------------------------------------------
  Logo/Wordmark (Fynn & Jan)
  [Leistungen] [Portfolio] [Prozess] [Über uns] [FAQ] [Kontakt]
                                       [Button: Projekt anfragen]

[HERO SECTION]
-------------------------------------------------
 | Linke Seite:
 |   H1: "Individuelle Websites ohne WordPress."
 |   Subline: "Schnelle, stabile React-Websites für Selbstständige und kleine Unternehmen."
 |   CTAs:
 |     [Projekt anfragen]  [Beispiele ansehen]
 |
 | Rechte Seite:
 |   Mockup-Visual (Laptop/Browserframe mit drei Beispielseiten)
 |   Kleine Bullet-Highlights:
 |     ✓ Ladezeit unter 1 Sekunde*
 |     ✓ Kein Plugin-Chaos
 |     ✓ Modernes Design

[TRUST / SOCIAL PROOF]
-------------------------------------------------
   Subheading: "Vertrauen ist kein Plugin."
   Reihe mit:
     - Logos / Namen von Kunden
     - Kurze Quote / Testimonial (1–2 Sätze)

[SECTION: PROBLEME MIT WORDPRESS / BAUKÄSTEN]
-------------------------------------------------
 Zweispaltig:
   Links: "Womit unsere Kunden vorher kämpfen:"
     - Punkte: Langsam, unsicher, unübersichtlich, Agentur weg etc.
   Rechts: "Was wir anders machen:"
     - Kurze Liste: statisch, React, Hosting auf Netlify/Vercel, minimales Setup

[SECTION: UNSERE LEISTUNGEN (TEASER)]
-------------------------------------------------
 3 Karten nebeneinander:
   - "Onepager" – für schnelle Präsenz
   - "Business-Website" – 3–6 Seiten
   - "Landingpage-Funnel" – für Kampagnen
  Jede Karte:
    - Kurzbeschreibung
    - Zielgruppe
    - „Ab-Preis“ (optional)
    - [Mehr erfahren] → /leistungen

[SECTION: PORTFOLIO TEASER]
-------------------------------------------------
 Grid mit 3 Projekten:
  - Screenshot / Mockup
  - Name, Branche
  - Kurzer Satz: "Vorher: Wix / Nachher: statische React-Seite"
  Button: [Alle Projekte ansehen] → /portfolio

[SECTION: PROZESS IN 4 SCHRITTEN]
-------------------------------------------------
 Timeline / 4 Icons:
  1. Kennenlernen & Ziele
  2. Struktur & Design
  3. Entwicklung in React
  4. Launch & Übergabe
 Button: [So arbeiten wir] → /prozess

[SECTION: FAQ TEASER]
-------------------------------------------------
 3–4 häufige Fragen als Akkordeons:
  - "Warum kein WordPress?"
  - "Kann ich Inhalte selbst ändern?"
  - "Wie lange dauert ein Projekt?"
 Button: [Alle Fragen] → /faq

[SECTION: STARKER CTA]
-------------------------------------------------
   H2: "Bereit für eine Website, die einfach funktioniert?"
   Subline: "Schreib uns kurz, was du vorhast – wir melden uns innerhalb von 24h."
   [Button: Projekt anfragen] → /kontakt

[FOOTER]
-------------------------------------------------
 Links: Logo, Kurzclaim
 Mitte: Hauptlinks
 Rechts: E-Mail, LinkedIn, GitHub (für Tech-Cred), Impressum/Datenschutz
```

### 3.2 Mobile-Anpassungen

* Header: Logo links, Burger rechts, CTA im Menu oder unter Hero-Text.
* Sektionen untereinander, 3-Karten-Grids → horizontale Slider oder Stack.
* CTAs immer full-width.

---

## 4. Wireframes für Untersites

### 4.1 `/leistungen` – Leistungen & Pakete

```text
[HERO]
 "Unsere Leistungen"

[INTRO]
 Kurztext: "Wir bauen Websites, die schnell sind, klar wirken und ohne WordPress auskommen."

[PAKETE-BEREICH]
 3–4 Karten:

 1) Onepager
    - Für: Coaches, Einzelunternehmer
    - Umfang: 1 Seite, max. 5 Sektionen
    - Inkl.: Basis-SEO, Kontaktformular (via Form-Service), Hosting-Setup
    - CTA: [Projekt starten]

 2) Business-Website
    - Umfang: 3–6 Inhaltsseiten
    - Blog/News optional statisch
    - Mehr Beratung / Konzept

 3) Landingpage
    - Fokus: Kampagnen, Produktlaunch
    - Conversion-optimiert, Tracking-Setup

 [Optional: „Add-ons“ Bereich]
    - Copywriting
    - SEO-Basics
    - Branding/Logo
    - Wartung / kleine Updates

[TECH-STACK-SEKTION]
 "Wie wir bauen"
  - React, (optional Next.js), CSS/ Tailwind
  - Hosting: Netlify, Vercel oder kundenseitiges Hosting
  - Formulare via Formspree / Netlify Forms / API-less Services

[CTA-BLOCK]
 "Unsicher, welches Paket passt?"
 [Button: Beratungs-Call anfragen]
```

---

### 4.2 `/portfolio` – Referenzen

```text
[HERO]
 "Ausgewählte Projekte"

[FILTER / TAGS (optional)]
  [Alle] [Coaches] [Lokale Betriebe] [Kreative] ...

[PROJECT GRID]
 Jede Projektkarte:
  - Screenshot / Mockup
  - Name & Branche
  - Key-Result (z.B. "PageSpeed 98/100", "Mehr Anfragen in 4 Wochen")
  - [Case ansehen] → /portfolio/projekt-slug (optional später)

[CTA]
 "Du willst hier auch stehen?"
 [Button: Projekt anfragen]
```

Optional Case-Page Wireframe (wenn ihr Case Studies bauen wollt):

* Hero: Projektname, Branche, Link
* Abschnitt: „Ausgangssituation“
* Abschnitt: „Unser Ansatz“
* Abschnitt: „Ergebnis“ (Zahlen, Zitate, Screenshots)

---

### 4.3 `/prozess` – Workflow

```text
[HERO]
 "So arbeiten wir zusammen"

[ZEITACHSE / STEPS]
 1. Erstgespräch (30–45 Min)
    - Ziele, Zielgruppe, Inhalte
 2. Struktur & Wireframe
    - Seitenstruktur, Content-Plan
 3. Design
    - Moodboard, erstes Screen-Design
 4. Entwicklung in React
    - Umsetzung, interne Tests
 5. Launch & Übergabe
    - Domain, Hosting, kurze Einweisung (Video/Call)

[INFOBOX]
 - Durchschnittliche Projektdauer (z.B. 2–4 Wochen)
 - Erwartung an den Kunden (Inhalte, Bilder)

[CTA]
 [Projekt starten]
```

---

### 4.4 `/ueber-uns` – Fynn & Jan

```text
[HERO]
 "Wir sind Fynn & Jan."

[ZWEISPALTIG]
 Links:
   Foto oder Illustration von euch
 Rechts:
   Kurzstory: Wer ihr seid, was ihr vorher gemacht habt, warum „kein WordPress“.

[SKILLS & FOKUS]
  - Fynn: Strategie, UX, Struktur
  - Jan: Design, Umsetzung, Frontend
  (oder wie ihr euch aufteilt)

[WORKING PRINCIPLES]
 3–4 Stichpunkte:
   - Direkte Kommunikation (WhatsApp/Slack/Telegram/…)
   - Klare Deadlines
   - Kein Bullshit-Tech, nur was nötig ist

[CTA]
 "Lass uns dein Projekt besprechen."
 [Kontakt-Button]
```

---

### 4.5 `/faq` – Häufige Fragen

```text
[HERO]
 "Häufige Fragen"

[FAQ-LISTE – ACCORDION]
 - Warum kein WordPress?
 - Kann ich Inhalte selbst ändern?
 - Was, wenn ich später doch ein Backend brauche?
 - Wie laufen Updates?
 - Was kostet eine Website bei euch?
 - Wie ist die Zahlungsabwicklung?

[CTA]
 "Deine Frage war nicht dabei?"
 [Kontakt-Button]
```

---

### 4.6 `/kontakt` – Kontakt & Anfrage

```text
[HERO]
 "Erzähl uns von deinem Projekt."

[2-SPALTIG (Desktop)]
 Links:
   Kurztext: "Schreib uns in 2–3 Sätzen, was du brauchst. Wir melden uns in 24h."
   Optional: CTA zu Calendly-Link ("Direkt Call buchen")

 Rechts:
   FORMULAR:
    - Name
    - E-Mail
    - Website (falls vorhanden)
    - Unternehmen/Branche
    - Budgetrange (Dropdown)
    - Freitext: Projektbeschreibung
    - Checkbox: Datenschutz
    - [Absenden]

[INFOBOX UNTEN]
 - E-Mail-Adresse
 - LinkedIn-Profile
 - Optional WhatsApp/Signal für Kunden
```

---

## 5. Design Requirements

### 5.1 Farbwelt

Minimal, modern, leicht techy:

* **Primary:** Dunkles Anthrazit `#111827`
* **Surface / Hintergrund Hell:** `#F9FAFB`
* **Text:** `#111827` (Dark), `#4B5563` (Secondary)
* **Accent:** Blau `#2563EB` *oder* Türkis `#14B8A6`
* **Muted Border/Lines:** `#E5E7EB`

Kontraste checken, Buttons deutlich vom Hintergrund abheben.

### 5.2 Typografie

* **Headings:** z.B. „Inter“ / „Space Grotesk“ / „Montserrat“ – Bold/SemiBold
* **Body:** „Inter“ Regular, 16–18px, Zeilenhöhe ~1.6
* **Code/Tech-Details:** optional „JetBrains Mono“ o.Ä. für kleine Tech-Hints

### 5.3 UI-Patterns

* **Buttons:**

  * Primary: gefüllt mit Accent-Farbe, weiße Schrift, leicht abgerundet (`border-radius: 0.5rem`)
  * Secondary: Outline oder Ghost, nur Border + Text in Accent-Farbe
* **Cards:**

  * Weißer Hintergrund, leichte Schatten, `border-radius: 0.75–1rem`
  * Konsistentes Padding (24–32px)
* **Sections:**

  * Konsistente Max-Width (`max-width: 1200px`) und `padding: 3–6rem` je nach Device
* **Icons:**

  * Simple Line-Icons (z.B. von Lucide/Feather), nicht zu verspielt

### 5.4 Responsiveness

* Mobile-first, Breakpoints z.B.:

  * `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`
* Hero: Stack (Text über Bild) auf Mobile, Side-by-Side auf Desktop
* Buttons full-width auf Mobile, inline auf Desktop

---

## 6. React-Struktur

### 6.1 Ordnerstruktur

```text
src/
  main.tsx
  App.tsx
  routes/
    LandingPage.tsx
    ServicesPage.tsx      // /leistungen
    PortfolioPage.tsx     // /portfolio
    ProcessPage.tsx       // /prozess
    AboutPage.tsx         // /ueber-uns
    FaqPage.tsx           // /faq
    ContactPage.tsx       // /kontakt
  components/
    layout/
      Layout.tsx
      Header.tsx
      Footer.tsx
    ui/
      Button.tsx
      Card.tsx
      Section.tsx         // Wrapper mit max-width & padding
      Accordion.tsx
      Badge.tsx
      Input.tsx
      Textarea.tsx
    sections/
      landing/
        Hero.tsx
        TrustBar.tsx
        ProblemSolutionSection.tsx
        ServicesTeaser.tsx
        PortfolioTeaser.tsx
        ProcessTeaser.tsx
        FaqTeaser.tsx
        StrongCta.tsx
      services/
        ServicePackageGrid.tsx
        TechStackSection.tsx
      portfolio/
        ProjectGrid.tsx
      process/
        StepsTimeline.tsx
      about/
        FoundersSection.tsx
        PrinciplesSection.tsx
      contact/
        ContactForm.tsx
```

### 6.2 Routing (z.B. mit `react-router-dom`)

```jsx
// App.tsx (skizziert)
<BrowserRouter>
  <Layout>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/leistungen" element={<ServicesPage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
      <Route path="/prozess" element={<ProcessPage />} />
      <Route path="/ueber-uns" element={<AboutPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/kontakt" element={<ContactPage />} />
    </Routes>
  </Layout>
</BrowserRouter>
```

---

Wenn du willst, kann ich dir als nächsten Schritt:

* eine **fertige JSX-Struktur für die Landingpage** mit Tailwind-Klassen schreiben (quasi copy-paste-bereit),
  oder
* ein **Content-Template** (Texte für Hero, Problem/Solution, Prozess, FAQ), das du direkt so auf die Seite klatschen kannst.
