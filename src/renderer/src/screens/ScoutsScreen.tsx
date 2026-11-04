import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { tierOf, POSITION_LABEL, cardStats } from '../lib/format'
import type { ScoutView } from '@shared/ipc/contract'
import { POSITIONS } from '@shared/schemas/world'

export function ScoutsScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const [position, setPosition] = useState<string>('')
  const [minOverall, setMinOverall] = useState<number>(75)
  const [view, setView] = useState<ScoutView | null>(null)

  const search = (): void => {
    invoke('scout:search', { position: position || undefined, minOverall }).then(setView).catch(() => {})
  }
  useEffect(() => { search() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!snapshot) return null

  return (
    <div className="mx-auto max-w-4xl">
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="section-title">Posição</label>
          <select className="input-mk mt-1 !w-auto" value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">Todas</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="section-title">Overall mínimo: {minOverall}</label>
          <input type="range" min={40} max={99} value={minOverall} onChange={(e) => setMinOverall(Number(e.target.value))} className="mt-2 block w-48" />
        </div>
        <button className="btn-neon rounded-md px-5 py-2 font-bold" onClick={search}>Buscar</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              <th className="px-3 py-2 text-left">OVR</th><th className="text-left">POT</th><th className="text-left">POS</th>
              <th className="text-left">Jogador</th><th className="text-left">Time</th><th className="text-center">Idade</th><th className="text-left">Destaques</th>
            </tr>
          </thead>
          <tbody>
            {view?.players.map((p) => (
              <tr key={p.id} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-3 py-1.5"><span data-tier={tierOf(p.overall)} className="inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-black text-white" style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))' }}>{p.overall}</span></td>
                <td style={{ color: p.potential > p.overall ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>{p.potential}</td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{POSITION_LABEL[p.position]}</td>
                <td className="font-semibold">{p.firstName} {p.lastName} {p.traits.length > 0 && <span style={{ color: 'var(--color-accent)' }}>★</span>}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{p.teamAbbr}</td>
                <td className="text-center" style={{ color: 'var(--color-text-muted)' }}>{p.age}</td>
                <td className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{cardStats(p.position, p.attributes as unknown as Record<string, number>).map((s) => `${s.label} ${s.value}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Use as Trocas no Mercado para adquirir alvos scoutados.</p>
    </div>
  )
}
