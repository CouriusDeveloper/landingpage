import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section } from '../components/ui/Section'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../context/AuthContext'

export function RegisterPage() {
  const { signUpWithPassword, user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/onboarding', { replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signUpWithPassword(email, password, { name, company })
      navigate('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section title="Starte dein Portal" description="Erstelle dein Konto und beginne den Projekt-Planungsflow.">
      <div className="mx-auto max-w-2xl">
        <Card className="space-y-6">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <Input label="Name" name="name" value={name} onChange={(event) => setName(event.target.value)} required />
            <Input label="Unternehmen" name="company" value={company} onChange={(event) => setCompany(event.target.value)} />
            <Input
              label="E-Mail"
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              label="Passwort"
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && (
              <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="md:col-span-2">
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? 'Bitte warten…' : 'Registrierung starten'}
              </Button>
            </div>
          </form>
          <Button variant="ghost" to="/login" className="w-full">
            Schon registriert? Zum Login
          </Button>
        </Card>
      </div>
    </Section>
  )
}