import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { POSITION_LABEL } from '../lib/format'
import type { DraftView, DraftRunResult, ProspectView } from '@shared/ipc/contract'
import type { Position } from '@core/domain/types'

const GRADE_COLOR: Record<string, string> = { 'A+': 'var(--tier-legend-from)', A: 'var(--tier-elite-from)', 'B+': 'var(--tier-gold-from)', B: 'var(--color-gold)', 'C+': 'var(--tier-silver-from)', C: 'var(--color-text-secondary)', D: 'var(--color-text-muted)' }
const range = (r: [number, number]): string => (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`)

export function DraftScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const refreshSnapshot = useGameStore((s) => s.refreshSnapshot)
  const [view, setView] = useState<DraftView | null>(null)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [result, setResult] = useState<DraftRunResult | null>(null)
  const [posFilter, setPosFilter] = useState<string>('ALL')

  useEffect(() => { invoke('draft:getClass').then(setView).catch(() => {}) }, [])
  if (!snapshot || !view) return null

  const scout = (id: string): void => { invoke('draft:scout', { prospectId: id }).then(setView).catch(() => {}) }
  const target = (id: string): void => {
    // atribui ao 1º pick do usuário ainda sem alvo
    const used = new Set(Object.keys(selections).map(Number))
    const slot = view.myPickNumbers.find((n) => !used.has(n))
    if (slot) setSelections((s) => ({ ...s, [slot]: id }))
  }
  const untarget = (pn: number): void => setSelections((s) => { const n = { ...s }; delete n[Number(pn)]; return n })
  const run = (): void => {
    const sel: Record<string, string> = {}
    for (const [k, v] of Object.entries(selections)) sel[k] = v
    invoke('draft:run', { selections: sel }).then((r) => { setResult(r); refreshSnapshot(); invoke('draft:getClass').then(setView) }).catch(() => {})
  }

  const targetedIds = new Set(Object.values(selections))
  const list = view.prospects.filter((p) => !p.drafted && (posFilter === 'ALL' || p.position === posFilter))
  const positions = ['ALL', ...Array.from(new Set(view.prospects.map((p) => p.position)))]

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="section-title">Draft {view.season} — Central de Scouting</div>
        <div className="flex items-center gap-3 text-sm">
          <span><span style={{ color: 'var(--color-text-muted)' }}>Scouting: </span><span className="font-black" style={{ color: 'var(--color-accent)' }}>{view.scoutPoints} pts</span></span>
          <span style={{ color: 'var(--color-text-muted)' }}>Suas picks: {view.myPickNumbers.slice(0, 8).map((n) => `#${n}`).join(' ')}</span>
        </div>
      </div>

      {view.completed && !result && <div className="card mb-3 p-3 text-center text-sm" style={{ color: 'var(--color-positive)' }}>Draft desta janela já foi realizado.</div>}

      {/* alvos escolhidos */}
      {Object.keys(selections).length > 0 && !view.completed && (
        <div className="card mb-3 p-3">
          <div className="section-title mb-2">Alvos ({Object.keys(selections).length})</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(selections).map(([pn, pid]) => {
              const p = view.prospects.find((x) => x.id === pid)
              return (
                <button key={pn} onClick={() => untarget(Number(pn))} className="rounded px-2 py-1 text-xs font-bold" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                  #{pn}: {p ? `${p.position} ${p.lastName}` : pid} ✕
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* filtro + executar */}
      <div className="mb-3 flex items-center gap-2">
        <select className="input-mk !w-auto" value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
          {positions.map((p) => <option key={p} value={p}>{p === 'ALL' ? 'Todas posições' : POSITION_LABEL[p as Position] ?? p}</option>)}
        </select>
        {!view.completed && <button className="btn-neon ml-auto rounded px-5 py-1.5 text-sm font-bold" onClick={run}>▶ Executar Draft Night</button>}
      </div>

      <div className="card p-2">
        <div className="max-h-[62vh] overflow-auto">
          {list.map((p) => <ProspectRow key={p.id} p={p} targeted={targetedIds.has(p.id)} onScout={() => scout(p.id)} onTarget={() => target(p.id)} disabled={view.completed} />)}
        </div>
      </div>

      {result && <DraftResults result={result} onClose={() => setResult(null)} />}
    </div>
  )
}

function ProspectRow({ p, targeted, onScout, onTarget, disabled }: { p: ProspectView; targeted: boolean; onScout: () => void; onTarget: () => void; disabled: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b py-2 last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <span className="inline-flex h-7 w-8 items-center justify-center rounded text-xs font-black" style={{ background: 'var(--color-bg-raised)', color: GRADE_COLOR[p.visibleGrade] ?? 'var(--color-text-secondary)' }}>{p.visibleGrade}</span>
      <div className="min-w-[180px]">
        <div className="text-sm font-semibold">{POSITION_LABEL[p.position as Position] ?? p.position} {p.firstName} {p.lastName}</div>
        <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{p.college} · {p.classYear} · R{p.projectedRound} proj.{p.developmentTrait ? ` · ${p.developmentTrait}` : ''}</div>
      </div>
      <div className="text-center text-xs">
        <div style={{ color: 'var(--color-text-muted)' }}>OVR</div>
        <div className="font-bold">{range(p.revealedOverall)}</div>
      </div>
      <div className="text-center text-xs">
        <div style={{ color: 'var(--color-text-muted)' }}>POT</div>
        <div className="font-bold" style={{ color: 'var(--color-neon)' }}>{range(p.revealedPotential)}</div>
      </div>
      <div className="text-center text-xs">
        <div style={{ color: 'var(--color-text-muted)' }}>Risco</div>
        <div className="font-bold" style={{ color: p.boomBust > 55 ? 'var(--color-negative)' : 'var(--color-text-secondary)' }}>{p.boomBust}</div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{'●'.repeat(p.scoutingLevel)}{'○'.repeat(4 - p.scoutingLevel)}</span>
        <button className="rounded px-2 py-1 text-xs font-bold disabled:opacity-30" style={{ background: 'var(--color-surface-hover)' }} onClick={onScout} disabled={disabled || p.scoutingLevel >= 4}>Escutar</button>
        <button className="rounded px-2 py-1 text-xs font-bold disabled:opacity-30" style={{ background: targeted ? 'var(--color-accent)' : 'var(--color-surface-hover)', color: targeted ? '#1a0f00' : 'var(--color-accent)' }} onClick={onTarget} disabled={disabled || targeted}>{targeted ? 'Alvo ✓' : 'Mirar'}</button>
      </div>
    </div>
  )
}

function DraftResults({ result, onClose }: { result: DraftRunResult; onClose: () => void }): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(6,9,10,0.78)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-accent)', boxShadow: 'var(--shadow-glow)' }}>
        <div className="px-5 py-3" style={{ background: 'var(--grad-hero)' }}><div className="section-title" style={{ color: 'var(--color-accent)' }}>Draft {result.season} — suas escolhas</div></div>
        <div className="p-5">
          {result.myResults.length === 0 && <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Sem picks nesta janela.</div>}
          {result.myResults.map((r) => (
            <div key={r.pickNumber} className="flex items-center justify-between border-b py-2 last:border-0" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm"><span className="font-black" style={{ color: 'var(--color-accent)' }}>#{r.pickNumber}</span> <span style={{ color: 'var(--color-text-muted)' }}>R{r.round}</span> · {POSITION_LABEL[r.position as Position] ?? r.position} {r.name}</span>
              <span className="font-black">{r.overall} OVR</span>
            </div>
          ))}
          <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{result.totalPicks} escolhas na liga inteira.</div>
          <button className="btn-neon mt-4 w-full rounded-md py-2 font-bold" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
