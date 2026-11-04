import { useEffect, useMemo } from 'react'
import type { PlayerRef, TeamRef } from '@shared/ipc/contract'
import type { PlayEvent } from '@core/domain/types'
import { TeamCrest } from './TeamCrest'
import { tierOf } from '../lib/format'
import qbArt from '../assets/QB_1.png'
import rbArt from '../assets/player_RB_1.png'

const AUTO_MS = 8000

export interface BigPlay {
  kind: 'touchdown' | 'fumble'
  play: PlayEvent
}

/** Card grande de jogador (raridade pela cor do tier) com escudo do time em cima. */
function HeroCard({
  player, team, label, labelColor, jump
}: {
  player: PlayerRef | undefined
  team: TeamRef
  label?: string
  labelColor?: string
  jump?: boolean
}): React.JSX.Element {
  const tier = tierOf(player?.overall ?? 0)
  const art = player?.position === 'QB' ? qbArt : rbArt
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        <TeamCrest abbr={team.abbr} colors={team.colors} size={30} />
        <span className="text-sm font-black text-white">{team.abbr}</span>
      </div>
      {label && (
        <span className="rounded-full px-3 py-0.5 text-[11px] font-black uppercase tracking-wide" style={{ background: labelColor, color: '#0c0f10' }}>
          {label}
        </span>
      )}
      <div className={jump ? 'bigplay-jump' : ''}>
        <div
          data-tier={tier}
          className="relative w-[176px] overflow-hidden rounded-2xl text-center text-white"
          style={{ background: 'linear-gradient(160deg, var(--tier-from), var(--tier-to))', border: '2px solid rgba(255,255,255,0.42)', boxShadow: '0 12px 34px rgba(0,0,0,0.55)' }}
        >
          {player && <img src={art} alt="" className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[128px] w-auto opacity-20 mix-blend-luminosity" />}
          <div className="relative p-3.5">
            <div className="flex items-center justify-between">
              <span className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-bold leading-none">{player?.position ?? '--'}</span>
              <span className="text-[11px] font-bold opacity-80">#{player?.jerseyNumber ?? '--'}</span>
            </div>
            <div className="mt-1.5 text-5xl font-black leading-none">{player?.overall ?? '--'}</div>
            <div className="mt-2 truncate text-xs font-normal opacity-90">{player?.firstName ?? ''}</div>
            <div className="truncate text-lg font-black leading-tight">{player?.lastName ?? 'Jogador'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Título com letras "tabolirando" (tremendo/pulando), com stagger por letra. */
function WobbleTitle({ text, color }: { text: string; color: string }): React.JSX.Element {
  return (
    <div className="flex justify-center">
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className="bigplay-letter text-6xl font-black md:text-7xl"
          style={{ color, animationDelay: `${i * 0.06}s`, textShadow: '0 4px 18px rgba(0,0,0,0.6), 0 0 26px rgba(255,200,80,0.45)' }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </div>
  )
}

export function BigPlayOverlay({
  big, home, away, players, onDone
}: {
  big: BigPlay
  home: TeamRef
  away: TeamRef
  players: Record<string, PlayerRef>
  onDone: () => void
}): React.JSX.Element {
  const isTd = big.kind === 'touchdown'
  const p = big.play
  const offense = p.offenseTeamId === home.id ? home : away
  const defense = offense.id === home.id ? away : home

  // fog de estrelas — gerado uma vez por montagem
  const stars = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: Math.round(Math.random() * 100),
      size: 10 + Math.round(Math.random() * 22),
      dur: 3.2 + Math.random() * 2.8,
      delay: Math.random() * 2.2
    })),
    []
  )

  // auto-avança em 8s (timer estilo stories)
  useEffect(() => {
    const t = setTimeout(onDone, AUTO_MS)
    return () => clearTimeout(t)
  }, [onDone])

  const scorer = isTd ? players[p.scorerId ?? ''] : undefined
  const passer = isTd && p.passerId && p.passerId !== p.scorerId ? players[p.passerId] : undefined
  const fumbler = !isTd ? players[p.rusherId ?? ''] : undefined
  const recoverer = !isTd ? players[p.tacklerId ?? ''] : undefined

  const titleColor = isTd ? 'var(--color-neon)' : 'var(--color-negative)'

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden p-6" style={{ background: 'rgba(4,7,8,0.82)' }}>
      {/* barra de timer estilo stories do Instagram */}
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: 'rgba(255,255,255,0.12)' }}>
        <div className="story-fill h-full" style={{ background: 'var(--color-accent)', animationDuration: `${AUTO_MS}ms` }} />
      </div>

      {/* fog de estrelas caindo */}
      {stars.map((s) => (
        <span
          key={s.id}
          className="star-fall"
          style={{ left: `${s.left}%`, fontSize: `${s.size}px`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
        >
          ✦
        </span>
      ))}

      {/* brilho amarelo translúcido atrás do conteúdo */}
      <div
        className="bigplay-glow pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,200,70,0.55) 0%, rgba(255,180,40,0.18) 45%, transparent 72%)' }}
      />

      <div className="relative flex flex-col items-center gap-6">
        <WobbleTitle text={isTd ? 'TOUCHDOWN!' : 'FUMBLE!'} color={titleColor} />

        {isTd ? (
          <>
            <HeroCard player={scorer} team={offense} jump label="Touchdown" labelColor="var(--color-neon)" />
            {passer && (
              <div className="text-sm font-bold text-white/85">
                Passe de <span style={{ color: 'var(--color-accent)' }}>#{passer.jerseyNumber} {passer.lastName}</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-end gap-6">
            <HeroCard player={fumbler} team={offense} jump label="Perdeu a bola" labelColor="var(--color-negative)" />
            <div className="mb-16 text-3xl font-black text-white/60">→</div>
            <HeroCard player={recoverer} team={defense} jump label="Recuperou" labelColor="var(--color-positive)" />
          </div>
        )}

        <div className="max-w-lg text-center text-sm text-white/80">{p.text}</div>

        <button
          onClick={onDone}
          className="btn-neon rounded-md px-10 py-2.5 font-bold"
        >
          OK ▶
        </button>
      </div>
    </div>
  )
}
