import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { tierOf, POSITION_LABEL, cardStats } from '../lib/format'
import { unitOf } from '@core/domain/types'
import type { Player, Unit, OffenseSchemeId, DefenseSchemeId } from '@core/domain/types'
import type { DepthChartView } from '@shared/ipc/contract'
import { GridironField, formationFor } from '../components/GridironField'

type Tab = 'roster' | 'depth' | 'field'
const TAB_LABEL: Record<Tab, string> = { roster: 'Atletas', depth: 'Depth Chart', field: 'Campo 3D' }
type SortKey = 'overall' | 'position' | 'age' | 'capHit'

const OFFENSE_SCHEMES: OffenseSchemeId[] = ['air_raid', 'west_coast', 'spread_option', 'power_run', 'vertical', 'pistol_rpo', 'smashmouth']
const DEFENSE_SCHEMES: DefenseSchemeId[] = ['4-3', '3-4', 'nickel', 'dime', 'tampa_2', '46_blitz']

export function RosterScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const roster = useGameStore((s) => s.roster)
  const loadRoster = useGameStore((s) => s.loadRoster)
  const [tab, setTab] = useState<Tab>('roster')
  const [sortKey, setSortKey] = useState<SortKey>('overall')

  useEffect(() => {
    if (snapshot) loadRoster(snapshot.save.teamId)
  }, [snapshot, loadRoster])

  if (!snapshot || !roster) return null

  const sorted = [...roster.players].sort((a, b) => {
    if (sortKey === 'overall') return b.overall - a.overall
    if (sortKey === 'age') return a.age - b.age
    if (sortKey === 'capHit') return b.capHit - a.capHit
    return a.position.localeCompare(b.position) || b.overall - a.overall
  })
  const money = (n: number): string => `$${(n / 1_000_000).toFixed(1)}M`

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2">
          {(['roster', 'depth', 'field'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="rounded-md px-4 py-1.5 text-sm font-bold"
              style={{ background: tab === t ? 'var(--color-accent)' : 'var(--color-surface)', color: tab === t ? '#1a0f00' : 'var(--color-text-secondary)' }}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {tab === 'roster' && (
          <div className="flex gap-1 text-xs">
            {(['overall', 'position', 'age', 'capHit'] as SortKey[]).map((k) => (
              <button key={k} onClick={() => setSortKey(k)} className="rounded px-2 py-1 font-semibold"
                style={{ background: sortKey === k ? 'var(--color-accent)' : 'var(--color-surface)', color: sortKey === k ? '#1a0f00' : 'var(--color-text-secondary)' }}>
                {k === 'overall' ? 'OVR' : k === 'position' ? 'POS' : k === 'age' ? 'Idade' : 'Cap'}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'roster' ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                <th className="px-3 py-2 text-left">OVR</th><th className="text-left">POS</th><th className="text-left">#</th>
                <th className="text-left">Jogador</th><th className="text-center">Idade</th><th className="text-left">Destaques</th><th className="text-right">Cap</th>
              </tr>
            </thead>
            <tbody>{sorted.map((p) => <PlayerRow key={p.id} p={p} money={money} />)}</tbody>
          </table>
        </div>
      ) : tab === 'depth' ? (
        <DepthChartEditor teamName={`${roster.team.name} ${roster.team.nickname}`} />
      ) : (
        <FieldFormation teamName={`${roster.team.name} ${roster.team.nickname}`} />
      )}
    </div>
  )
}

function PlayerRow({ p, money }: { p: Player; money: (n: number) => string }): React.JSX.Element {
  const tier = tierOf(p.overall)
  const stats = cardStats(p.position, p.attributes as unknown as Record<string, number>)
  return (
    <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
      <td className="px-3 py-1.5">
        <span data-tier={tier} className="inline-flex h-7 w-7 items-center justify-center rounded font-black text-white" style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))', fontSize: 12 }}>{p.overall}</span>
      </td>
      <td className="text-[color:var(--color-text-secondary)]">{POSITION_LABEL[p.position]}</td>
      <td style={{ color: 'var(--color-text-muted)' }}>{p.jerseyNumber}</td>
      <td className="font-semibold">{p.firstName} {p.lastName} {p.traits.length > 0 && <span title={p.traits.join(', ')} style={{ color: 'var(--color-accent)' }}>★</span>}</td>
      <td className="text-center" style={{ color: 'var(--color-text-muted)' }}>{p.age}</td>
      <td className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{stats.map((s) => `${s.label} ${s.value}`).join(' · ')}</td>
      <td className="text-right" style={{ color: 'var(--color-text-muted)' }}>{money(p.capHit)}</td>
    </tr>
  )
}

// --------------------------------------------------- Depth Chart + scheme

function DepthChartEditor({ teamName }: { teamName: string }): React.JSX.Element {
  const [dc, setDc] = useState<DepthChartView | null>(null)
  const [unit, setUnit] = useState<Unit>('offense')

  useEffect(() => { invoke('tactics:getDepthChart').then(setDc).catch(() => {}) }, [])
  if (!dc) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando...</div>

  const byId = new Map(dc.players.map((p) => [p.id, p]))
  const starterIds = dc.depth[unit]
  const starters = starterIds.map((id) => byId.get(id)).filter((p): p is Player => !!p)
  const reserves = dc.players.filter((p) => unitOf(p.position) === unit && !starterIds.includes(p.id))

  const setScheme = async (offense: OffenseSchemeId, defense: DefenseSchemeId): Promise<void> => {
    const scheme = await invoke('tactics:setScheme', { offense, defense })
    setDc({ ...dc, scheme })
  }
  const swapInto = async (slotIndex: number, incomingId: string): Promise<void> => {
    if (starterIds[slotIndex] === incomingId) return
    const next = [...starterIds]
    const existingPos = next.indexOf(incomingId)
    if (existingPos >= 0) { // troca entre titulares
      ;[next[slotIndex], next[existingPos]] = [next[existingPos], next[slotIndex]]
    } else { // reserva entra no lugar do titular
      next[slotIndex] = incomingId
    }
    const updated = await invoke('tactics:setDepthChart', { unit, orderedIds: next })
    setDc(updated)
  }

  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-center gap-4 p-4">
        <div className="text-sm font-bold">{teamName}</div>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Ataque
          <select className="input-mk !w-auto" value={dc.scheme.offense} onChange={(e) => setScheme(e.target.value as OffenseSchemeId, dc.scheme.defense)}>
            {OFFENSE_SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Defesa
          <select className="input-mk !w-auto" value={dc.scheme.defense} onChange={(e) => setScheme(dc.scheme.offense, e.target.value as DefenseSchemeId)}>
            {DEFENSE_SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="mb-3 flex gap-2">
        {(['offense', 'defense', 'special'] as Unit[]).map((u) => (
          <button key={u} onClick={() => setUnit(u)} className="rounded-md px-3 py-1.5 text-sm font-bold"
            style={{ background: unit === u ? 'var(--color-accent)' : 'var(--color-surface)', color: unit === u ? '#1a0f00' : 'var(--color-text-secondary)' }}>
            {u === 'offense' ? 'Ataque' : u === 'defense' ? 'Defesa' : 'Special'}
          </button>
        ))}
      </div>

      <div className="card mb-3 p-4">
        <div className="section-title mb-3">Titulares ({starters.length})</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {starters.map((p, i) => (
            <div key={p.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/id'); if (id) swapInto(i, id) }}
              draggable onDragStart={(e) => e.dataTransfer.setData('text/id', p.id)}
              className="card flex cursor-grab items-center gap-2 p-2" style={{ background: 'var(--color-bg-raised)' }}>
              <TierBadge overall={p.overall} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{p.firstName} {p.lastName}</div>
                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>#{p.jerseyNumber}</div>
              </div>
              <PositionChip position={p.position} />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="section-title mb-3">Reservas — arraste para um titular</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {reserves.map((p) => (
            <div key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/id', p.id)}
              className="flex cursor-grab items-center gap-1.5 rounded-md p-1.5 text-xs" style={{ background: 'var(--color-surface)' }}>
              <TierBadge overall={p.overall} sm />
              <span className="min-w-0 flex-1 truncate">{p.firstName} {p.lastName}</span>
              <PositionChip position={p.position} sm />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------- Campo 3D (Mode 7)

const FIELD_UNITS: { key: Unit; label: string }[] = [
  { key: 'offense', label: 'Ataque' },
  { key: 'defense', label: 'Defesa' },
  { key: 'special', label: 'Special Teams' }
]

function FieldFormation({ teamName }: { teamName: string }): React.JSX.Element {
  const [dc, setDc] = useState<DepthChartView | null>(null)
  const [unitIdx, setUnitIdx] = useState(0)

  useEffect(() => { invoke('tactics:getDepthChart').then(setDc).catch(() => {}) }, [])
  if (!dc) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando...</div>

  const unit = FIELD_UNITS[unitIdx]
  const byId = new Map(dc.players.map((p) => [p.id, p]))
  const starters = dc.depth[unit.key].map((id) => byId.get(id)).filter((p): p is Player => !!p)
  const placements = formationFor(unit.key, starters)
  const avgOvr = starters.length ? Math.round(starters.reduce((a, p) => a + p.overall, 0) / starters.length) : 0
  const go = (dir: number): void => setUnitIdx((i) => (i + dir + FIELD_UNITS.length) % FIELD_UNITS.length)

  return (
    <div>
      <div className="card mb-3 flex items-center justify-between gap-3 p-3">
        <button onClick={() => go(-1)} title="Unidade anterior"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-black transition hover:brightness-125"
          style={{ background: 'var(--color-surface-hover)', color: 'var(--color-accent)' }}>‹</button>
        <div className="text-center">
          <div className="text-lg font-black" style={{ color: 'var(--color-accent)' }}>{unit.label}</div>
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{teamName} · OVR {avgOvr} · {starters.length} titulares</div>
        </div>
        <button onClick={() => go(1)} title="Próxima unidade"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-black transition hover:brightness-125"
          style={{ background: 'var(--color-surface-hover)', color: 'var(--color-accent)' }}>›</button>
      </div>

      <GridironField placements={placements} />

      <div className="mt-3 flex justify-center gap-2">
        {FIELD_UNITS.map((u, i) => (
          <button key={u.key} onClick={() => setUnitIdx(i)} title={u.label} aria-label={u.label}
            className="h-2.5 w-2.5 rounded-full transition"
            style={{ background: i === unitIdx ? 'var(--color-accent)' : 'var(--color-border)' }} />
        ))}
      </div>
    </div>
  )
}

function PositionChip({ position, sm }: { position: Player['position']; sm?: boolean }): React.JSX.Element {
  return (
    <span className="shrink-0 rounded font-bold" style={{
      background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)',
      padding: sm ? '1px 5px' : '2px 7px', fontSize: sm ? 9 : 10
    }}>
      {POSITION_LABEL[position]}
    </span>
  )
}

function TierBadge({ overall, sm }: { overall: number; sm?: boolean }): React.JSX.Element {
  return (
    <span data-tier={tierOf(overall)} className="inline-flex items-center justify-center rounded font-black text-white"
      style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))', width: sm ? 22 : 28, height: sm ? 22 : 28, fontSize: sm ? 10 : 12 }}>
      {overall}
    </span>
  )
}
