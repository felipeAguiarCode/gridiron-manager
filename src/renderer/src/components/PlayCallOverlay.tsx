import { useEffect, useMemo, useState } from 'react'
import type { PreSnapDecisionView } from '@shared/ipc/contract'
import type { PlaybookPlay, PlayCallRecommendation, PlayCategory, GameControlMode } from '@core/domain/playbook'
import { useGameStore } from '../stores/gameStore'
import { PlayDiagram } from './PlayDiagram'
import { PlayTile } from './PlayTile'

const CATEGORY_TABS: { key: string; label: string; match: (p: PlaybookPlay) => boolean }[] = [
  { key: 'recommended', label: 'Recomendadas', match: () => true },
  { key: 'run', label: 'Corrida', match: (p) => p.category === 'run' || p.category === 'short_yardage' },
  { key: 'pass', label: 'Passe', match: (p) => p.category === 'pass' },
  { key: 'play_action', label: 'Play Action', match: (p) => p.category === 'play_action' },
  { key: 'screen', label: 'Screen/RPO', match: (p) => p.category === 'screen' || p.category === 'rpo' || p.category === 'option' },
  { key: 'situational', label: 'Situacional', match: (p) => (['red_zone', 'goal_line', 'two_minute', 'fourth_down'] as PlayCategory[]).includes(p.category) },
  { key: 'trick', label: 'Trick', match: (p) => p.category === 'trick' }
]

const RISK_COLOR: Record<PlayCallRecommendation['riskLabel'], string> = {
  safe: 'var(--color-positive)',
  balanced: 'var(--color-accent)',
  aggressive: 'var(--color-warning)',
  desperate: 'var(--color-negative)'
}

const CONTROL_MODES: { id: GameControlMode; label: string }[] = [
  { id: 'simulation_only', label: 'Simulação' },
  { id: 'key_moments', label: 'Momentos-Chave' },
  { id: 'full_coach_control', label: 'Controle Total' }
]

function PlayCard({ play, rec, onChoose }: { play: PlaybookPlay; rec?: PlayCallRecommendation; onChoose: () => void }): React.JSX.Element {
  return (
    <PlayTile
      play={play}
      animate
      onClick={onChoose}
      state={rec ? 'recommended' : 'default'}
      badge={rec && <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: RISK_COLOR[rec.riskLabel], color: '#0c0f10' }}>{rec.riskLabel}</span>}
      footer={rec && <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>OC: {rec.reason}</div>}
    />
  )
}

/**
 * Carrossel de jogadas em UMA linha, 3 por vez, com peek do anterior/próximo e
 * loop infinito (estilo Netflix). Cada slide ocupa 30% → 3 cheios + ~5% de peek de cada lado.
 */
function PlaySlider({ plays, recById, onChoose }: { plays: PlaybookPlay[]; recById: Map<string, PlayCallRecommendation>; onChoose: (id: string) => void }): React.JSX.Element {
  const n = plays.length
  const SLIDE = 30 // % da largura por slide
  const OFFSET = (100 - 3 * SLIDE) / 2 // centraliza o trio, peek simétrico
  const [pos, setPos] = useState(n) // começa na cópia do meio
  const [anim, setAnim] = useState(true)

  // re-centraliza quando o número de jogadas muda (troca de aba)
  useEffect(() => { setAnim(false); setPos(n) }, [n])
  // reabilita a animação no frame seguinte a um "teleporte" sem transição
  useEffect(() => {
    if (anim) return
    const id = requestAnimationFrame(() => setAnim(true))
    return () => cancelAnimationFrame(id)
  }, [anim])

  if (n === 0) return <div className="p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhuma jogada nesta categoria.</div>

  const list = [...plays, ...plays, ...plays]
  const translate = -pos * SLIDE + OFFSET

  const step = (d: number): void => { setAnim(true); setPos((p) => p + d) }
  const onEnd = (): void => {
    if (pos >= 2 * n) { setAnim(false); setPos(pos - n) }
    else if (pos < n) { setAnim(false); setPos(pos + n) }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className="h-full w-full overflow-hidden">
        <div
          className="flex h-full"
          style={{ transform: `translateX(${translate}%)`, transition: anim ? 'transform 0.4s cubic-bezier(0.22,0.61,0.36,1)' : 'none' }}
          onTransitionEnd={onEnd}
        >
          {list.map((p, i) => (
            <div key={i} className="shrink-0 px-1.5" style={{ width: `${SLIDE}%` }}>
              <PlayCard play={p} rec={recById.get(p.id)} onChoose={() => onChoose(p.id)} />
            </div>
          ))}
        </div>
      </div>
      {/* setas de navegação */}
      <button
        onClick={() => step(-1)}
        aria-label="Anterior"
        className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-x-1 -translate-y-1/2 items-center justify-center rounded-full text-lg font-black text-white shadow-lg transition-transform hover:scale-110"
        style={{ background: 'rgba(10,14,15,0.85)', border: '1px solid var(--color-border)' }}
      >
        ‹
      </button>
      <button
        onClick={() => step(1)}
        aria-label="Próxima"
        className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 translate-x-1 items-center justify-center rounded-full text-lg font-black text-white shadow-lg transition-transform hover:scale-110"
        style={{ background: 'rgba(10,14,15,0.85)', border: '1px solid var(--color-border)' }}
      >
        ›
      </button>
    </div>
  )
}

