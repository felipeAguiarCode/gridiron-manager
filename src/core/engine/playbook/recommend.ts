/**
 * Recomendação de jogadas & play-picker da IA (GDD §8B.15). Puro e determinístico.
 * recommendationScore = situationFit*0.30 + playFamiliarity*0.20 + matchupAdvantage*0.20
 *                       + playerPersonnelFit*0.15 + opponentTendencyCounter*0.15
 */

import type { Rng } from '../../rng'
import type { Quarter } from '../../domain/types'
import type {
  ClockSituation, DownDistanceSituation, FieldZone, PlaybookPlay, PlayCallRecommendation
} from '../../domain/playbook'

export interface PlayCallSituation {
  down: number
  distance: number
  yardline: number // 0-100 (perspectiva do ataque)
  clock: number
  quarter: Quarter
  scoreDiff: number // do ponto de vista do ataque
  downsPerSet: number
}

/** Tendência do adversário contra um conceito (0-1); 0.5 = neutro. Preenchido em M5.8. */
export interface OpponentTendency {
  /** peso 0-1 de o quanto o adversário está preparado contra cada tag de jogada */
  counterByTag?: Record<string, number>
}

export interface PlayScoreContext {
  situation: PlayCallSituation
  familiarity?: Record<string, number> // playId → 0-100
  mastery?: Record<string, number> // playId → 0-100
  opponent?: OpponentTendency
  /** previsibilidade: quantas vezes cada jogada já foi chamada neste jogo */
  usageCount?: Record<string, number>
  /** adaptação (§8B.12): tags do adversário sobre-utilizadas — a defesa favorece jogadas fortes contra elas */
  counterTargets?: string[]
}

export function fieldZoneOf(yardline: number): FieldZone {
  if (yardline >= 95) return 'goal_line'
  if (yardline >= 80) return 'red_zone'
  if (yardline >= 55) return 'opp_territory'
  if (yardline >= 40) return 'midfield'
  if (yardline >= 15) return 'own_territory'
  return 'own_deep'
}

export function downDistanceOf(down: number, distance: number, downsPerSet: number): DownDistanceSituation {
  const last = downsPerSet
  if (down >= last) return distance <= 3 ? 'fourth_short' : 'fourth_long'
  if (down === last - 1) {
    if (distance <= 3) return 'third_short'
    if (distance <= 7) return 'third_medium'
    return 'third_long'
  }
  if (down === 2) return distance <= 3 ? 'second_short' : 'second_long'
  return 'first_down'
}

export function clockSituationOf(quarter: Quarter, clock: number, scoreDiff: number): ClockSituation {
  const q = quarter === 'OT' ? 5 : quarter
  const twoMin = (quarter === 2 || quarter === 4 || quarter === 'OT') && clock <= 120
  if (twoMin) return scoreDiff < 0 ? 'trailing_late' : 'two_minute'
  if (q >= 4 && scoreDiff > 0 && clock <= 300) return 'protect_lead'
  if (q >= 4 && scoreDiff < -8) return 'trailing_late'
  return 'normal'
}

function isRunPlay(play: PlaybookPlay): boolean {
  return play.runPassType === 'run' || play.runPassType === 'option'
}

function fitScore(play: PlaybookPlay, s: PlayCallSituation): number {
  const dd = downDistanceOf(s.down, s.distance, s.downsPerSet)
  const zone = fieldZoneOf(s.yardline)
  const clock = clockSituationOf(s.quarter, s.clock, s.scoreDiff)
  let score = 0.4 // base
  if (play.downDistanceFit.includes(dd)) score += 0.16
  if (play.fieldZoneFit.includes(zone)) score += 0.12
  if (play.clockFit.includes(clock)) score += 0.08

  const run = isRunPlay(play)
  const deep = play.targetDepth === 'deep'
  const short = play.targetDepth === 'short'
  const longSit = dd === 'third_long' || dd === 'fourth_long' || dd === 'second_long'
  const shortSit = dd === 'third_short' || dd === 'fourth_short'

  // apropriação por tipo à situação de descida/distância
  if (longSit) {
    if (run) score -= 0.24
    else score += 0.2
    if (play.targetDepth === 'medium' || deep) score += 0.06
  }
  if (shortSit) {
    if (run || short) score += 0.18
    if (deep) score -= 0.3
  }
  // situações de relógio
  if (clock === 'protect_lead' && run) score += 0.12
  if (clock === 'trailing_late' && !run) score += 0.1
  return Math.max(0, Math.min(1, score))
}

