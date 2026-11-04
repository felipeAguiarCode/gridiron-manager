import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { POSITION_LABEL } from '../lib/format'
import type { PreseasonView } from '@shared/ipc/contract'
import type { Position, TrainingCampFocus } from '@core/domain/types'

const FOCI: { id: TrainingCampFocus; label: string; desc: string }[] = [
  { id: 'rookie_development', label: 'Desenvolvimento de Rookies', desc: 'Rookies ganham forma/overall' },
  { id: 'conditioning', label: 'Condicionamento', desc: 'Zera fadiga, sobe forma geral' },
  { id: 'scheme_installation', label: 'Instalação de Scheme', desc: 'Ganho pequeno geral' },
  { id: 'playbook_installation', label: 'Instalação de Playbook', desc: '+Familiaridade com o playbook' },
  { id: 'qb_timing', label: 'Timing de Passe', desc: 'QB / WR / TE' },
  { id: 'ol_cohesion', label: 'Coesão da O-Line', desc: 'Linha ofensiva' },
  { id: 'pass_rush', label: 'Pass Rush', desc: 'DL / OLB' },
  { id: 'secondary_communication', label: 'Comunicação do Secundário', desc: 'CB / S' },
  { id: 'special_teams', label: 'Times Especiais', desc: 'K / P / LS' }
]

export function PreseasonScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const refreshSnapshot = useGameStore((s) => s.refreshSnapshot)
  const [view, setView] = useState<PreseasonView | null>(null)

  useEffect(() => { invoke('preseason:get').then(setView).catch(() => {}) }, [])
  if (!snapshot || !view) return null

  const setFocus = (focus: TrainingCampFocus): void => { invoke('preseason:setFocus', { focus }).then(setView).catch(() => {}) }
  const runCamp = (): void => { invoke('preseason:runCamp').then((v) => { setView(v); refreshSnapshot() }).catch(() => {}) }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="section-title mb-3">Pré-Temporada — Training Camp</div>

      <div className="card mb-4 p-4">
        <div className="mb-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Escolha o foco do camp e rode uma sessão (uma por pré-temporada).</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FOCI.map((f) => (
            <button key={f.id} onClick={() => setFocus(f.id)} disabled={view.campDone}
              className="card p-3 text-left transition hover:brightness-110 disabled:opacity-50"
              style={view.focus === f.id ? { outline: '2px solid var(--color-accent)' } : undefined}>
              <div className="text-sm font-bold">{f.label}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{f.desc}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-neon rounded-md px-6 py-2 font-bold disabled:opacity-40" disabled={view.campDone} onClick={runCamp}>
            {view.campDone ? 'Camp realizado ✓' : '▶ Rodar Training Camp'}
          </button>
          {view.summary && <span className="text-sm" style={{ color: 'var(--color-positive)' }}>{view.summary}</span>}
        </div>
      </div>

      <div className="card p-4">
        <div className="section-title mb-2">Disputas de Posição ({view.battles.length})</div>
        {view.battles.length === 0 && <div className="py-3 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Sem disputas abertas — titulares definidos.</div>}
        <div className="flex flex-col gap-3">
          {view.battles.map((b) => (
            <div key={b.position}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold">{POSITION_LABEL[b.position as Position] ?? b.position}</span>
                <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>intensidade {Math.round(b.intensity)}</span>
              </div>
              {b.contenders.map((c, i) => (
                <div key={c.playerId} className="flex items-center justify-between border-b py-1 text-sm last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="flex items-center gap-2">
                    {c.playerId === b.leaderId && <span className="rounded px-1.5 py-0.5 text-[9px] font-black" style={{ background: 'var(--color-accent)', color: '#1a0f00' }}>TITULAR</span>}
                    <span style={{ color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{c.name}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span>{c.overall} OVR</span>
                    <span className="font-bold" style={{ color: 'var(--color-accent)' }}>{c.score}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
