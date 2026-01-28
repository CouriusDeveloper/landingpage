import { useCallback, useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'

export interface PageDefinition {
  id: string
  name: string
  slug: string
}

const defaultPages: PageDefinition[] = [
  { id: 'home', name: 'Startseite', slug: '/' },
  { id: 'about', name: 'Über uns', slug: 'about' },
  { id: 'services', name: 'Leistungen', slug: 'services' },
  { id: 'contact', name: 'Kontakt', slug: 'contact' },
]

interface PageBuilderProps {
  pages: PageDefinition[]
  onChange: (pages: PageDefinition[]) => void
  maxPages?: number
}

export function PageBuilder({ pages, onChange, maxPages = 10 }: PageBuilderProps) {
  const [newPageName, setNewPageName] = useState('')

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c] ?? c)
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const addPage = useCallback(() => {
    if (!newPageName.trim() || pages.length >= maxPages) return

    const newPage: PageDefinition = {
      id: `page-${Date.now()}`,
      name: newPageName.trim(),
      slug: generateSlug(newPageName),
    }

    onChange([...pages, newPage])
    setNewPageName('')
  }, [newPageName, pages, maxPages, onChange])

  const removePage = useCallback(
    (id: string) => {
      onChange(pages.filter((p) => p.id !== id))
    },
    [pages, onChange],
  )

  const updatePage = useCallback(
    (id: string, updates: Partial<PageDefinition>) => {
      onChange(pages.map((p) => (p.id === id ? { ...p, ...updates } : p)))
    },
    [pages, onChange],
  )

  const moveUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const newPages = [...pages]
      ;[newPages[index - 1], newPages[index]] = [newPages[index], newPages[index - 1]]
      onChange(newPages)
    },
    [pages, onChange],
  )

  const moveDown = useCallback(
    (index: number) => {
      if (index === pages.length - 1) return
      const newPages = [...pages]
      ;[newPages[index], newPages[index + 1]] = [newPages[index + 1], newPages[index]]
      onChange(newPages)
    },
    [pages, onChange],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-primary">
          Unterseiten ({pages.length}/{maxPages})
        </label>
      </div>

      <div className="space-y-2">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-3"
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                className="text-slate-400 hover:text-primary disabled:opacity-30"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveDown(index)}
                disabled={index === pages.length - 1}
                className="text-slate-400 hover:text-primary disabled:opacity-30"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <input
                type="text"
                value={page.name}
                onChange={(e) => updatePage(page.id, { name: e.target.value })}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
                placeholder="Seitenname"
              />
              <div className="flex items-center gap-1 text-xs text-secondary">
                <span>/</span>
                <input
                  type="text"
                  value={page.slug}
                  onChange={(e) => updatePage(page.id, { slug: generateSlug(e.target.value) })}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
                  placeholder="slug"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => removePage(page.id)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {pages.length < maxPages && (
        <div className="flex gap-2">
          <Input
            label=""
            name="newPage"
            value={newPageName}
            onChange={(e) => setNewPageName(e.target.value)}
            placeholder="Neue Seite hinzufügen…"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPage())}
          />
          <Button type="button" onClick={addPage} disabled={!newPageName.trim()}>
            Hinzufügen
          </Button>
        </div>
      )}

      <p className="text-xs text-secondary">
        Tipp: Die Reihenfolge bestimmt die Navigation. Die erste Seite wird zur Startseite.
      </p>
    </div>
  )
}

// Export default pages for initial state
export { defaultPages }
