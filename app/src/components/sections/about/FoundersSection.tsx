import { founders } from '../../../content/site'
import { Card } from '../../ui/Card'

export function FoundersSection() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {founders.map((founder) => (
        <Card key={founder.name}>
          <p className="text-sm font-semibold text-accent">{founder.role}</p>
          <h3 className="mt-2 text-2xl font-semibold text-primary">{founder.name}</h3>
          <p className="mt-4 text-secondary">{founder.bio}</p>
        </Card>
      ))}
    </div>
  )
}
