import type { Player, Unit } from '@core/domain/types'
import { tierOf } from '../lib/format'

// Um jogador posicionado no campo: x (%) horizontal e d (profundidade 0=fundo/longe, 1=frente/perto).
export type FieldPlacement = { player: Player; x: number; d: number }

const OL = ['LT', 'LG', 'C', 'RG', 'RT']
const DL = ['DE', 'DT', 'NT']
const LB = ['OLB', 'ILB', 'MLB']
const SAF = ['FS', 'SS']

// Distribui n cards horizontalmente entre lo e hi (%). 1 card = centralizado.
function spreadX(n: number, lo: number, hi: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [(lo + hi) / 2]
  return Array.from({ length: n }, (_, i) => Math.round(lo + (hi - lo) * (i / (n - 1))))
}

/**
 * Formação de campo por unidade — agrupa os titulares por grupo de posição e os
 * posiciona em "linhas" com profundidade (câmera atrás da unidade). Robusto a
 * variações de scheme (nickel/dime/3-4/4-3 mudam a contagem de LB/CB).
 */
export function formationFor(unit: Unit, starters: Player[]): FieldPlacement[] {
  const out: FieldPlacement[] = []
  const pick = (pred: (p: Player) => boolean): Player[] => starters.filter(pred)
  const add = (rows: Player[], xs: number[], d: number): void => { rows.forEach((p, i) => out.push({ player: p, x: xs[i] ?? 50, d })) }
  const leftovers = (d: number): void => {
    const placed = new Set(out.map((o) => o.player.id))
    const rest = starters.filter((p) => !placed.has(p.id))
    add(rest, spreadX(rest.length, 20, 80), d)
  }

  if (unit === 'offense') {
    const ol = pick((p) => OL.includes(p.position))
    const te = pick((p) => p.position === 'TE')
    const wr = pick((p) => p.position === 'WR')
    const qb = pick((p) => p.position === 'QB')
    const rb = pick((p) => p.position === 'RB' || p.position === 'FB')
    add(ol, spreadX(ol.length, 28, 72), 0.4)          // linha ofensiva
    add(te, te.map((_, i) => 79 + i * 9), 0.4)         // TE na ponta
    add(wr, [8, 92, 18, 82], 0.38)                     // WRs abertos
    add(qb, [50], 0.6)                                 // QB atrás do centro
    add(rb, rb.length > 1 ? spreadX(rb.length, 42, 58) : [50], 0.82) // backfield
    leftovers(0.5)
  } else if (unit === 'defense') {
    const dl = pick((p) => DL.includes(p.position))
    const lb = pick((p) => LB.includes(p.position))
    const cb = pick((p) => p.position === 'CB')
    const saf = pick((p) => SAF.includes(p.position))
    add(dl, spreadX(dl.length, 30, 70), 0.2)           // linha defensiva (longe)
    add(lb, spreadX(lb.length, 26, 74), 0.4)           // linebackers
    add(cb, spreadX(cb.length, 6, 94), 0.62)           // cornerbacks abertos
    add(saf, spreadX(saf.length, 38, 62), 0.82)        // safeties (fundo/perto)
    leftovers(0.5)
  } else {
    add(pick((p) => p.position === 'LS'), [50], 0.35)  // long snapper na linha
    add(pick((p) => p.position === 'K'), [42], 0.78)   // kicker
    add(pick((p) => p.position === 'P'), [58], 0.82)   // punter
    leftovers(0.55)
  }
  return out
}

// Card grande do jogador (raridade pela cor do tier), estilo do menu de franquia.
function FieldPlayerCard({ player }: { player: Player }): React.JSX.Element {
  return (
    <div data-tier={tierOf(player.overall)} className="relative w-[86px] rounded-lg px-1.5 pb-2 pt-2 text-center text-white"
      style={{ background: 'linear-gradient(160deg, var(--tier-from), var(--tier-to))', border: '1px solid rgba(255,255,255,0.32)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
      <div className="absolute left-1 top-1 rounded bg-black/35 px-1 text-[10px] font-bold leading-none">{player.position}</div>
      <div className="pt-2.5 text-3xl font-black leading-none">{player.overall}</div>
      <div className="mt-1 truncate text-[10px] font-normal leading-tight opacity-90">{player.firstName}</div>
      <div className="truncate text-[12px] font-bold leading-tight">{player.lastName}</div>
    </div>
  )
}

// Campo de futebol americano em perspectiva Mode 7 (SNES) com os cards em pé.
export function GridironField({ placements, height = 480 }: { placements: FieldPlacement[]; height?: number }): React.JSX.Element {
  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height, perspective: '900px', background: 'radial-gradient(120% 95% at 50% 100%, #1f6236 0%, #123020 55%, #0b1710 100%)' }}>
      {/* plano do gramado tombado (Mode 7) com marcações de gridiron */}
      <div
        className="absolute inset-x-[-30%] bottom-0"
        style={{
          height: '170%',
          transformOrigin: 'center bottom',
          transform: 'rotateX(66deg)',
          backgroundColor: '#164a2a',
          backgroundImage: [
            'repeating-linear-gradient(to top, rgba(255,255,255,0.045) 0 52px, rgba(0,0,0,0.05) 52px 104px)',
            'repeating-linear-gradient(to top, rgba(255,255,255,0.6) 0 3px, transparent 3px 104px)'
          ].join(', ')
        }}
      >
        {/* hash marks centrais */}
        <div className="absolute inset-y-0" style={{ left: '42%', width: 2, backgroundImage: 'repeating-linear-gradient(to top, rgba(255,255,255,0.5) 0 3px, transparent 3px 26px)' }} />
        <div className="absolute inset-y-0" style={{ left: '58%', width: 2, backgroundImage: 'repeating-linear-gradient(to top, rgba(255,255,255,0.5) 0 3px, transparent 3px 26px)' }} />
        {/* linhas laterais */}
        <div className="absolute inset-y-0 left-[6%] w-[3px]" style={{ background: 'rgba(255,255,255,0.55)' }} />
        <div className="absolute inset-y-0 right-[6%] w-[3px]" style={{ background: 'rgba(255,255,255,0.55)' }} />
        {/* end zone ao fundo */}
        <div className="absolute inset-x-[6%] top-0 h-[12%]" style={{ background: 'rgba(255,159,28,0.28)', borderBottom: '3px solid rgba(255,255,255,0.7)' }} />
      </div>
      {/* névoa no fundo p/ profundidade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(8,11,12,0.85), transparent)' }} />
      {/* jogadores como billboards, escalados/empilhados por profundidade */}
      {placements.map(({ player, x, d }) => {
        const scale = 0.74 + d * 0.52
        return (
          <div key={player.id} className="absolute"
            style={{ left: `${x}%`, bottom: `${8 + (1 - d) * 62}%`, transform: `translateX(-50%) scale(${scale})`, zIndex: Math.round(d * 100), filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.6))' }}>
            <FieldPlayerCard player={player} />
          </div>
        )
      })}
      {!placements.length && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>—</div>}
    </div>
  )
}
