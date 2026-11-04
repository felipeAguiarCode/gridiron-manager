import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/gameStore'
import { TeamCrest } from '../components/TeamCrest'
import { Embers } from '../components/Embers'
import { PHASE_LABEL, recordStr } from '../lib/format'
import type { StandingView, Snapshot, PlayerLite } from '@shared/ipc/contract'
import artEspn from '../assets/menus/espn_guy_1.png'
import artOffice from '../assets/menus/office_girl1.png'
import artLeague from '../assets/menu-battle1.png'
import portraitQb from '../assets/players/portrait.png'

const money = (n: number): string => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`)

const BOARD_LABEL: Record<string, string> = {
  safe: 'Diretoria satisfeita', observed: 'Sob observação', pressured: 'Sob pressão',
  ultimatum: 'Ultimato da diretoria', fired: 'Demitido'
}

export function HomeScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const navigate = useNavigate()
  if (!snapshot) return null
  const { team, gameOver } = snapshot

  if (gameOver) {
    return (
      <div className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center gap-6 text-center">
        <div className="text-5xl">🪦</div>
        <h1 className="text-3xl font-black" style={{ color: 'var(--color-negative)' }}>Você foi demitido</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          A diretoria dos {team.nickname} encerrou seu ciclo como head coach após uma temporada abaixo das expectativas. Fim de jogo para esta carreira.
        </p>
        <button className="btn-neon rounded-md px-6 py-3 font-bold" onClick={() => navigate('/')}>Voltar ao Menu</button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <NextGameBanner snapshot={snapshot} onClick={() => navigate('/game/calendar')} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HubBox
          icon="📰" tag="ESPN" title="Últimas Notícias" delay="0s"
          subtitle="Notícias, contratações e bastidores da liga"
          img={artEspn} imgClass="right-0 bottom-0 h-full w-[82%] object-cover object-[72%_top]"
          onClick={() => navigate('/game/espn')}
        />
        <HubBox
          icon="🗂️" tag="Técnico" title="Escritório Técnico" delay="1.4s"
          subtitle={`Metas · Cap ${money(snapshot.finance.capSpace)} · ${BOARD_LABEL[snapshot.boardStatus] ?? ''}`}
          img={artOffice} imgClass="right-0 bottom-0 h-full w-[82%] object-cover object-[center_top]"
          onClick={() => navigate('/game/office')}
        />
        <HubBox
          icon="🏆" tag="Liga" title="Resultados da Liga" delay="2.8s"
          subtitle={`${team.divisionRank}º · ${team.conference} ${team.division} · classificação e resultados`}
          img={artLeague} imgClass="right-0 bottom-0 h-[92%] w-auto object-contain object-right-bottom"
          onClick={() => navigate('/game/competition')}
        />
      </div>
    </div>
  )
}

// -------------------------------------------------- Banner do próximo jogo (estilo inspo)

function NextGameBanner({ snapshot, onClick }: { snapshot: Snapshot; onClick: () => void }): React.JSX.Element {
  const { nextFixtures, standings, team, save } = snapshot
  const byId = new Map(standings.map((s) => [s.teamId, s]))
  const next = nextFixtures[0]
  const home = next ? byId.get(next.homeTeamId) : undefined
  const away = next ? byId.get(next.awayTeamId) : undefined

  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl text-left transition-transform duration-200 hover:scale-[1.01]"
      style={{ background: 'radial-gradient(130% 130% at 50% 0%, #1f6236 0%, #123020 45%, #0b1710 100%)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* textura de yard lines */}
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 68px)' }} />
      {/* brasas esvoaçantes — apenas dentro do banner de próximo jogo */}
      <Embers count={16} />
      <span className="sheen sheen-continuous" />
      <span className="grad-border pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="relative flex items-center gap-3 px-6 py-9">
        {home && away ? (
          <>
            <CrestBlock s={home} isUser={home.teamId === team.id} />
            <QbBlock qb={home.qb} align="left" />
            <Ovr s={home} opp={away} />
            <CenterBadge week={next!.week} />
            <Ovr s={away} opp={home} />
            <QbBlock qb={away.qb} align="right" />
            <CrestBlock s={away} isUser={away.teamId === team.id} />
          </>
        ) : (
          <div className="mx-auto py-10 text-center">
            <div className="text-base font-bold" style={{ color: 'var(--color-accent)' }}>{PHASE_LABEL[save.phase]}</div>
            <div className="text-3xl font-black text-white">Sem jogo agendado</div>
          </div>
        )}
      </div>

      <div className="relative border-t px-6 py-3.5 text-center text-sm font-bold uppercase tracking-wide"
        style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.82)', background: 'rgba(8,11,12,0.38)' }}>
        Próximo Jogo · clique para ir ao calendário e jogar ▶
      </div>
    </button>
  )
}

function CrestBlock({ s, isUser }: { s: StandingView; isUser: boolean }): React.JSX.Element {
  // Coluna vertical: nome em cima do escudo → bloco estreito, sobra espaço na linha
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div className="max-w-full truncate text-2xl font-black leading-tight text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>{s.nickname}</div>
      <TeamCrest abbr={s.abbr} colors={s.colors} size={92} />
      <div className="max-w-full truncate text-sm" style={{ color: 'rgba(255,255,255,0.78)' }}>
        {recordStr(s.wins, s.losses, s.ties)}{isUser && <span style={{ color: 'var(--color-accent)' }}> · você</span>}
      </div>
    </div>
  )
}

function QbBlock({ qb, align }: { qb: PlayerLite | null; align: 'left' | 'right' }): React.JSX.Element | null {
  if (!qb) return null
  const right = align === 'right'
  return (
    <div className={`hidden flex-none items-center gap-2 lg:flex ${right ? 'flex-row-reverse text-right' : ''}`}>
      <img
        src={portraitQb}
        alt=""
        className="h-14 w-14 flex-none rounded-lg object-cover"
        style={{ border: '1px solid rgba(255,255,255,0.28)', boxShadow: '0 1px 5px rgba(0,0,0,0.55)' }}
      />
      <div className="leading-tight">
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>#{qb.jerseyNumber} · {qb.position}</div>
        <div className="max-w-[100px] truncate text-sm font-normal text-white/85" title={`${qb.firstName} ${qb.lastName}`}>{qb.firstName}</div>
        <div className="max-w-[100px] truncate text-base font-black leading-none text-white">{qb.lastName}</div>
      </div>
    </div>
  )
}

function Ovr({ s, opp }: { s: StandingView; opp: StandingView }): React.JSX.Element {
  const color = s.overall >= opp.overall ? 'var(--color-positive)' : 'var(--color-warning)'
  // chip escuro atrás do número — garante contraste sobre o campo verde do banner
  return (
    <div className="flex flex-none flex-col items-center rounded-xl px-5 py-3" style={{ background: 'rgba(6,9,10,0.62)', border: `1.5px solid ${color}`, boxShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
      <div className="text-5xl font-black leading-none" style={{ color, textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>{s.overall}</div>
      <div className="mt-1 text-xs font-bold tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.8)' }}>OVR</div>
    </div>
  )
}

function CenterBadge({ week }: { week: number }): React.JSX.Element {
  return (
    <div className="flex flex-none flex-col items-center px-1">
      <div className="flex h-24 w-24 items-center justify-center rounded-full border-2" style={{ borderColor: 'var(--color-accent)', background: 'rgba(8,11,12,0.5)' }}>
        <div className="text-center leading-none">
          <div className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>SEM</div>
          <div className="text-3xl font-black text-white">{week}</div>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------- Caixas do hub (estilo main menu)

function HubBox({ icon, tag, title, subtitle, delay, img, imgClass, onClick }: { icon: string; tag: string; title: string; subtitle: string; delay: string; img?: string; imgClass?: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="group relative flex min-h-[320px] w-full flex-col overflow-hidden rounded-2xl text-left transition-transform duration-200 will-change-transform hover:scale-[1.02]"
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 55%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.18)', boxShadow: 'var(--shadow-card)'
      }}
    >
      {/* arte do jogador sangrando na base/direita — apagada, acende no hover */}
      {img && (
        <img
          src={img}
          alt=""
          className={`pointer-events-none absolute brightness-[0.72] drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)] transition duration-300 group-hover:brightness-100 ${imgClass ?? 'right-0 bottom-0 h-[85%] w-auto object-contain object-right-bottom'}`}
        />
      )}
      {/* scrim diagonal — mantém o canto superior esquerdo escuro p/ legibilidade do texto */}
      {img && (
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(118deg, rgba(8,11,12,0.94) 0%, rgba(8,11,12,0.6) 40%, rgba(8,11,12,0.08) 100%)' }} />
      )}
      <span className="sheen" style={{ animationDelay: delay }} />
      <span className="grad-border pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="relative flex h-full flex-col p-7">
        <div className="text-5xl">{icon}</div>
        <div className="section-title mt-4" style={{ color: 'var(--color-accent)' }}>{tag}</div>
        <div className="text-3xl font-extrabold leading-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>{title}</div>
        <div className="mt-2 text-base" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</div>
      </div>
    </button>
  )
}
