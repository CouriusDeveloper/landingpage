import { SelectableCard } from './SelectableCard'

export interface StyleOption {
  id: string
  name: string
  description: string
  preview: string // Emoji or icon
}

const defaultStyles: StyleOption[] = [
  {
    id: 'minimal',
    name: 'Minimalistisch',
    description: 'Klare Linien, viel Weißraum, reduzierte Elemente',
    preview: '◻️',
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Zeitgemäßes Design mit Gradienten und Animationen',
    preview: '✨',
  },
  {
    id: 'playful',
    name: 'Verspielt',
    description: 'Bunte Farben, runde Formen, kreative Layouts',
    preview: '🎨',
  },
  {
    id: 'professional',
    name: 'Professionell',
    description: 'Seriöses Auftreten, klare Struktur, Vertrauen',
    preview: '💼',
  },
  {
    id: 'bold',
    name: 'Bold & Mutig',
    description: 'Große Typografie, starke Kontraste, auffällig',
    preview: '🔥',
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Luxuriös, raffiniert, hochwertige Ästhetik',
    preview: '👑',
  },
]

interface StyleSelectorProps {
  value: string
  onChange: (style: string) => void
  styles?: StyleOption[]
}

export function StyleSelector({ value, onChange, styles = defaultStyles }: StyleSelectorProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-primary">Website-Stil</label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {styles.map((style) => (
          <SelectableCard
            key={style.id}
            selected={value === style.id}
            onClick={() => onChange(style.id)}
          >
            <div className="text-center">
              <span className="text-3xl">{style.preview}</span>
              <h4 className="mt-2 font-semibold text-primary">{style.name}</h4>
              <p className="mt-1 text-xs text-secondary">{style.description}</p>
            </div>
          </SelectableCard>
        ))}
      </div>
    </div>
  )
}

// Optimization goals
export interface GoalOption {
  id: string
  name: string
  description: string
  icon: string
}

const defaultGoals: GoalOption[] = [
  {
    id: 'leads',
    name: 'Lead-Generierung',
    description: 'Kontaktanfragen und Newsletter-Anmeldungen',
    icon: '📧',
  },
  {
    id: 'sales',
    name: 'Verkauf',
    description: 'Produkte oder Dienstleistungen verkaufen',
    icon: '🛒',
  },
  {
    id: 'branding',
    name: 'Markenaufbau',
    description: 'Bekanntheit und Vertrauen steigern',
    icon: '🏆',
  },
  {
    id: 'information',
    name: 'Information',
    description: 'Inhalte präsentieren und informieren',
    icon: '📖',
  },
  {
    id: 'booking',
    name: 'Buchungen',
    description: 'Termine und Reservierungen ermöglichen',
    icon: '📅',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Arbeiten und Projekte präsentieren',
    icon: '🎯',
  },
]

interface GoalSelectorProps {
  value: string
  onChange: (goal: string) => void
  goals?: GoalOption[]
}

export function GoalSelector({ value, onChange, goals = defaultGoals }: GoalSelectorProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-primary">Hauptziel der Website</label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => (
          <SelectableCard
            key={goal.id}
            selected={value === goal.id}
            onClick={() => onChange(goal.id)}
          >
            <div className="text-center">
              <span className="text-3xl">{goal.icon}</span>
              <h4 className="mt-2 font-semibold text-primary">{goal.name}</h4>
              <p className="mt-1 text-xs text-secondary">{goal.description}</p>
            </div>
          </SelectableCard>
        ))}
      </div>
    </div>
  )
}
