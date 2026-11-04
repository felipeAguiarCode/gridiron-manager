import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { TeamCrest } from '../components/TeamCrest'
import { tierOf } from '../lib/format'
import type { PlayerLite, TeamPreview, TeamPreviewDetail } from '@shared/ipc/contract'
import type { CoachArchetypeId, League } from '@core/domain/types'
import { Embers } from '../components/Embers'
import bg2 from '../assets/bg2.png'
import artNfl from '../assets/menu-wr1.png'
import artCfl from '../assets/menus/RB4.png'
import artUfl from '../assets/menu-rb1.png'
import artNcaa from '../assets/menu-rb2.png'

// bg2 é claro/enevoado → scrim escuro mais forte p/ legibilidade do texto e dos painéis
const WIZ_BG: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(8,11,12,0.78), rgba(8,11,12,0.9)), url(${bg2})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center'
}

const LEAGUES: { id: League; title: string; sub: string; tag: string; color: string; img: string }[] = [
  { id: 'nfl', title: 'NFL', sub: '32 franquias · EUA', tag: 'Profissional', color: '#1d9a54', img: artNfl },
  { id: 'cfl', title: 'CFL', sub: '9 franquias · Canadá', tag: 'Profissional', color: '#d0342c', img: artCfl },
  { id: 'ufl', title: 'UFL', sub: '8 franquias · Primavera', tag: 'Profissional', color: '#2f7fc0', img: artUfl },
  { id: 'ncaa', title: 'NCAA', sub: '42 programas · CFP-12', tag: 'Universitário', color: '#d08a1c', img: artNcaa }
]

const ARCHETYPES = [
  { id: 'offensive_guru', label: 'Offensive Guru', desc: 'Ataque evolui/rende mais' },
  { id: 'defensive_mastermind', label: 'Defensive Mastermind', desc: 'Defesa forte em jogos truncados' },
  { id: 'players_coach', label: "Players' Coach", desc: 'Moral recupera rápido' },
  { id: 'ceo_gm', label: 'CEO/GM', desc: 'Gestão de cap e trades' },
  { id: 'special_teams_ace', label: 'Special Teams Ace', desc: 'FGs/returns/field position' },
  { id: 'analytics', label: 'Analytics', desc: 'Relatórios precisos, 4th-down agressivo' }
] as const

