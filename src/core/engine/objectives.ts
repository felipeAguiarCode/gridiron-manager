import type { Rng } from '../rng'
import type { Objective, Standing, Team } from '../domain/types'

/**
 * Objetivos da diretoria por reputação + avaliação contínua de pressão
 * (safe → observed → pressured → ultimatum → fired). Demissão = game over.
 */

export type ObjectiveStatus = 'met' | 'failed' | 'ontrack' | 'atrisk' | 'pending'
export type BoardStatus = 'safe' | 'observed' | 'pressured' | 'ultimatum' | 'fired'

export interface ObjectiveView {
  code: string
  kind: 'primary' | 'secondary'
  label: string
  target: number
  status: ObjectiveStatus
  detail: string
}

/** Vitórias esperadas na temporada regular (17 jogos) por reputação. */
export function expectedWins(reputation: number): number {
  return reputation >= 4 ? 12 : reputation === 3 ? 10 : reputation === 2 ? 8 : 6
}

const PRIMARY: Record<number, { code: string; label: string; target: number }> = {
  4: { code: 'win_title', label: 'Vencer o título', target: 1 },
  3: { code: 'reach_conference', label: 'Chegar à final de conferência', target: 1 },
  2: { code: 'make_playoffs', label: 'Classificar aos playoffs', target: 1 },
  1: { code: 'above_500', label: 'Terminar acima de .500', target: 9 }
}

const SECONDARY_POOL: { code: string; label: string; target: number }[] = [
  { code: 'div_wins', label: 'Vencer 4 jogos divisionais', target: 4 },
  { code: 'not_last', label: 'Não terminar em último na divisão', target: 1 },
  { code: 'win_streak', label: 'Emplacar uma sequência de 3 vitórias', target: 3 }
]

export function generateObjectives(team: Team, rng: Rng): Objective[] {
  const p = PRIMARY[team.reputation] ?? PRIMARY[2]
  const primary: Objective = { id: 'obj-primary', kind: 'primary', code: p.code, label: p.label, target: p.target }
  const pool = rng.shuffle(SECONDARY_POOL)
  const secondaries: Objective[] = pool.slice(0, 2).map((s, i) => ({ id: `obj-sec-${i}`, kind: 'secondary', code: s.code, label: s.label, target: s.target }))
  return [primary, secondaries[0], secondaries[1]]
}

export interface ObjectiveContext {
  standing: Standing
  reputation: number
  divisionRank: number
  madePlayoffs: boolean // teve seed nos playoffs
  reachedConference: boolean // finalista de conferência ou campeão
  champion: boolean
  seasonFinished: boolean
  bestWinStreak: number
}

function playoffZone(zone: Standing['zone']): ObjectiveStatus {
  if (zone === 'division_leader' || zone === 'wildcard') return 'ontrack'
  if (zone === 'bubble') return 'atrisk'
  return 'atrisk'
}

export function evaluateObjective(obj: Objective, ctx: ObjectiveContext): ObjectiveView {
  const s = ctx.standing
  const projWins = s.played > 0 ? Math.round((s.wins / s.played) * 17) : expectedWins(ctx.reputation)
  let status: ObjectiveStatus = 'pending'
  let detail = ''

  switch (obj.code) {
    case 'win_title':
      status = ctx.seasonFinished ? (ctx.champion ? 'met' : 'failed') : playoffZone(s.zone)
      detail = ctx.champion ? 'Campeão!' : ctx.seasonFinished ? 'Não conquistado' : `Projeção ${projWins}-${17 - projWins}`
      break
    case 'reach_conference':
      status = ctx.seasonFinished ? (ctx.reachedConference ? 'met' : 'failed') : playoffZone(s.zone)
      detail = ctx.reachedConference ? 'Final de conferência alcançada' : ctx.seasonFinished ? 'Eliminado antes' : `Projeção ${projWins} vitórias`
      break
    case 'make_playoffs':
      status = ctx.seasonFinished ? (ctx.madePlayoffs ? 'met' : 'failed') : playoffZone(s.zone)
      detail = ctx.madePlayoffs ? 'Classificado' : ctx.seasonFinished ? 'Fora dos playoffs' : s.zone === 'eliminated' ? 'Fora da zona' : 'Na zona de playoff'
      break
    case 'above_500':
      status = ctx.seasonFinished ? (s.wins >= obj.target ? 'met' : 'failed') : projWins >= obj.target ? 'ontrack' : 'atrisk'
      detail = `${s.wins} vitórias (meta ${obj.target})`
      break
    case 'div_wins':
      status = ctx.seasonFinished ? (s.divWins >= obj.target ? 'met' : 'failed') : s.divWins >= obj.target ? 'met' : 'ontrack'
      detail = `${s.divWins}/${obj.target} divisionais`
      break
    case 'not_last':
      status = ctx.seasonFinished ? (ctx.divisionRank < 4 ? 'met' : 'failed') : ctx.divisionRank < 4 ? 'ontrack' : 'atrisk'
      detail = `${ctx.divisionRank}º na divisão`
      break
    case 'win_streak':
      status = ctx.bestWinStreak >= obj.target ? 'met' : ctx.seasonFinished ? 'failed' : 'ontrack'
      detail = `Melhor sequência: ${ctx.bestWinStreak}`
      break
  }
  return { code: obj.code, kind: obj.kind, label: obj.label, target: obj.target, status, detail }
}

/** Status da diretoria a partir do desempenho vs expectativa. */
export function computeBoardStatus(
  standing: Standing,
  reputation: number,
  primaryStatus: ObjectiveStatus,
  seasonFinished: boolean
): BoardStatus {
  const exp = expectedWins(reputation)
  if (seasonFinished) {
    if (primaryStatus === 'failed' && standing.wins <= exp - 4) return 'fired'
    if (primaryStatus === 'failed') return 'ultimatum'
    return 'safe'
  }
  const proj = standing.played > 0 ? (standing.wins / standing.played) * 17 : exp
  const gap = proj - exp
  if (gap >= -1) return 'safe'
  if (gap >= -3) return 'observed'
  if (gap >= -5) return 'pressured'
  return 'ultimatum'
}
