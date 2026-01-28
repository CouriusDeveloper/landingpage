import { useEffect, useState } from 'react'
import { Section } from '../components/ui/Section'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

type Invoice = {
  id: string
  project_id: string
  amount_total: number
  amount_paid: number
  status: string
  created_at: string
  project: { name: string } | null
}

type Payment = {
  id: string
  amount: number
  status: string
  created_at: string
}

export function InvoicesPage() {
  const { user } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Record<string, Payment[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        // Load invoices with project name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoiceData, error: invoiceError } = await (supabase as any)
          .from('invoices')
          .select(`
            id,
            project_id,
            amount_total,
            amount_paid,
            status,
            created_at,
            project:projects(name)
          `)
          .order('created_at', { ascending: false })

        if (invoiceError) throw invoiceError

        // Filter to user's projects (RLS should handle this, but double-check)
        const userInvoices = (invoiceData ?? []) as Invoice[]
        setInvoices(userInvoices)

        // Load payments for each invoice
        const paymentMap: Record<string, Payment[]> = {}
        for (const inv of userInvoices) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: paymentData } = await (supabase as any)
            .from('payments')
            .select('id, amount, status, created_at')
            .eq('invoice_id', inv.id)
            .order('created_at', { ascending: false })
          paymentMap[inv.id] = paymentData ?? []
        }
        setPayments(paymentMap)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rechnungen konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [user])

  const handlePayRemaining = async (invoiceId: string) => {
    if (!supabase || !user) return

    setPayingInvoiceId(invoiceId)
    setError(null)

    try {
      const { data: session } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-final-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({
            invoiceId,
            successUrl: `${window.location.origin}/portal/rechnungen?payment=success`,
            cancelUrl: `${window.location.origin}/portal/rechnungen?payment=cancelled`,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Zahlung konnte nicht gestartet werden')
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zahlung fehlgeschlagen')
    } finally {
      setPayingInvoiceId(null)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Offen',
      partial: 'Teilweise bezahlt',
      paid: 'Bezahlt',
      overdue: 'Überfällig',
    }
    return labels[status] ?? status
  }

  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
    }
    return colors[status] ?? 'bg-gray-100 text-gray-800'
  }

  return (
    <Section title="Rechnungen" description="Übersicht über Anzahlungen und Restzahlungen.">
      {loading && <p className="text-center text-secondary">Rechnungen werden geladen…</p>}
      {error && <p className="text-center text-red-600">{error}</p>}
      
      {!loading && invoices.length === 0 && !error && (
        <Card>
          <p className="text-center text-secondary">Noch keine Rechnungen vorhanden.</p>
          <Button to="/onboarding" className="mx-auto mt-4">
            Projekt starten
          </Button>
        </Card>
      )}

      <div className="space-y-6">
        {invoices.map((invoice) => {
          const remaining = invoice.amount_total - invoice.amount_paid
          const invoicePayments = payments[invoice.id] ?? []

          return (
            <Card key={invoice.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                    {invoice.project?.name ?? 'Projekt'}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-primary">
                    {formatCurrency(invoice.amount_total)}
                  </h3>
                  <p className="mt-1 text-sm text-secondary">
                    Erstellt am {formatDate(invoice.created_at)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(invoice.status)}`}>
                  {statusLabel(invoice.status)}
                </span>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Bezahlt</span>
                  <span className="font-medium text-primary">{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-secondary">Offen</span>
                  <span className="font-medium text-primary">{formatCurrency(remaining)}</span>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${(invoice.amount_paid / invoice.amount_total) * 100}%` }}
                  />
                </div>
              </div>

              {invoicePayments.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
                    Zahlungshistorie
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {invoicePayments.map((p) => (
                      <li key={p.id} className="flex justify-between text-secondary">
                        <span>{formatDate(p.created_at)}</span>
                        <span className="font-medium text-primary">{formatCurrency(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {invoice.status !== 'paid' && remaining > 0 && (
                <Button 
                  className="mt-4 w-full" 
                  onClick={() => handlePayRemaining(invoice.id)}
                  disabled={payingInvoiceId === invoice.id}
                >
                  {payingInvoiceId === invoice.id 
                    ? 'Wird vorbereitet…' 
                    : `${formatCurrency(remaining)} bezahlen`}
                </Button>
              )}
            </Card>
          )
        })}
      </div>
    </Section>
  )
}