export function NewCareerScreen(): React.JSX.Element {
  const navigate = useNavigate()
  const createCareer = useGameStore((s) => s.createCareer)
  const [step, setStep] = useState<'league' | 'team' | 'coach'>('league')
  const [league, setLeague] = useState<League>('nfl')
  const [teams, setTeams] = useState<TeamPreview[]>([])
  const [teamId, setTeamId] = useState<string>('')
  const [coachName, setCoachName] = useState('')
  const [archetype, setArchetype] = useState<CoachArchetypeId>('offensive_guru')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<TeamPreviewDetail | null>(null)
  const [showcase, setShowcase] = useState(0) // 0 ataque · 1 defesa · 2 special

  useEffect(() => {
    if (step === 'team') invoke('world:teams', { league }).then(setTeams).catch(() => setTeams([]))
  }, [step, league])

  // auto-seleciona o primeiro time quando a lista carrega
  useEffect(() => {
    if (step === 'team' && teams.length && !teams.some((t) => t.id === teamId)) setTeamId(teams[0].id)
  }, [step, teams, teamId])

  // busca o preview detalhado ao trocar de time
  useEffect(() => {
    if (teamId) invoke('world:teamPreview', { league, teamId }).then(setPreview).catch(() => setPreview(null))
  }, [teamId, league])

  // alterna a vitrine ataque → defesa → special periodicamente
  useEffect(() => {
    const t = setInterval(() => setShowcase((s) => (s + 1) % 3), 3600)
    return () => clearInterval(t)
  }, [])

  const grouped = useMemo(() => {
    const m = new Map<string, TeamPreview[]>()
    for (const t of teams) {
      const key = `${t.conference} ${t.division}`
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(t)
    }
    return [...m.entries()].sort()
  }, [teams])

  const selected = teams.find((t) => t.id === teamId)

  const confirm = async (): Promise<void> => {
    if (!teamId || !coachName.trim()) return
    setBusy(true)
    try {
      await createCareer({ saveName: `${coachName} — ${selected?.nickname ?? ''}`.trim(), league, teamId, coachName: coachName.trim(), coachArchetype: archetype })
      navigate('/game')
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full w-full" style={WIZ_BG}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>‹ Menu</button>
        <Stepper step={step} />
      </div>

      {step === 'league' && (
        <div className="flex min-h-[78vh] items-center justify-center">
          <div className="relative w-full overflow-hidden rounded-2xl">
            {/* névoa ao fundo */}
            <div className="fog" />
            {/* 4 colunas de foto coladas (sem cinza entre elas) — sem z-index p/ a
                ordem do DOM pintar a névoa de cima e as brasas ACIMA das colunas */}
            <div className="relative grid grid-cols-2 gap-0 md:grid-cols-4">
              {LEAGUES.map((l) => (
                <LeagueColumn key={l.id} title={l.title} sub={l.sub} tag={l.tag} color={l.color} img={l.img} onClick={() => { setLeague(l.id); setStep('team') }} />
              ))}
            </div>
            {/* névoa por cima (forte) + brasas iguais às do menu principal */}
            <div className="fog fog-2" />
            <Embers />
          </div>
        </div>
      )}

      {step === 'team' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,620px)] lg:justify-center">
          {/* esquerda: grade compacta de times em cards verticais (em pé), 3 por linha, scroll branco */}
          <div className="scrollbar-white max-h-[76vh] overflow-y-auto px-1 py-1">
            {grouped.map(([label, list]) => (
              <div key={label} className="mb-4">
                <div className="section-title mb-2">{label}</div>
                <div className="grid grid-cols-3 gap-2">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTeamId(t.id)}
                      className="card flex flex-col items-center gap-1.5 p-3 text-center transition hover:brightness-110"
                      style={teamId === t.id ? { boxShadow: 'inset 0 0 0 2px var(--color-accent), var(--shadow-card)', background: 'var(--color-surface-hover)' } : undefined}
                    >
                      <TeamCrest abbr={t.abbr} colors={t.colors} size={40} />
                      <div className="w-full truncate text-xs font-bold">{t.nickname}</div>
                      <div className="text-[10px] leading-none" style={{ color: 'var(--color-accent)' }}>{'★'.repeat(t.reputation)}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* direita: banner + médias por categoria + vitrine rotativa de jogadores */}
          <TeamPanel preview={preview} fallback={selected} showcase={showcase} onAdvance={() => setStep('coach')} />
        </div>
      )}

      {step === 'coach' && (
        <div className="mx-auto w-full max-w-2xl">
          <div className="card p-5">
            <label className="section-title">Nome do Head Coach</label>
            <input className="input-mk mt-2" value={coachName} onChange={(e) => setCoachName(e.target.value)} placeholder="Seu nome" maxLength={40} />
            <div className="section-title mt-5">Arquétipo</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ARCHETYPES.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setArchetype(a.id)}
                  className="card p-3 text-left transition hover:brightness-110"
                  style={archetype === a.id ? { outline: '2px solid var(--color-accent)' } : undefined}
                >
                  <div className="text-sm font-bold">{a.label}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{a.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-between">
              <button onClick={() => setStep('team')} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>‹ Voltar</button>
              <button className="btn-neon rounded-md px-6 py-2 font-bold disabled:opacity-40" disabled={!coachName.trim() || busy} onClick={confirm}>
                {busy ? 'Criando...' : 'Iniciar Carreira'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

const SHOWCASE = [
  { key: 'offense', label: 'Ataque' },
  { key: 'defense', label: 'Defesa' },
  { key: 'special', label: 'Special Teams' }
] as const

// posições no meio-campo simulado: x (%) e profundidade d (0 = fundo/longe, 1 = frente/perto)
const FIELD_SLOTS = [
  { x: 50, d: 0.15 },
  { x: 26, d: 0.46 },
  { x: 74, d: 0.46 },
  { x: 40, d: 0.8 },
  { x: 60, d: 0.8 }
]

// Mini-card de jogador com raridade (overall + cor do tier) — maior.
function MiniCard({ player }: { player: PlayerLite }): React.JSX.Element {
  return (
    <div data-tier={tierOf(player.overall)} className="relative w-[76px] rounded-lg px-1.5 pb-1.5 pt-1.5 text-center text-white" style={{ background: 'linear-gradient(160deg, var(--tier-from), var(--tier-to))', border: '1px solid rgba(255,255,255,0.3)' }}>
      {/* posição sempre no canto superior esquerdo */}
      <div className="absolute left-1.5 top-1 text-[10px] font-bold leading-none opacity-95">{player.position}</div>
      {/* overall centralizado no meio do card */}
      <div className="pt-2.5 text-2xl font-black leading-none">{player.overall}</div>
      <div className="mt-1 truncate text-[10px] font-normal leading-tight opacity-90">{player.firstName}</div>
      <div className="truncate text-[12px] font-bold leading-tight">{player.lastName}</div>
    </div>
  )
}

// Meio-campo de futebol americano em perspectiva Mode 7 (SNES) com os cards em pé.
function Mode7Field({ players }: { players: PlayerLite[] }): React.JSX.Element {
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ height: 300, perspective: '640px', background: 'radial-gradient(120% 95% at 50% 100%, #1f6236 0%, #123020 55%, #0b1710 100%)' }}>
      {/* plano do gramado tombado (Mode 7) com marcações de gridiron */}
      <div
        className="absolute inset-x-[-30%] bottom-0"
        style={{
          height: '165%',
          transformOrigin: 'center bottom',
          transform: 'rotateX(65deg)',
          backgroundColor: '#164a2a',
          backgroundImage: [
            // faixas de corte de grama (mowing) alternadas
            'repeating-linear-gradient(to top, rgba(255,255,255,0.045) 0 46px, rgba(0,0,0,0.05) 46px 92px)',
            // yard lines brancas a cada ~10 jardas
            'repeating-linear-gradient(to top, rgba(255,255,255,0.6) 0 3px, transparent 3px 92px)'
          ].join(', ')
        }}
      >
        {/* hash marks centrais (duas colunas tracejadas) */}
        <div className="absolute inset-y-0" style={{ left: '42%', width: 2, backgroundImage: 'repeating-linear-gradient(to top, rgba(255,255,255,0.5) 0 3px, transparent 3px 23px)' }} />
        <div className="absolute inset-y-0" style={{ left: '58%', width: 2, backgroundImage: 'repeating-linear-gradient(to top, rgba(255,255,255,0.5) 0 3px, transparent 3px 23px)' }} />
        {/* linhas laterais */}
        <div className="absolute inset-y-0 left-[6%] w-[3px]" style={{ background: 'rgba(255,255,255,0.55)' }} />
        <div className="absolute inset-y-0 right-[6%] w-[3px]" style={{ background: 'rgba(255,255,255,0.55)' }} />
        {/* end zone ao fundo */}
        <div className="absolute inset-x-[6%] top-0 h-[13%]" style={{ background: 'rgba(255,159,28,0.28)', borderBottom: '3px solid rgba(255,255,255,0.7)' }} />
      </div>
      {/* névoa no fundo p/ profundidade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(8,11,12,0.85), transparent)' }} />
      {/* jogadores como billboards, escalados/empilhados por profundidade */}
      {players.slice(0, 5).map((p, i) => {
        const s = FIELD_SLOTS[i] ?? { x: 50, d: 0.5 }
        const scale = 0.72 + s.d * 0.5
        return (
          <div
            key={p.id}
            className="absolute"
            style={{ left: `${s.x}%`, bottom: `${8 + (1 - s.d) * 60}%`, transform: `translateX(-50%) scale(${scale})`, zIndex: Math.round(s.d * 100), filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.6))' }}
          >
            <MiniCard player={p} />
          </div>
        )
      })}
      {!players.length && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--color-text-muted)' }}>—</div>}
    </div>
  )
}

// Painel direito da escolha de franquia: banner (escudo/nome/médias) + barras por
// categoria + vitrine de destaques que alterna Ataque → Defesa → Special.
function TeamPanel({ preview, fallback, showcase, onAdvance }: { preview: TeamPreviewDetail | null; fallback?: TeamPreview; showcase: number; onAdvance: () => void }): React.JSX.Element {
  const team = preview?.team ?? fallback
  if (!team) return <div className="card p-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>Selecione uma franquia</div>
  const qb = preview?.qb
  const sc = SHOWCASE[showcase]
  const players = preview?.units[sc.key] ?? []
  return (
    <div className="card h-fit overflow-hidden">
      {/* banner com as cores do time */}
      <div className="flex items-center justify-between gap-3 p-4" style={{ background: `linear-gradient(135deg, ${team.colors.primary} 0%, ${team.colors.secondary} 135%)` }}>
        <div className="flex items-center gap-3">
          <TeamCrest abbr={team.abbr} colors={team.colors} size={56} />
          <div>
            <div className="text-xl font-black text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{team.city}</div>
            <div className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{team.nickname}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>{'★'.repeat(team.reputation)}</div>
          </div>
        </div>
        {/* QB principal: posição à esquerda, overall, e nome (sobrenome em negrito) */}
        {qb && (
          <div className="flex items-center gap-2.5" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>{qb.position}</span>
            <span className="text-4xl font-black leading-none text-white">{qb.overall}</span>
            <div className="leading-tight">
              <div className="text-sm font-normal" style={{ color: 'rgba(255,255,255,0.9)' }}>{qb.firstName}</div>
              <div className="text-base font-bold text-white">{qb.lastName}</div>
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2">
          <RingStat label="OFF" value={team.offOverall} />
          <RingStat label="DEF" value={team.defOverall} />
          <RingStat label="ST" value={team.stOverall} />
        </div>

        {/* médias por categoria — números compactos lado a lado, separados por linha branca */}
        <div className="mt-4 flex items-stretch rounded-lg py-2" style={{ background: 'var(--color-bg-base)' }}>
          {(preview?.categories ?? []).map((c, i) => (
            <div key={c.label} className="flex-1 px-1 text-center" style={i > 0 ? { borderLeft: '1px solid rgba(255,255,255,0.32)' } : undefined}>
              <div className="text-xl font-black">{c.value}</div>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* linha branca de separação entre o banner/overall e os destaques */}
        <div className="my-4 h-px w-full" style={{ background: 'rgba(255,255,255,0.45)' }} />

        <div>
          <div className="section-title mb-2" style={{ color: 'var(--color-accent)' }}>Destaques · {sc.label}</div>
          <Mode7Field players={players} />
        </div>

        <button className="btn-neon mt-4 w-full rounded-md py-2 font-bold" onClick={onAdvance}>Avançar →</button>
      </div>
    </div>
  )
}

// Overall dentro de um gráfico de rosca fina branca, com leve neon branco transparente.
function RingStat({ label, value }: { label: string; value: number }): React.JSX.Element {
  const r = 30
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, value / 99))
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 74, height: 74, filter: 'drop-shadow(0 0 7px rgba(255,255,255,0.4))' }}>
        <svg width="74" height="74" viewBox="0 0 74 74">
          <circle cx="37" cy="37" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3.5" />
          <circle
            cx="37" cy="37" r={r} fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 37 37)"
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-white">{value}</div>
      </div>
      <div className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  )
}

