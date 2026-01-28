import { useCallback, useState } from 'react'
import { Button } from './Button'
import { Textarea } from './Textarea'
import { Input } from './Input'
import { FileUpload } from './FileUpload'
import type { PageDefinition } from './PageBuilder'

export interface SectionTemplate {
  id: string
  type: string
  name: string
  description: string
  icon: string
  fields: SectionField[]
}

export interface SectionField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'image' | 'list'
  placeholder?: string
}

export interface SectionData {
  id: string
  type: string
  content: Record<string, string | string[]>
}

const sectionTemplates: SectionTemplate[] = [
  {
    id: 'hero',
    type: 'hero',
    name: 'Hero',
    description: 'Große Überschrift mit Bild und Call-to-Action',
    icon: '🎯',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Ihre aussagekräftige Headline' },
      { key: 'subheadline', label: 'Unterüberschrift', type: 'textarea', placeholder: 'Kurze Beschreibung' },
      { key: 'cta_text', label: 'Button-Text', type: 'text', placeholder: 'Jetzt starten' },
      { key: 'image', label: 'Hintergrundbild', type: 'image' },
    ],
  },
  {
    id: 'features',
    type: 'features',
    name: 'Features',
    description: 'Grid mit 3-6 Vorteilen oder Eigenschaften',
    icon: '✨',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Unsere Vorteile' },
      { key: 'features', label: 'Features (eine pro Zeile)', type: 'list', placeholder: 'Feature 1\nFeature 2\nFeature 3' },
    ],
  },
  {
    id: 'about',
    type: 'about',
    name: 'Über uns',
    description: 'Text mit Bild zur Vorstellung',
    icon: '👋',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Über uns' },
      { key: 'text', label: 'Text', type: 'textarea', placeholder: 'Erzählen Sie Ihre Geschichte...' },
      { key: 'image', label: 'Bild', type: 'image' },
    ],
  },
  {
    id: 'services',
    type: 'services',
    name: 'Leistungen',
    description: 'Auflistung Ihrer Dienstleistungen',
    icon: '🛠️',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Unsere Leistungen' },
      { key: 'services', label: 'Leistungen (eine pro Zeile)', type: 'list', placeholder: 'Beratung\nDesign\nEntwicklung' },
    ],
  },
  {
    id: 'testimonials',
    type: 'testimonials',
    name: 'Testimonials',
    description: 'Kundenstimmen und Bewertungen',
    icon: '💬',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Was unsere Kunden sagen' },
      { key: 'testimonials', label: 'Testimonials (Format: Name|Text)', type: 'list', placeholder: 'Max Mustermann|Tolle Zusammenarbeit!' },
    ],
  },
  {
    id: 'cta',
    type: 'cta',
    name: 'Call-to-Action',
    description: 'Auffällige Handlungsaufforderung',
    icon: '🚀',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Bereit loszulegen?' },
      { key: 'text', label: 'Text', type: 'textarea', placeholder: 'Kontaktieren Sie uns noch heute.' },
      { key: 'cta_text', label: 'Button-Text', type: 'text', placeholder: 'Kontakt aufnehmen' },
    ],
  },
  {
    id: 'gallery',
    type: 'gallery',
    name: 'Galerie',
    description: 'Bildergalerie oder Portfolio',
    icon: '🖼️',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Unsere Arbeiten' },
    ],
  },
  {
    id: 'contact',
    type: 'contact',
    name: 'Kontakt',
    description: 'Kontaktformular und Infos',
    icon: '📧',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Kontaktieren Sie uns' },
      { key: 'text', label: 'Text', type: 'textarea', placeholder: 'Wir freuen uns auf Ihre Nachricht.' },
      { key: 'email', label: 'E-Mail', type: 'text', placeholder: 'info@example.com' },
      { key: 'phone', label: 'Telefon', type: 'text', placeholder: '+49 123 456789' },
      { key: 'address', label: 'Adresse', type: 'textarea', placeholder: 'Musterstraße 1\n12345 Musterstadt' },
    ],
  },
  {
    id: 'faq',
    type: 'faq',
    name: 'FAQ',
    description: 'Häufig gestellte Fragen',
    icon: '❓',
    fields: [
      { key: 'headline', label: 'Überschrift', type: 'text', placeholder: 'Häufige Fragen' },
      { key: 'faqs', label: 'Fragen (Format: Frage|Antwort)', type: 'list', placeholder: 'Wie lange dauert es?|Ca. 4-6 Wochen.' },
    ],
  },
]

interface SectionBuilderProps {
  pages: PageDefinition[]
  sections: Record<string, SectionData[]>
  onChange: (sections: Record<string, SectionData[]>) => void
}