/** Score 0-1 de uma jogada na situação atual. */
export function scorePlay(play: PlaybookPlay, ctx: PlayScoreContext): number {
  const situationFit = fitScore(play, ctx.situation)
  const fam = ctx.familiarity?.[play.id]
  const playFamiliarity = (fam ?? 50) / 100
  // matchupAdvantage: recompensa/risco líquido normalizado
  const matchupAdvantage = Math.max(0, Math.min(1, 0.5 + (play.baseReward - play.baseRisk) / 200))
  const playerPersonnelFit = 0.6 // aproximação (M5.5); refinado com atributos em M5.8
  let opponentTendencyCounter = 0.5
  if (ctx.opponent?.counterByTag) {
    const counters = play.tags.map((t) => ctx.opponent!.counterByTag![t] ?? 0)
    const maxCounter = counters.length ? Math.max(...counters) : 0
    opponentTendencyCounter = Math.max(0, 0.6 - maxCounter * 0.6)
  }
  let score =
    situationFit * 0.3 +
    playFamiliarity * 0.2 +
    matchupAdvantage * 0.2 +
    playerPersonnelFit * 0.15 +
    opponentTendencyCounter * 0.15
  // previsibilidade: penaliza jogada muito repetida (§8B.12)
  const used = ctx.usageCount?.[play.id] ?? 0
  if (used > 2) score *= Math.max(0.6, 1 - (used - 2) * 0.08)
  // adaptação defensiva: bônus a jogadas fortes contra as tags que o adversário abusa
  if (ctx.counterTargets?.length && play.strongAgainst.length) {
    const strong = play.strongAgainst as string[]
    const hits = ctx.counterTargets.filter((t) => strong.includes(t)).length
    if (hits) score += Math.min(0.25, hits * 0.12)
  }
  return Math.max(0, Math.min(1, score))
}

export function riskLabelOf(play: PlaybookPlay): PlayCallRecommendation['riskLabel'] {
  if (play.baseRisk < 30) return 'safe'
  if (play.baseRisk < 55) return 'balanced'
  if (play.baseRisk < 75) return 'aggressive'
  return 'desperate'
}

function reasonFor(play: PlaybookPlay, ctx: PlayScoreContext): string {
  const dd = downDistanceOf(ctx.situation.down, ctx.situation.distance, ctx.situation.downsPerSet)
  if (dd === 'third_long' || dd === 'fourth_long') return `${play.name} ataca o campo aberto nesta situação de jardas longas.`
  if (dd === 'third_short' || dd === 'fourth_short') return `${play.name} é confiável para converter distância curta.`
  if (fieldZoneOf(ctx.situation.yardline) === 'red_zone') return `${play.name} funciona bem na red zone.`
  if (riskLabelOf(play) === 'safe') return `${play.name} é uma opção segura para manter o drive.`
  return `${play.name} equilibra risco e recompensa para a situação.`
}

/** Recomendações ordenadas (melhor primeiro). */
export function recommendPlays(plays: PlaybookPlay[], ctx: PlayScoreContext, n = 5): PlayCallRecommendation[] {
  return plays
    .map((p) => ({ play: p, score: scorePlay(p, ctx) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ play, score }) => ({
      playId: play.id,
      confidence: Math.round(score * 100),
      reason: reasonFor(play, ctx),
      riskLabel: riskLabelOf(play)
    }))
}

/**
 * Play-picker determinístico da IA: amostra ponderada pelo score (favorece as
 * melhores jogadas sem ser 100% previsível). Consome o `rng` fornecido.
 */
export function aiPickPlay(plays: PlaybookPlay[], ctx: PlayScoreContext, rng: Rng): PlaybookPlay | undefined {
  if (!plays.length) return undefined
  const scored = plays.map((p) => ({ p, w: Math.pow(Math.max(0.01, scorePlay(p, ctx)), 3) }))
  const total = scored.reduce((s, x) => s + x.w, 0)
  let r = rng.next() * total
  for (const { p, w } of scored) {
    r -= w
    if (r <= 0) return p
  }
  return scored[scored.length - 1].p
}
