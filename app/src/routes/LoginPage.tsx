import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Section } from '../components/ui/Section'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'

export function LoginPage() {
  const { signInWithPassword, signInWithOAuth, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const redirectTarget = (location.state as { from?: string } | null)?.from ?? '/portal'

  useEffect(() => {
    if (user) {
      navigate(redirectTarget, { replace: true })
    }
  }, [user, navigate, redirectTarget])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signInWithPassword(email, password)
      navigate(redirectTarget)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section title="Willkommen zurück" description="Logge dich ein, um dein Projekt zu steuern.">
      <div className="mx-auto max-w-xl">
        <Card className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="E-Mail" type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <Input label="Passwort" type="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Bitte warten…' : 'Login'}
            </Button>
          </form>
          <div className="flex flex-col gap-3 text-sm text-secondary">
            <Button
              variant="secondary"
              onClick={() => {
                setError(null)
                void signInWithOAuth('google').catch((err) => {
                  setError(err instanceof Error ? err.message : 'Google Login fehlgeschlagen.')
                })
              }}
              className="w-full"
            >
              Mit Google fortfahren
            </Button>
            <Button variant="ghost" to="/register" className="w-full">
              Noch kein Konto? Jetzt registrieren
            </Button>
          </div>
        </Card>
      </div>
    </Section>
  )
}