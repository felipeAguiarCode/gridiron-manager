import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { tierOf, POSITION_LABEL } from '../lib/format'
import { computeOverall } from '@core/domain/positions'
import type { Player, Attributes, TraitId } from '@core/domain/types'

const ATTR_GROUPS: { label: string; keys: (keyof Attributes)[] }[] = [
  { label: 'Físico', keys: ['spd', 'acc', 'agi', 'str', 'awr', 'sta'] },
  { label: 'Passe', keys: ['thp', 'tha', 'tup'] },
  { label: 'Corrida/Recepção', keys: ['car', 'bcv', 'trk', 'cth', 'rte', 'rac'] },
  { label: 'Bloqueio/Defesa', keys: ['rbk', 'pbk', 'tak', 'prsh', 'bsh', 'cov', 'zcv', 'prc'] },
  { label: 'Chute', keys: ['kpw', 'kac'] }
]
const TRAITS: TraitId[] = ['cannon_arm', 'deep_threat', 'elusive', 'bruiser', 'sure_hands', 'brick_wall', 'sack_artist', 'ball_hawk', 'iron_man', 'fumble_prone', 'ice_veins', 'field_general']

export function EditorScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const [roster, setRoster] = useState<Player[]>([])
  const [sel, setSel] = useState<Player | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (snapshot) invoke('roster:get', { teamId: snapshot.save.teamId }).then((r) => { setRoster(r.players); setSel(r.players[0] ?? null) })
  }, [snapshot])

  if (!snapshot || !sel) return null
  const liveOverall = computeOverall(sel)

  const patch = (p: Partial<Player>): void => { setSel({ ...sel, ...p }); setSaved(false) }
  const setAttr = (k: keyof Attributes, v: number): void => { patch({ attributes: { ...sel.attributes, [k]: v } }) }
  const toggleTrait = (t: TraitId): void => patch({ traits: sel.traits.includes(t) ? sel.traits.filter((x) => x !== t) : [...sel.traits, t] })
  const save = async (): Promise<void> => {
    const r = await invoke('editor:updatePlayer', { playerId: sel.id, firstName: sel.firstName, lastName: sel.lastName, jerseyNumber: sel.jerseyNumber, potential: sel.potential, age: sel.age, traits: sel.traits, attributes: sel.attributes })
    setRoster((rs) => rs.map((p) => (p.id === r.player.id ? r.player : p)))
    setSel(r.player)
    setSaved(true)
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      <div className="card max-h-[80vh] overflow-auto p-2">
        <div className="section-title mb-2 px-2">Elenco (modo-deus)</div>
        {roster.map((p) => (
          <button key={p.id} onClick={() => { setSel(p); setSaved(false) }} className="flex w-full items-center gap-2 rounded p-1.5 text-left text-sm" style={{ background: sel.id === p.id ? 'var(--color-surface-hover)' : undefined }}>
            <span data-tier={tierOf(p.overall)} className="inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-black text-white" style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))' }}>{p.overall}</span>
            <span className="truncate">{POSITION_LABEL[p.position]} {p.lastName}</span>
          </button>
        ))}
      </div>

      <div className="card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span data-tier={tierOf(liveOverall)} className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-lg font-black text-white" style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))' }}>{liveOverall}</span>
            <div>
              <input className="input-mk !w-auto text-lg font-bold" value={`${sel.firstName} ${sel.lastName}`} onChange={(e) => { const [f, ...l] = e.target.value.split(' '); patch({ firstName: f, lastName: l.join(' ') }) }} />
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{POSITION_LABEL[sel.position]} · overall recalcula ao vivo</div>
            </div>
          </div>
          <button className="btn-neon rounded-md px-5 py-2 font-bold" onClick={save}>{saved ? '✓ Salvo' : 'Salvar'}</button>
        </div>

        <div className="mb-4 flex flex-wrap gap-4">
          <NumField label="Camisa" value={sel.jerseyNumber} min={0} max={99} onChange={(v) => patch({ jerseyNumber: v })} />
          <NumField label="Idade" value={sel.age} min={18} max={45} onChange={(v) => patch({ age: v })} />
          <NumField label="Potencial" value={sel.potential} min={liveOverall} max={99} onChange={(v) => patch({ potential: v })} />
        </div>

        {ATTR_GROUPS.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="section-title mb-1">{g.label}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.keys.map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-8 uppercase" style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                  <input type="range" min={20} max={99} value={sel.attributes[k]} onChange={(e) => setAttr(k, Number(e.target.value))} className="flex-1" />
                  <span className="w-6 text-right font-bold">{sel.attributes[k]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="section-title mb-1 mt-3">Traits</div>
        <div className="flex flex-wrap gap-2">
          {TRAITS.map((t) => (
            <button key={t} onClick={() => toggleTrait(t)} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: sel.traits.includes(t) ? 'var(--color-accent)' : 'var(--color-surface)', color: sel.traits.includes(t) ? '#1a0f00' : 'var(--color-text-secondary)' }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NumField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }): React.JSX.Element {
  return (
    <label className="text-xs">
      <div className="section-title mb-1">{label}</div>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))} className="input-mk !w-20" />
    </label>
  )
}
