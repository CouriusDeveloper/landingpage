import { useCallback, useState } from 'react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (color: string) => void
  presets?: string[]
}

const defaultPresets = [
  '#0F172A', // Slate 900
  '#1E40AF', // Blue 800
  '#059669', // Emerald 600
  '#DC2626', // Red 600
  '#7C3AED', // Violet 600
  '#EA580C', // Orange 600
  '#0891B2', // Cyan 600
  '#DB2777', // Pink 600
]

export function ColorPicker({ label, value, onChange, presets = defaultPresets }: ColorPickerProps) {
  const [showPresets, setShowPresets] = useState(false)

  const handlePresetClick = useCallback(
    (color: string) => {
      onChange(color)
      setShowPresets(false)
    },
    [onChange],
  )

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-primary">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-200 transition-colors hover:border-accent"
          style={{ backgroundColor: value || '#ffffff' }}
          aria-label={`Farbe auswählen: ${value}`}
        >
          {!value && (
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="h-12 w-28 rounded-xl border border-slate-200 px-3 font-mono text-sm uppercase focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-12 cursor-pointer rounded-xl border-0 bg-transparent"
        />
      </div>
      {showPresets && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-white p-3">
          {presets.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => handlePresetClick(color)}
              className={`h-8 w-8 rounded-lg transition-transform hover:scale-110 ${
                value === color ? 'ring-2 ring-accent ring-offset-2' : ''
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Farbe ${color} auswählen`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
