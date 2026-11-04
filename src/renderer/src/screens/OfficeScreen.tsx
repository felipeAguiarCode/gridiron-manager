import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/gameStore'
import { TeamCrest } from '../components/TeamCrest'
import { FormPills } from '../components/FormPills'
import { recordStr } from '../lib/format'
import type { BoardStatus, ObjectiveView } from '@core/engine/objectives'
import type { FixtureView } from '@shared/ipc/contract'

const BOARD: Record<BoardStatus, { label: string; color: string; bg: string }> = {
  safe: { label: 'Diretoria satisfeita', color: 'var(--color-positive)', bg: 'rgba(63,208,122,0.12)' },
  observed: { label: 'Sob observação', color: 'var(--color-text-secondary)', bg: 'var(--color-surface-hover)' },
  pressured: { label: 'Sob pressão', color: 'var(--color-warning)', bg: 'rgba(245,183,60,0.12)' },
  ultimatum: { label: 'Ultimato da diretoria', color: 'var(--color-negative)', bg: 'rgba(242,85,95,0.12)' },
  fired: { label: 'Você foi demitido', color: 'var(--color-negative)', bg: 'rgba(242,85,95,0.18)' }
}

const money = (n: number): string => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`)

export function OfficeScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const navigate = useNavigate()
  if (!snapshot) return null
  const { team, standings, nextFixtures, lastResults, championTeamId, objectives, finance, boardStatus, gameOver } = snapshot
  const byId = new Map(standings.map((s) => [s.teamId, s]))
  const myDivision = standings.filter((s) => s.conference === team.conference && s.division === team.division).sort((a, b) => a.position - b.position)
  const champ = championTeamId ? byId.get(championTeamId) : null
  const board = BOARD[boardStatus]

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
    <div className="mx-auto max-w-5xl">
      {champ && (
        <div className="card mb-4 p-4 text-center" style={{ background: 'linear-gradient(135deg,#3a2408,#0c0f10)', border: '1px solid var(--color-gold)' }}>
          <div className="text-lg font-black" style={{ color: 'var(--color-gold)' }}>🏆 {champ.name} — Campeão da Temporada</div>
        </div>
      )}

      <div className="card mb-4 flex items-center gap-4 p-5">
        <TeamCrest abbr={team.abbr} colors={team.colors} size={64} />
        <div className="flex-1">
          <div className="text-2xl font-black">{team.name} {team.nickname}</div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {team.conference} {team.division} · {team.divisionRank}º na divisão · HC {snapshot.save.coachName}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black">{recordStr(team.wins, team.losses, team.ties)}</div>
          <div className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold" style={{ background: board.bg, color: board.color }}>{board.label}</div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <FinanceCard label="Cap Space" value={money(finance.capSpace)} accent={finance.capSpace >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} />
        <FinanceCard label="Cap Hit Total" value={money(finance.totalCapHit)} />
        <FinanceCard label="Ataque / Defesa" value={`${team.offOverall} / ${team.defOverall}`} />
        <FinanceCard label="Elenco (OVR)" value={String(finance.avgOverall)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="section-title mb-3">Metas da Diretoria</div>
          {objectives.map((o) => <ObjectiveRow key={o.code} o={o} />)}
        </div>
        <div className="card p-4">
          <div className="section-title mb-3">Próximos Jogos</div>
          {nextFixtures.length === 0 && <Empty>Temporada encerrada</Empty>}
          {nextFixtures.map((f) => <FixtureRow key={f.id} f={f} userTeamId={team.id} />)}
          <div className="section-title mb-2 mt-4">Últimos Resultados</div>
          {lastResults.length === 0 && <Empty>Sem jogos ainda</Empty>}
          {lastResults.map((f) => <FixtureRow key={f.id} f={f} userTeamId={team.id} />)}
        </div>
      </div>

      <div className="card mt-4 p-4">
        <div className="section-title mb-3">Divisão — {team.conference} {team.division}</div>
        <table className="w-full text-sm">
          <tbody>
            {myDivision.map((s) => (
              <tr key={s.teamId} style={s.teamId === team.id ? { color: 'var(--color-accent)', fontWeight: 700 } : undefined}>
                <td className="py-1">{s.position}</td>
                <td><TeamCrest abbr={s.abbr} colors={s.colors} size={20} /></td>
                <td className="pl-2">{s.name}</td>
                <td className="text-right">{recordStr(s.wins, s.losses, s.ties)}</td>
                <td className="pl-3 text-right" style={{ color: 'var(--color-text-muted)' }}>{s.pointDiff >= 0 ? '+' : ''}{s.pointDiff}</td>
                <td className="pl-3"><FormPills last5={s.last5} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const OBJ_COLOR: Record<ObjectiveView['status'], string> = {
  met: 'var(--color-positive)', failed: 'var(--color-negative)', ontrack: 'var(--color-accent)',
  atrisk: 'var(--color-warning)', pending: 'var(--color-text-muted)'
}
const OBJ_ICON: Record<ObjectiveView['status'], string> = { met: '✓', failed: '✗', ontrack: '▲', atrisk: '!', pending: '·' }

function ObjectiveRow({ o }: { o: ObjectiveView }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <div>
        <div className="text-sm font-semibold">
          {o.kind === 'primary' && <span style={{ color: 'var(--color-gold)' }}>★ </span>}{o.label}
        </div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{o.detail}</div>
      </div>
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-black" style={{ background: OBJ_COLOR[o.status], color: '#0c0f10' }}>{OBJ_ICON[o.status]}</span>
    </div>
  )
}

function FinanceCard({ label, value, accent }: { label: string; value: string; accent?: string }): React.JSX.Element {
  return (
    <div className="card p-3 text-center">
      <div className="text-xl font-black" style={{ color: accent ?? 'var(--color-accent)' }}>{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  )
}

function FixtureRow({ f, userTeamId }: { f: FixtureView; userTeamId: string }): React.JSX.Element {
  const played = f.status === 'played'
  const userWon = played && ((f.homeTeamId === userTeamId && (f.homeScore ?? 0) > (f.awayScore ?? 0)) || (f.awayTeamId === userTeamId && (f.awayScore ?? 0) > (f.homeScore ?? 0)))
  const dot = played ? (userWon ? 'var(--color-positive)' : f.homeScore === f.awayScore ? 'var(--color-text-muted)' : 'var(--color-negative)') : 'transparent'
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span>{f.homeAbbr} vs {f.awayAbbr}</span>
      </span>
      <span style={{ color: 'var(--color-text-muted)' }}>{played ? `${f.homeScore}-${f.awayScore}` : `Sem ${f.week}`}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="py-3 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>{children}</div>
}
