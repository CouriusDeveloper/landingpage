import { useState } from 'react'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { Textarea } from '../../ui/Textarea'

type Message = {
  id: string
  author: string
  message: string
  timestamp: string
}

const initialMessages: Message[] = [
  { id: '1', author: 'Team', message: 'Wir haben die Sitemap vorbereitet. Feedback erwünscht!', timestamp: 'Heute, 09:12' },
  { id: '2', author: 'Du', message: 'Sieht gut aus, gern weiter so!', timestamp: 'Heute, 10:40' },
]

export function MessageCenter() {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')

  const sendMessage = () => {
    if (!draft.trim()) return
    setMessages((prev) => [
      ...prev,
      { id: String(prev.length + 1), author: 'Du', message: draft.trim(), timestamp: 'Gerade eben' },
    ])
    setDraft('')
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-primary">Projekt-Chat</h3>
      <div className="mt-4 space-y-3">
        {messages.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-xs text-secondary">
              <span className="font-semibold text-primary">{item.author}</span>
              <span>{item.timestamp}</span>
            </div>
            <p className="mt-2 text-sm text-secondary">{item.message}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <Textarea label="Nachricht" name="message" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Button onClick={sendMessage}>Nachricht senden</Button>
      </div>
    </Card>
  )
}