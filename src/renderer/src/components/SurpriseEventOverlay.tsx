import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import type { EventCard } from '@core/engine/events/deck'

type Phase = 'shuffling' | 'pick' | 'revealed'

const TYPE_COLOR: Record<string, string> = {
  positive: 'var(--color-positive)', negative: 'var(--color-negative)', mixed: 'var(--color-warning)'
}

/** Ritual das 3 cartas de acontecimento surpresa: embaralha → escolhe → flip 3D. */
export function SurpriseEventOverlay(): React.JSX.Element | null {
  const chooseEvent = useGameStore((s) => s.chooseEvent)
  const [cards, setCards] = useState<EventCard[] | null>(null)
  const [phase, setPhase] = useState<Phase>('shuffling')
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    invoke('events:get').then((v) => setCards(v.pending)).catch(() => {})
    const t = setTimeout(() => setPhase('pick'), 1600)
    return () => clearTimeout(t)
  }, [])

  if (!cards || cards.length === 0) return null
  const chosen = picked != null ? cards[picked] : null

  const onPick = (i: number): void => {
    if (phase !== 'pick') return
    setPicked(i)
    setPhase('revealed')
  }
  const onContinue = (): void => { if (picked != null) chooseEvent(picked) }

  return (
    <div className="event-backdrop fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 p-8" style={{ background: 'rgba(6,10,12,0.92)' }}>
      <div className="text-center">
        <div className="section-title" style={{ color: 'var(--color-accent)' }}>Acontecimento Surpresa</div>
        <h2 className="text-2xl font-black">{phase === 'shuffling' ? 'Embaralhando...' : phase === 'pick' ? 'Escolha uma carta' : chosen?.title}</h2>
      </div>

      {phase !== 'revealed' && (
        <div className="flex gap-6">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => onPick(i)}
              className={`${phase === 'shuffling' ? ['shuffle-a', 'shuffle-b', 'shuffle-c'][i] : 'event-card-float'} h-64 w-44 rounded-xl transition hover:scale-105`}
              style={{ background: 'linear-gradient(160deg,#1d2a22,#0e1512)', border: '2px solid var(--color-accent)', boxShadow: 'var(--shadow-glow)' }}
            >
              <div className="flex h-full items-center justify-center text-5xl" style={{ color: 'var(--color-accent)' }}>?</div>
            </button>
          ))}
        </div>
      )}

      {phase === 'revealed' && chosen && (
        <div className="card w-96 p-6 text-center" style={{ border: `2px solid ${TYPE_COLOR[chosen.type]}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: TYPE_COLOR[chosen.type] }}>{chosen.type} · {chosen.rarity}</div>
          <h3 className="mt-2 text-xl font-black">{chosen.title}</h3>
          <p className="mt-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{chosen.narrative}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            {chosen.effects.moraleDelta != null && <Chip>Moral {chosen.effects.moraleDelta > 0 ? '+' : ''}{chosen.effects.moraleDelta}</Chip>}
            {chosen.effects.formDelta != null && <Chip>Forma {chosen.effects.formDelta > 0 ? '+' : ''}{chosen.effects.formDelta}</Chip>}
            {chosen.effects.fatigueDelta != null && <Chip>Fadiga {chosen.effects.fatigueDelta > 0 ? '+' : ''}{chosen.effects.fatigueDelta}</Chip>}
            {chosen.effects.capCredit != null && <Chip>Cap {chosen.effects.capCredit > 0 ? '+' : ''}${(chosen.effects.capCredit / 1e6).toFixed(0)}M</Chip>}
            {chosen.effects.injuryWeeks != null && <Chip>Lesão {chosen.effects.injuryWeeks}sem</Chip>}
            {chosen.effects.cureInjury && <Chip>Cura lesões</Chip>}
            {chosen.effects.potentialDelta != null && <Chip>Potencial +{chosen.effects.potentialDelta}</Chip>}
          </div>
          <button className="btn-neon mt-5 w-full rounded-md py-2.5 font-bold" onClick={onContinue}>Continuar</button>
        </div>
      )}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded-full px-2 py-0.5" style={{ background: 'var(--color-surface-hover)' }}>{children}</span>
}