// Caixa grande retangular estilo Madden (igual ao main menu): vidro frosted,
// reflexo de vidro varrendo (sincronizado entre todas), zoom + contorno gradiente no hover.
// coluna de liga estilo "Madden select": foto do atleta preenchendo a coluna,
// apagada por padrão e acendendo no hover (o selecionado se destaca), com barra
// de cor da liga no topo e painel de texto ancorado embaixo.
function LeagueColumn({ title, sub, tag, color, img, onClick }: { title: string; sub: string; tag: string; color: string; img: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="group relative flex h-[72vh] min-h-[440px] w-full flex-col overflow-hidden rounded-none text-left"
      style={{ background: 'linear-gradient(180deg, #12181c 0%, #0a0d0e 100%)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* foto do atleta preenchendo a coluna — apagada, acende no hover */}
      <img
        src={img}
        alt=""
        className="pointer-events-none absolute inset-x-0 top-0 h-[76%] w-full object-cover object-top brightness-[0.6] saturate-[0.85] transition duration-300 group-hover:brightness-105 group-hover:saturate-100"
      />
      {/* scrim inferior forte p/ o painel de texto */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%]" style={{ background: 'linear-gradient(to top, #090c0d 30%, rgba(9,12,13,0.82) 54%, transparent 100%)' }} />
      {/* barra de cor da liga no topo */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
      {/* reflexo de vidro passando continuamente sobre a coluna */}
      <span className="sheen sheen-continuous" />
      {/* contorno gradiente andante — só no hover (destaque do selecionado) */}
      <span className="grad-border pointer-events-none absolute inset-0 rounded-none opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      {/* painel de texto ancorado embaixo */}
      <div className="relative mt-auto flex flex-col items-start gap-1.5 p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color }}>{tag}</div>
        <div className="text-4xl font-black uppercase leading-none text-white" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>{title}</div>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>{sub}</div>
      </div>
    </button>
  )
}

function Stepper({ step }: { step: string }): React.JSX.Element {
  const steps = [['league', 'Liga'], ['team', 'Franquia'], ['coach', 'Coach']]
  return (
    <div className="flex gap-2 text-xs">
      {steps.map(([id, label], i) => (
        <span key={id} className="rounded-full px-3 py-1 font-semibold" style={{ background: step === id ? 'var(--color-accent)' : 'var(--color-surface)', color: step === id ? '#1a0f00' : 'var(--color-text-muted)' }}>
          {i + 1}. {label}
        </span>
      ))}
    </div>
  )
}

