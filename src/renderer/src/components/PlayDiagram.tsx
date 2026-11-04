/**
 * Prancheta de jogada (estilo Madden) — SVG top-down gerado de uma `PlaybookPlay`.
 * A geometria vem de `synthesizePlay` (lib/playDiagram). O rótulo com o NOME fica
 * a cargo de quem chama (para casar com o botão/label da referência).
 */
import { useMemo } from 'react'
import type { PlaybookPlay } from '@core/domain/playbook'
import { synthesizePlay, type Marker, type RouteColor, type RouteLine } from '../lib/playDiagram'

const ROUTE_STROKE: Record<RouteColor, string> = {
  downfield: '#e4c53b', // amarelo — vertical/profundo
  primary: '#e5533c', // vermelho — portador/primária
  block: '#e8edf0' // branco — bloqueio/motion
}

// cor do badge por letra (espelha a referência: X azul, Y amarelo, A verde, B vermelho)
const BADGE_FILL: Record<string, string> = {
  X: '#3b82c4', B: '#e5533c', A: '#3fd07a', H: '#2bb8c4', Y: '#d7b53a', Y2: '#d7b53a', Y3: '#d7b53a'
}

const FLAG_COLOR: Record<string, string> = { RUN: '#e5843c', PASS: '#5aa9e6', DEF: '#e5533c', ST: '#9fb0b5' }

function pointsAttr(r: RouteLine): string {
  return r.points.map((p) => `${p.x},${p.y}`).join(' ')
}

function PlayerGlyph({ m, showBadge }: { m: Marker; showBadge: boolean }): React.JSX.Element {
  if (m.kind === 'ol') {
    // linha ofensiva: "T" branco
    return (
      <g stroke="#e8edf0" strokeWidth={1} fill="none" strokeLinecap="round">
        <line x1={m.x - 1.6} y1={m.y} x2={m.x + 1.6} y2={m.y} />
        <line x1={m.x} y1={m.y} x2={m.x} y2={m.y + 2} />
      </g>
    )
  }
  const badgeColor = m.badge ? BADGE_FILL[m.badge] : undefined
  return (
    <g>
      <circle cx={m.x} cy={m.y} r={m.kind === 'qb' ? 1.9 : 1.7} fill={badgeColor ? 'rgba(8,11,12,0.85)' : '#e8edf0'} stroke={badgeColor ?? '#e8edf0'} strokeWidth={badgeColor ? 0.8 : 0} />
      {showBadge && m.badge && m.badge !== 'FB' && (
        <text x={m.x} y={m.y + 0.9} textAnchor="middle" fontSize={2.4} fontWeight={800} fill={badgeColor ?? '#e8edf0'}>{m.badge.replace(/\d/, '')}</text>
      )}
    </g>
  )
}

export function PlayDiagram({ play, variant = 'mini', animate = false, className }: {
  play: PlaybookPlay
  variant?: 'mini' | 'full'
  animate?: boolean
  className?: string
}): React.JSX.Element {
  const g = useMemo(() => synthesizePlay(play), [play])
  const showBadge = variant === 'full'
  const sw = variant === 'full' ? 1.15 : 0.95

  return (
    <div className={`relative overflow-hidden rounded-lg ${className ?? ''}`} style={{ background: 'radial-gradient(120% 120% at 50% 0%, #12181a 0%, #0c1011 60%, #080b0c 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid meet" className="block h-full w-full">
        <defs>
          {(Object.keys(ROUTE_STROKE) as RouteColor[]).map((c) => (
            <marker key={c} id={`arw-${c}-${variant}`} markerWidth={5} markerHeight={5} refX={2.4} refY={2.5} orient="auto-start-reverse">
              <path d="M0,0 L5,2.5 L0,5 z" fill={ROUTE_STROKE[c]} />
            </marker>
          ))}
        </defs>

        {/* linha de scrimmage + hashes sutis */}
        <line x1={4} y1={42} x2={96} y2={42} stroke="rgba(255,255,255,0.16)" strokeWidth={0.4} />
        <line x1={42} y1={38} x2={42} y2={46} stroke="rgba(255,255,255,0.10)" strokeWidth={0.3} />
        <line x1={58} y1={38} x2={58} y2={46} stroke="rgba(255,255,255,0.10)" strokeWidth={0.3} />

        {/* zonas defensivas */}
        {g.zones?.map((z, i) => (
          <circle key={i} cx={z.x} cy={z.y} r={z.r} fill="rgba(90,169,230,0.06)" stroke="rgba(90,169,230,0.5)" strokeWidth={0.4} strokeDasharray="1.6 1.4" />
        ))}

        {/* rotas */}
        {g.routes.map((r, i) => {
          const stroke = ROUTE_STROKE[r.color]
          return (
            <polyline
              key={i}
              points={pointsAttr(r)}
              fill="none"
              stroke={stroke}
              strokeWidth={r.color === 'block' ? sw * 0.8 : sw}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={r.dashed ? '1.8 1.6' : undefined}
              markerEnd={r.arrow ? `url(#arw-${r.color}-${variant})` : undefined}
              className={animate ? 'route-draw' : undefined}
              style={animate ? { animationDelay: `${i * 55}ms` } : undefined}
            />
          )
        })}

        {/* jogadores */}
        {g.markers.map((m) => (
          <PlayerGlyph key={m.id} m={m} showBadge={showBadge} />
        ))}
      </svg>

      {/* marcador d'água RUN/PASS/DEF/ST */}
      <div className="pointer-events-none absolute bottom-0.5 left-1 font-black italic leading-none" style={{ color: FLAG_COLOR[g.flag], fontSize: variant === 'full' ? '0.85rem' : '0.6rem', opacity: 0.9, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
        {g.flag}
      </div>
    </div>
  )
}