export function SectionBuilder({ pages, sections, onChange }: SectionBuilderProps) {
  const [activePage, setActivePage] = useState(pages[0]?.id ?? '')
  const [editingSection, setEditingSection] = useState<string | null>(null)

  const pageSections = sections[activePage] ?? []

  const addSection = useCallback(
    (template: SectionTemplate) => {
      const newSection: SectionData = {
        id: `section-${Date.now()}`,
        type: template.type,
        content: {},
      }
      onChange({
        ...sections,
        [activePage]: [...pageSections, newSection],
      })
      setEditingSection(newSection.id)
    },
    [activePage, pageSections, sections, onChange],
  )

  const removeSection = useCallback(
    (sectionId: string) => {
      onChange({
        ...sections,
        [activePage]: pageSections.filter((s) => s.id !== sectionId),
      })
      if (editingSection === sectionId) setEditingSection(null)
    },
    [activePage, pageSections, sections, onChange, editingSection],
  )

  const updateSectionContent = useCallback(
    (sectionId: string, key: string, value: string | string[]) => {
      onChange({
        ...sections,
        [activePage]: pageSections.map((s) =>
          s.id === sectionId ? { ...s, content: { ...s.content, [key]: value } } : s,
        ),
      })
    },
    [activePage, pageSections, sections, onChange],
  )

  const moveSection = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= pageSections.length) return

      const newSections = [...pageSections]
      ;[newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]]
      onChange({ ...sections, [activePage]: newSections })
    },
    [activePage, pageSections, sections, onChange],
  )

  const currentSection = pageSections.find((s) => s.id === editingSection)
  const currentTemplate = sectionTemplates.find((t) => t.type === currentSection?.type)

  return (
    <div className="space-y-6">
      {/* Page Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => {
              setActivePage(page.id)
              setEditingSection(null)
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activePage === page.id
                ? 'bg-accent text-white'
                : 'bg-slate-100 text-secondary hover:bg-slate-200'
            }`}
          >
            {page.name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Section List */}
        <div className="space-y-4">
          <h4 className="font-medium text-primary">Abschnitte für „{pages.find((p) => p.id === activePage)?.name}"</h4>

          {pageSections.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-secondary">
              Noch keine Abschnitte. Wähle unten einen aus.
            </p>
          ) : (
            <div className="space-y-2">
              {pageSections.map((section, index) => {
                const template = sectionTemplates.find((t) => t.type === section.type)
                return (
                  <div
                    key={section.id}
                    onClick={() => setEditingSection(section.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                      editingSection === section.id
                        ? 'border-accent bg-accent/5'
                        : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <span className="text-xl">{template?.icon}</span>
                    <div className="flex-1">
                      <p className="font-medium text-primary">{template?.name}</p>
                      <p className="text-xs text-secondary">
                        {(section.content.headline as string) || 'Nicht ausgefüllt'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          moveSection(index, 'up')
                        }}
                        disabled={index === 0}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          moveSection(index, 'down')
                        }}
                        disabled={index === pageSections.length - 1}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSection(section.id)
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Section Templates */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-secondary">Abschnitt hinzufügen:</p>
            <div className="grid grid-cols-3 gap-2">
              {sectionTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => addSection(template)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 p-3 text-center transition-colors hover:border-accent hover:bg-accent/5"
                >
                  <span className="text-xl">{template.icon}</span>
                  <span className="text-xs font-medium text-primary">{template.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section Editor */}
        <div className="rounded-2xl border border-slate-100 bg-white/90 p-6">
          {currentSection && currentTemplate ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{currentTemplate.icon}</span>
                <div>
                  <h4 className="font-semibold text-primary">{currentTemplate.name}</h4>
                  <p className="text-xs text-secondary">{currentTemplate.description}</p>
                </div>
              </div>

              <div className="space-y-4 border-t border-slate-100 pt-4">
                {currentTemplate.fields.map((field) => (
                  <div key={field.key}>
                    {field.type === 'text' && (
                      <Input
                        label={field.label}
                        name={field.key}
                        value={(currentSection.content[field.key] as string) ?? ''}
                        onChange={(e) => updateSectionContent(currentSection.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                    {field.type === 'textarea' && (
                      <Textarea
                        label={field.label}
                        name={field.key}
                        value={(currentSection.content[field.key] as string) ?? ''}
                        onChange={(e) => updateSectionContent(currentSection.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                      />
                    )}
                    {field.type === 'image' && (
                      <FileUpload
                        label={field.label}
                        value={(currentSection.content[field.key] as string) ?? null}
                        onChange={(url) => updateSectionContent(currentSection.id, field.key, url ?? '')}
                      />
                    )}
                    {field.type === 'list' && (
                      <Textarea
                        label={field.label}
                        name={field.key}
                        value={(currentSection.content[field.key] as string) ?? ''}
                        onChange={(e) => updateSectionContent(currentSection.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                      />
                    )}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingSection(null)}
                className="w-full"
              >
                Fertig
              </Button>
            </div>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center text-center text-secondary">
              <div>
                <p className="text-4xl">👈</p>
                <p className="mt-2">Wähle einen Abschnitt aus oder füge einen neuen hinzu</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export { sectionTemplates }
