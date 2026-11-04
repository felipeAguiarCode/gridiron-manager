import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { GridironPitch } from '../components/GridironPitch'
import { TeamCrest } from '../components/TeamCrest'
import { PlayCallOverlay } from '../components/PlayCallOverlay'
import { BigPlayOverlay, type BigPlay } from '../components/BigPlayOverlay'
import { playEmoji } from '../lib/format'
import type { GameDayView, PlayCallStateView, PlayerRef } from '@shared/ipc/contract'
import type { GameResult, PlayEvent, Quarter } from '@core/domain/types'

type Phase = 'pre' | 'live' | 'post'

/** Adaptador: PlayCallStateView tem home/away/players compatíveis com GameDayView. */
type DayView = Pick<GameDayView, 'home' | 'away' | 'players'>

export function GameDayScreen(): React.JSX.Element | null {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const refreshSnapshot = useGameStore((s) => s.refreshSnapshot)
  const [st, setSt] = useState<PlayCallStateView | null>(null)
  const [phase, setPhase] = useState<Phase>('pre')
  const [idx, setIdx] = useState(0)
  const [speed, setSpeed] = useState(2)
  const [atDecision, setAtDecision] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [celebration, setCelebration] = useState<BigPlay | null>(null)
  const celebratedIdx = useRef(-1)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (gameId) invoke('playcall:startGame', { gameId }).then(setSt).catch(() => navigate('/game'))
  }, [gameId, navigate])

  const log = st?.log ?? []
  const result = st?.result ?? null
  const homeId = st?.home.id ?? ''
  const runningScores = useMemo(
    () => (result ? computeRunning(result) : runningFromLog(log, homeId)),
    [result, log, homeId]
  )

  // replay incremental do log — pausa durante decisão e celebração de grande jogada
  useEffect(() => {
    if (phase !== 'live' || !st || atDecision || celebration) return
    if (idx >= log.length - 1) return
    timer.current = setInterval(() => setIdx((i) => Math.min(i + 1, log.length - 1)), 1100 / speed)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [phase, st, speed, atDecision, celebration, idx, log.length])

  // dispara a celebração ao chegar em um touchdown ou fumble (ambos os times, qualquer jogo)
  useEffect(() => {
    if (phase !== 'live' || !st || celebration) return
    const p = log[idx]
    if (!p || celebratedIdx.current === idx) return
    if (p.outcome === 'touchdown') { celebratedIdx.current = idx; setCelebration({ kind: 'touchdown', play: p }) }
    else if (p.outcome === 'fumble_lost') { celebratedIdx.current = idx; setCelebration({ kind: 'fumble', play: p }) }
  }, [phase, st, idx, log, celebration])

  // ao alcançar o fim do log conhecido: decisão pendente (overlay) ou fim de jogo
  useEffect(() => {
    if (phase !== 'live' || !st || celebration) return
    if (idx < log.length - 1) return
    if (st.decision && !atDecision) setAtDecision(true)
    else if (!st.decision && st.done) setPhase('post')
  }, [phase, st, idx, atDecision, celebration, log.length])

  if (!st) return <div className="p-10 text-center" style={{ color: 'var(--color-text-muted)' }}>Carregando jogo...</div>

  const view: DayView = { home: st.home, away: st.away, players: st.players }
  const name = (id?: string): string => {
    const p = id ? view.players[id] : undefined
    return p ? `#${p.jerseyNumber} ${p.lastName}` : ''
  }
  const [hs, as] = runningScores[Math.min(idx, runningScores.length - 1)] ?? [0, 0]
  const play = log[Math.min(idx, log.length - 1)] ?? null

  const applyState = (next: PlayCallStateView): void => {
    setSt(next)
    setAtDecision(false)
    setChoosing(false)
    setPhase('live')
  }
  const choose = async (playId: string): Promise<void> => {
    if (!gameId || choosing || !st.decision) return
    setChoosing(true)
    const kind = st.decision.kind
    const payload = kind === 'defense' ? { gameId, defensePlayId: playId }
      : kind === 'special_teams' ? { gameId, specialTeamsPlayId: playId }
      : { gameId, offensePlayId: playId }
    try { applyState(await invoke('playcall:advance', payload)) }
    catch { setChoosing(false) }
  }
  const delegate = async (): Promise<void> => {
    if (!gameId || choosing) return
    setChoosing(true)
    try { applyState(await invoke('playcall:advance', { gameId, delegate: true })) }
    catch { setChoosing(false) }
  }
  const goForIt = async (): Promise<void> => {
    if (!gameId || choosing) return
    setChoosing(true)
    try { applyState(await invoke('playcall:advance', { gameId, goForIt: true })) }
    catch { setChoosing(false) }
  }
  const goBack = (): void => { void refreshSnapshot(); navigate('/game') }

  const offAbbr = st.decision ? (st.decision.offenseTeamId === st.home.id ? st.home.abbr : st.away.abbr) : ''
  const defAbbr = st.decision ? (st.decision.defenseTeamId === st.home.id ? st.home.abbr : st.away.abbr) : ''

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-bg-base)' }}>
      <ScoreHub
        home={view.home}
        away={view.away}
        homeScore={phase === 'post' && result ? result.homeScore : hs}
        awayScore={phase === 'post' && result ? result.awayScore : as}
        phase={phase}
        play={phase === 'live' ? play : null}
        overtime={result?.overtime ?? false}
      />

      {phase === 'pre' && <PreGame view={view} interactive={st.interactive} onStart={() => setPhase('live')} onSkip={() => (st.done ? setPhase('post') : setPhase('live'))} />}

      {phase === 'live' && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden p-5">
          {play && <GridironPitch {...pitchProps(play, view.home.id)} home={{ abbr: view.home.abbr, colors: view.home.colors }} away={{ abbr: view.away.abbr, colors: view.away.colors }} />}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Velocidade:</span>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className="rounded px-2 py-1 text-xs font-bold" style={{ background: speed === s ? 'var(--color-accent)' : 'var(--color-surface)', color: speed === s ? '#1a0f00' : 'var(--color-text-secondary)' }}>{s}x</button>
            ))}
            {!st.interactive && (
              <button onClick={() => { if (timer.current) clearInterval(timer.current); setPhase('post') }} className="ml-auto rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface)' }}>Pular ⏭</button>
            )}
          </div>
          <div className="card flex-1 overflow-auto p-3">
            {log.slice(Math.max(0, idx - 8), idx + 1).reverse().map((p, i) => (
              <div key={idx - i} className="border-b py-1.5 text-sm last:border-0" style={{ borderColor: 'var(--color-border)', opacity: i === 0 ? 1 : 0.55 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Q{p.quarter} {p.clock} · {p.down}&{p.distance}</span> — {playEmoji(p)} {p.offensePlayName ? <span style={{ color: 'var(--color-accent)' }}>[{p.offensePlayName}] </span> : ''}{p.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'post' && result && <PostGame view={view} result={result} name={name} onBack={goBack} />}

      {atDecision && st.decision && (
        <PlayCallOverlay decision={st.decision} offenseAbbr={offAbbr} defenseAbbr={defAbbr} speed={speed} setSpeed={setSpeed} onChoose={choose} onDelegate={delegate} onGoForIt={goForIt} />
      )}

      {celebration && (
        <BigPlayOverlay
          key={`cel-${celebratedIdx.current}`}
          big={celebration}
          home={st.home}
          away={st.away}
          players={st.players}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  )
}

function pitchProps(play: PlayEvent, homeId: string): { los: number; firstDown: number; ball: number; attackingRight: boolean } {
  const attackingRight = play.offenseTeamId === homeId
  const los = attackingRight ? play.yardline : 100 - play.yardline
  const firstDown = attackingRight ? Math.min(100, play.yardline + play.distance) : Math.max(0, 100 - (play.yardline + play.distance))
  return { los, firstDown, ball: los, attackingRight }
}

/** Placar corrido aproximado a partir do log (usado durante o jogo interativo ao vivo). */
function runningFromLog(log: PlayEvent[], homeId: string): [number, number][] {
  const out: [number, number][] = []
  let h = 0
  let a = 0
  for (const p of log) {
    const offHome = p.offenseTeamId === homeId
    if (p.outcome === 'touchdown') { if (offHome) h += 7; else a += 7 }
    else if (p.outcome === 'field_goal_good') { if (offHome) h += 3; else a += 3 }
    else if (p.outcome === 'two_point_good') { if (offHome) h += 2; else a += 2 }
    else if (p.outcome === 'safety') { if (offHome) a += 2; else h += 2 }
    out.push([h, a])
  }
  return out
}

function computeRunning(result: GameResult): [number, number][] {
  const out: [number, number][] = new Array(result.plays.length)
  let h = 0
  let a = 0
  let idx = 0
  for (const drive of result.drives) {
    const offHome = drive.offenseTeamId === result.homeTeamId
    for (let i = 0; i < drive.plays.length; i++) {
      const isLast = i === drive.plays.length - 1
      if (isLast) {
        if (drive.result === 'TD' || drive.result === 'FG') { if (offHome) h += drive.points; else a += drive.points }
        else if (drive.result === 'SAFETY') { if (offHome) a += 2; else h += 2 }
      }
      if (idx < out.length) out[idx] = [h, a]
      idx++
    }
  }
  for (let k = idx; k < out.length; k++) out[k] = [h, a]
  return out
}

// --------------------------------------------------- placar (Madden 26 ScoreHub)

type CrestTeam = { id: string; abbr: string; colors: { primary: string; secondary: string } }

function ScoreHub({
  home, away, homeScore, awayScore, phase, play, overtime
}: {
  home: CrestTeam; away: CrestTeam; homeScore: number; awayScore: number
  phase: Phase; play: PlayEvent | null; overtime: boolean
}): React.JSX.Element {
  const live = phase === 'live' && !!play
  const homeBall = live && play!.offenseTeamId === home.id
  const awayBall = live && play!.offenseTeamId === away.id
  const qLabel = live ? qShort(play!.quarter) : ''
  const clock = live ? play!.clock : phase === 'post' ? '0:00' : '--:--'
  const dd = live ? `${play!.down} & ${play!.distance}` : '--'
  const status = phase === 'pre' ? 'PRÉ-JOGO' : phase === 'post' ? (overtime ? 'FINAL · OT' : 'FINAL') : 'AO VIVO'
  return (
    <div className="flex h-14 items-stretch overflow-hidden border-b" style={{ borderColor: 'var(--color-border)', background: '#0a0d0e' }}>
      <ColorPanel team={home} align="left" />
      {/* faixa central clara com abreviações e placares em fichas coloridas */}
      <div className="flex flex-1 items-center justify-center gap-3 px-3" style={{ background: 'linear-gradient(180deg,#eef1f3,#d7dce0)' }}>
        <AbbrTag abbr={home.abbr} color={home.colors.primary} />
        <ScoreToken score={homeScore} color={home.colors.primary} ball={homeBall} />
        <span className="px-0.5 text-xs font-black text-neutral-400">×</span>
        <ScoreToken score={awayScore} color={away.colors.primary} ball={awayBall} />
        <AbbrTag abbr={away.abbr} color={away.colors.primary} />
      </div>
      <ColorPanel team={away} align="right" />
      {/* caixa de estado do jogo: quarto + relógio + down/distância */}
      <div className="flex flex-none items-center gap-2.5 px-4" style={{ background: '#0f1416' }}>
        <div className="text-center leading-none">
          <div className="h-3 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>{qLabel}</div>
          <div className="mt-0.5 text-2xl font-black tabular-nums text-white">{clock}</div>
        </div>
        <div className="flex h-8 min-w-[48px] items-center justify-center rounded bg-white px-2 text-sm font-black tabular-nums text-neutral-900">{dd}</div>
      </div>
      {/* pílula de status */}
      <div className="flex flex-none items-center gap-2 px-5 text-xs font-black uppercase tracking-wider" style={{ background: '#080b0c', color: live ? 'var(--color-negative)' : 'var(--color-accent)' }}>
        {live && <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--color-negative)' }} />}
        {status}
      </div>
    </div>
  )
}

function qShort(q: Quarter): string {
  return q === 'OT' ? 'PR' : `${q}º`
}

function ColorPanel({ team, align }: { team: CrestTeam; align: 'left' | 'right' }): React.JSX.Element {
  const left = align === 'left'
  return (
    <div className="relative flex w-[92px] flex-none items-center justify-center overflow-hidden" style={{ background: team.colors.primary }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(0,0,0,0.28))' }} />
      {/* faixa diagonal na cor secundária junto à borda interna (chevron Madden) */}
      <div className="absolute inset-y-0 w-3.5" style={{ background: team.colors.secondary, transform: 'skewX(-14deg)', ...(left ? { right: -7 } : { left: -7 }) }} />
      <div className="relative rounded-[11px]" style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.65)' }}>
        <TeamCrest abbr={team.abbr} colors={team.colors} size={36} />
      </div>
    </div>
  )
}

function AbbrTag({ abbr, color }: { abbr: string; color: string }): React.JSX.Element {
  return (
    <div className="inline-flex flex-col items-stretch">
      <span className="text-base font-black leading-none tracking-tight" style={{ color }}>{abbr}</span>
      <span className="mt-1 h-[3px] rounded-full" style={{ background: color }} />
    </div>
  )
}

function ScoreToken({ score, color, ball }: { score: number; color: string; ball: boolean }): React.JSX.Element {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg font-black tabular-nums text-white" style={{ background: color, boxShadow: '0 1px 3px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.18)' }}>
      {score}
      {ball && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white" style={{ background: 'var(--color-accent)' }} />}
    </div>
  )
}

function PreGame({ view, interactive, onStart, onSkip }: { view: DayView; interactive: boolean; onStart: () => void; onSkip: () => void }): React.JSX.Element {
  const topOff = (teamId: string): PlayerRef[] =>
    Object.values(view.players).filter((p) => p.id.startsWith(teamId) && ['QB', 'RB', 'WR'].includes(p.position)).sort((a, b) => b.overall - a.overall).slice(0, 3)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      {interactive && <div className="rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>Você é o Head Coach — escolha as jogadas</div>}
      <div className="grid w-full max-w-3xl grid-cols-2 gap-6">
        {[view.home, view.away].map((t) => (
          <div key={t.id} className="card p-5 text-center">
            <div className="mx-auto mb-2 w-fit"><TeamCrest abbr={t.abbr} colors={t.colors} size={56} /></div>
            <div className="text-lg font-black">{t.name} {t.nickname}</div>
            <div className="mt-3 space-y-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {topOff(t.id).map((p) => <div key={p.id}>{p.position} {p.lastName} <span style={{ color: 'var(--color-accent)' }}>{p.overall}</span></div>)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <button className="btn-neon rounded-md px-8 py-3 font-bold" onClick={onStart}>▶ Kickoff</button>
        {!interactive && <button className="rounded-md px-6 py-3 font-bold" style={{ background: 'var(--color-surface)' }} onClick={onSkip}>Pular p/ Resultado</button>}
      </div>
    </div>
  )
}

function PostGame({ view, result, name, onBack }: { view: DayView; result: GameResult; name: (id?: string) => string; onBack: () => void }): React.JSX.Element {
  const s = result.stats
  const leaders = (pred: (l: GameResult['playerStats'][number]) => number): GameResult['playerStats'] =>
    [...result.playerStats].filter((l) => pred(l) > 0).sort((a, b) => pred(b) - pred(a)).slice(0, 3)
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 text-center text-2xl font-black">
          {view.home.abbr} {result.homeScore} — {result.awayScore} {view.away.abbr}{result.overtime ? ' (OT)' : ''}
        </div>
        <div className="mb-4 grid grid-cols-4 gap-1 text-center text-sm">
          <div />{result.quarters.map((_, i) => <div key={i} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Q{i + 1}</div>)}
        </div>
        <div className="card mb-4 p-4">
          <div className="section-title mb-3">Estatísticas</div>
          <StatRow label="Jardas Totais" h={s.home.totalYards} a={s.away.totalYards} />
          <StatRow label="Jardas Passe" h={s.home.passYards} a={s.away.passYards} />
          <StatRow label="Jardas Corrida" h={s.home.rushYards} a={s.away.rushYards} />
          <StatRow label="1ºs Downs" h={s.home.firstDowns} a={s.away.firstDowns} />
          <StatRow label="Turnovers" h={s.home.turnovers} a={s.away.turnovers} />
          <StatRow label="Sacks" h={s.home.sacks} a={s.away.sacks} />
        </div>
        <div className="card mb-4 p-4">
          <div className="section-title mb-3">Líderes</div>
          <LeaderGroup title="Passe" lines={leaders((l) => l.passYards).map((l) => `${name(l.playerId)} — ${l.passComp}/${l.passAtt}, ${l.passYards} jd, ${l.passTd} TD${l.passInt ? `, ${l.passInt} INT` : ''}`)} />
          <LeaderGroup title="Corrida" lines={leaders((l) => l.rushYards).map((l) => `${name(l.playerId)} — ${l.rushAtt} car, ${l.rushYards} jd, ${l.rushTd} TD`)} />
          <LeaderGroup title="Recepção" lines={leaders((l) => l.recYards).map((l) => `${name(l.playerId)} — ${l.rec} rec, ${l.recYards} jd, ${l.recTd} TD`)} />
        </div>
        <button className="btn-neon w-full rounded-md py-3 font-bold" onClick={onBack}>Voltar ao Escritório</button>
      </div>
    </div>
  )
}

function StatRow({ label, h, a }: { label: string; h: number; a: number }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between border-b py-1.5 text-sm last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <span className="w-12 text-left font-bold">{h}</span>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className="w-12 text-right font-bold">{a}</span>
    </div>
  )
}

function LeaderGroup({ title, lines }: { title: string; lines: string[] }): React.JSX.Element {
  return (
    <div className="mb-3">
      <div className="text-xs font-bold" style={{ color: 'var(--color-accent)' }}>{title}</div>
      {lines.map((l, i) => <div key={i} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{l}</div>)}
    </div>
  )
}
