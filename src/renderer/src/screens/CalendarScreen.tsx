import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/gameStore'
import { PHASE_LABEL } from '../lib/format'
import { ControlModeSelector } from '../components/ControlModeSelector'
import type { AdvanceResult, FixtureView } from '@shared/ipc/contract'

export function CalendarScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const advancing = useGameStore((s) => s.advancing)
  const advanceWeek = useGameStore((s) => s.advanceWeek)
  const newSeason = useGameStore((s) => s.newSeason)
  const [last, setLast] = useState<AdvanceResult | null>(null)
  const navigate = useNavigate()

  if (!snapshot) return null
  const phase = snapshot.save.phase
  const finished = phase === 'finished'
  const off = snapshot.offseason
  const inOffseason = finished || !!off?.active
  const draftNeedsAction = phase === 'draft' && !off?.draftCompleted
  const byId = new Map(snapshot.standings.map((s) => [s.teamId, s]))
  const champ = snapshot.championTeamId ? byId.get(snapshot.championTeamId) : null

  const onAdvance = async (): Promise<void> => {
    const res = await advanceWeek()
    if (res) {
      if (res.advanced) setLast(res)
      if (res.userGameId) navigate(`/game-day/${res.userGameId}`)
    }
  }

  const advanceLabel =
    phase === 'regular' ? `Jogar Semana ${snapshot.save.week}`
      : phase === 'finished' ? 'Iniciar Offseason'
      : phase === 'offseason' ? 'Ir ao Draft'
      : phase === 'draft' ? 'Avançar → Free Agency'
      : phase === 'free_agency' ? 'Abrir Pré-Temporada'
      : phase === 'pre_season' ? `Começar Temporada ${snapshot.save.seasonNumber + 1}`
      : `Jogar ${PHASE_LABEL[phase]}`

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card mb-4 flex items-center justify-between p-5">
        <div>
          <div className="section-title">{PHASE_LABEL[phase]}</div>
          <div className="text-2xl font-black">{inOffseason ? `Offseason → Temporada ${snapshot.save.seasonNumber + 1}` : `Semana ${snapshot.save.week}`}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {draftNeedsAction ? (
            <button className="btn-neon rounded-md px-6 py-3 font-bold" onClick={() => navigate('/game/draft')}>Ir ao Draft Night</button>
          ) : (
            <button className="btn-neon rounded-md px-6 py-3 font-bold disabled:opacity-40" disabled={advancing} onClick={onAdvance}>
              {advancing ? 'Processando...' : advanceLabel}
            </button>
          )}
          {inOffseason && (
            <button className="rounded-md px-4 py-1.5 text-xs font-bold disabled:opacity-40" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }} disabled={advancing} onClick={() => newSeason()}>
              {advancing ? '...' : `Pular Offseason → Temporada ${snapshot.save.seasonNumber + 1}`}
            </button>
          )}
        </div>
      </div>

      {!inOffseason && (
        <div className="card mb-4 p-4">
          <div className="section-title mb-2">Controle da Partida</div>
          <ControlModeSelector />
        </div>
      )}

      {champ && (
        <div className="card mb-4 p-4 text-center" style={{ background: 'linear-gradient(135deg,#3a2408,#0c0f10)', border: '1px solid var(--color-gold)' }}>
          <div className="text-lg font-black" style={{ color: 'var(--color-gold)' }}>🏆 {champ.name} venceu o {PHASE_LABEL.championship}!</div>
        </div>
      )}

      {last?.userFixture && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="section-title">Seu último jogo</div>
            {last.userGameId && (
              <button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={() => navigate(`/game-day/${last.userGameId}`)}>▶ Reassistir</button>
            )}
          </div>
          <BigFixture f={last.userFixture} userId={snapshot.team.id} />
        </div>
      )}
      {last && !last.userFixture && !finished && (
        <div className="card mb-4 p-3 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {last.message || 'Semana de bye — sem jogo'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="section-title mb-3">Próximos</div>
          {snapshot.nextFixtures.length === 0 && <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>—</div>}
          {snapshot.nextFixtures.map((f) => <Line key={f.id} f={f} userId={snapshot.team.id} />)}
        </div>
        <div className="card p-4">
          <div className="section-title mb-3">Recentes</div>
          {snapshot.lastResults.map((f) => <Line key={f.id} f={f} userId={snapshot.team.id} />)}
        </div>
      </div>
    </div>
  )
}

function BigFixture({ f, userId }: { f: FixtureView; userId: string }): React.JSX.Element {
  const win = (f.homeTeamId === userId && (f.homeScore ?? 0) > (f.awayScore ?? 0)) || (f.awayTeamId === userId && (f.awayScore ?? 0) > (f.homeScore ?? 0))
  const tie = f.homeScore === f.awayScore
  return (
    <div className="flex items-center justify-between">
      <span className="text-lg font-bold">{f.homeAbbr}</span>
      <span className="text-3xl font-black">{f.homeScore} — {f.awayScore}</span>
      <span className="text-lg font-bold">{f.awayAbbr}</span>
      <span className="ml-3 rounded px-2 py-1 text-xs font-bold" style={{ background: tie ? 'var(--color-text-muted)' : win ? 'var(--color-positive)' : 'var(--color-negative)', color: '#0c0f10' }}>
        {tie ? 'EMPATE' : win ? 'VITÓRIA' : 'DERROTA'}
      </span>
    </div>
  )
}

function Line({ f, userId }: { f: FixtureView; userId: string }): React.JSX.Element {
  const home = f.homeTeamId === userId
  const opp = home ? f.awayAbbr : f.homeAbbr
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <span>{home ? 'vs' : '@'} {opp}</span>
      <span style={{ color: 'var(--color-text-muted)' }}>{f.status === 'played' ? `${f.homeScore}-${f.awayScore}` : `Sem ${f.week}`}</span>
    </div>
  )
}