export function PlayCallOverlay({
  decision, offenseAbbr, defenseAbbr, speed, setSpeed, onChoose, onDelegate, onGoForIt
}: {
  decision: PreSnapDecisionView
  offenseAbbr: string
  defenseAbbr: string
  speed: number
  setSpeed: (s: number) => void
  onChoose: (playId: string) => void
  onDelegate: () => void
  onGoForIt: () => void
}): React.JSX.Element {
  const isOffense = decision.kind === 'offense'
  const [tab, setTab] = useState('recommended')
  const recById = useMemo(() => new Map(decision.recommendations.map((r) => [r.playId, r])), [decision.recommendations])
  const controlMode = useGameStore((s) => s.snapshot?.controlMode) ?? 'simulation_only'
  const setControlMode = useGameStore((s) => s.setControlMode)

  const shown = useMemo(() => {
    if (!isOffense) {
      // defesa/special teams: recomendadas primeiro, depois o resto
      const ranked = decision.recommendations.map((r) => decision.available.find((p) => p.id === r.playId)).filter((p): p is PlaybookPlay => !!p)
      const rest = decision.available.filter((p) => !ranked.includes(p))
      return [...ranked, ...rest]
    }
    if (tab === 'recommended') {
      return decision.recommendations.map((r) => decision.available.find((p) => p.id === r.playId)).filter((p): p is PlaybookPlay => !!p)
    }
    const t = CATEGORY_TABS.find((c) => c.key === tab)!
    return decision.available.filter(t.match)
  }, [tab, decision, isOffense])

  const toGoal = 100 - decision.yardline
  const yardLabel = decision.yardline >= 50 ? `Adv ${toGoal}` : `Própria ${decision.yardline}`
  const title = decision.kind === 'defense' ? `Chamada Defensiva · ${defenseAbbr} na defesa vs ${offenseAbbr}`
    : decision.kind === 'special_teams' ? `4ª Descida / Special Teams · ${offenseAbbr}`
    : `Escolha a Jogada · ${offenseAbbr} c/ a bola vs ${defenseAbbr}`

  return (
    <div className="event-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,10,12,0.92)' }}>
      <div className="card flex max-h-[92vh] w-full max-w-4xl flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="section-title" style={{ color: 'var(--color-accent)' }}>{title}</div>
            <div className="mt-1 flex items-center gap-3 text-sm font-bold">
              <span>Q{decision.quarter} {decision.clock}</span>
              <span style={{ color: 'var(--color-accent)' }}>{decision.down}º &amp; {decision.distance}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{yardLabel}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{offenseAbbr} {decision.homeScore}-{decision.awayScore} {defenseAbbr}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {decision.allowGoForIt && (
              <button onClick={onGoForIt} className="rounded-md px-3 py-2 text-xs font-bold" style={{ background: 'var(--color-warning)', color: '#1a0f00' }}>Ir pra cima! (4ª)</button>
            )}
            <button onClick={onDelegate} className="rounded-md px-3 py-2 text-xs font-bold" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
              Delegar ▶
            </button>
          </div>
        </div>

        {/* controles: modo de comando (troca a qualquer momento) + velocidade do replay */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Modo:</span>
            {CONTROL_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => void setControlMode(m.id)}
                className="rounded-md px-2.5 py-1 text-xs font-bold transition-colors"
                style={{ background: controlMode === m.id ? 'var(--color-accent)' : 'var(--color-surface)', color: controlMode === m.id ? '#1a0f00' : 'var(--color-text-secondary)' }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Velocidade:</span>
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className="rounded px-2 py-1 text-xs font-bold"
                style={{ background: speed === s ? 'var(--color-accent)' : 'var(--color-surface)', color: speed === s ? '#1a0f00' : 'var(--color-text-secondary)' }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* recomendação do coordenador (§8B.15) */}
        {decision.recommendations[0] && (() => {
          const top = decision.recommendations[0]
          const play = decision.available.find((p) => p.id === top.playId)
          if (!play) return null
          return (
            <button onClick={() => onChoose(play.id)} className="mb-3 flex items-center gap-3 rounded-md p-3 text-left" style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)' }}>
              <PlayDiagram play={play} variant="full" animate className="hidden h-16 w-28 flex-none sm:block" />
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: RISK_COLOR[top.riskLabel], color: '#0c0f10' }}>{top.riskLabel}</span>
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>{decision.kind === 'defense' ? 'Recomendação do DC' : 'Recomendação do OC'} · {top.confidence}%</div>
                <div className="text-sm font-black">{play.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{top.reason}</div>
              </div>
              <span className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--color-accent)', color: '#1a0f00' }}>Chamar ▶</span>
            </button>
          )
        })()}

        {isOffense && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORY_TABS.map((c) => (
              <button key={c.key} onClick={() => setTab(c.key)} className="rounded-md px-3 py-1 text-xs font-bold" style={{ background: tab === c.key ? 'var(--color-accent)' : 'var(--color-surface)', color: tab === c.key ? '#1a0f00' : 'var(--color-text-secondary)' }}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* jogadas em uma única linha (3 por vez) com slider infinito */}
        <div className="flex min-h-[196px] min-w-0 flex-1">
          <PlaySlider plays={shown} recById={recById} onChoose={onChoose} />
        </div>
      </div>
    </div>
  )
}
