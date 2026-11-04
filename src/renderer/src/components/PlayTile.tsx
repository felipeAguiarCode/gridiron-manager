/**
 * Card de jogada compartilhado — prancheta (mini) + nome + medidores Risco/Recompensa.
 * Fonte de verdade única usada tanto no play-call in-game quanto na tela de Playbook
 * (galeria e editor), para que fiquem visualmente idênticos.
 */
import type { PlaybookPlay } from '@core/domain/playbook'
import { PlayDiagram } from './PlayDiagram'

export type PlayTileState = 'default' | 'recommended' | 'selected' | 'unselected'

function Meter({ label, value, color }: { label: string; value: number; color: string }): React.JSX.Element {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px]"><span style={{ color: 'var(--color-text-muted)' }}>{label}</span><span className="font-bold" style={{ color }}>{value}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-bg-base)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  )
}

function stateStyle(state: PlayTileState): React.CSSProperties | undefined {
  switch (state) {
    case 'recommended': return { border: '1px solid var(--color-accent)' }
    case 'selected': return { border: '1px solid var(--color-accent)', background: 'var(--color-accent-soft)' }
    case 'unselected': return { opacity: 0.7 }
    default: return undefined
  }
}

export function PlayTile({ play, animate = false, onClick, state = 'default', badge, footer, className }: {
  play: PlaybookPlay
  animate?: boolean
  onClick?: () => void
  state?: PlayTileState
  badge?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}): React.JSX.Element {
  const riskColor = play.baseRisk < 30 ? 'var(--color-positive)' : play.baseRisk < 55 ? 'var(--color-accent)' : play.baseRisk < 75 ? 'var(--color-warning)' : 'var(--color-negative)'
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`card flex h-full w-full flex-col gap-1.5 p-2.5 text-left ${onClick ? 'transition-transform hover:-translate-y-0.5' : ''} ${className ?? ''}`}
      style={stateStyle(state)}
    >
      <PlayDiagram play={play} variant="mini" animate={animate} className="aspect-[100/62] w-full" />
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-black leading-tight">{play.name}</div>
        {badge}
      </div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{play.formation.replace(/_/g, ' ')} · {play.personnel} pers.</div>
      <div className="grid grid-cols-2 gap-2">
        <Meter label="Risco" value={play.baseRisk} color={riskColor} />
        <Meter label="Recompensa" value={play.baseReward} color="var(--color-neon)" />
      </div>
      {footer}
    </Comp>
  )
}
