type PriceSummaryProps = {
  basePrice: number
  addonTotal: number
}

const formatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function PriceSummary({ basePrice, addonTotal }: PriceSummaryProps) {
  const total = basePrice + addonTotal
  const deposit = total * 0.5

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-6">
      <h3 className="text-lg font-semibold text-primary">Zusammenfassung</h3>
      <div className="mt-4 space-y-2 text-sm text-secondary">
        <div className="flex items-center justify-between">
          <span>Paket</span>
          <span className="font-semibold text-primary">{formatter.format(basePrice)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Add-ons</span>
          <span className="font-semibold text-primary">{formatter.format(addonTotal)}</span>
        </div>
        <div className="border-t border-dashed border-slate-200 pt-3 text-base font-semibold text-primary">
          Gesamt: {formatter.format(total)}
        </div>
      </div>
      <div className="mt-6 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">Anzahlung (50%)</p>
        <p className="mt-2 text-2xl font-semibold">{formatter.format(deposit)}</p>
      </div>
    </div>
  )
}