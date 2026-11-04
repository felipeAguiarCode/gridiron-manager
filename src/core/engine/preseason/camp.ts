import type { Rng } from '../../rng'
import type { Player, Position, PositionBattle, TrainingCampFocus } from '../../domain/types'

/** Efeitos do training camp (§10B.7) — forma/moral/pequenos ganhos + risco de lesão. */

const OL: Position[] = ['LT', 'LG', 'C', 'RG', 'RT']
const DL: Position[] = ['DE', 'DT', 'NT']
const DB: Position[] = ['CB', 'FS', 'SS']

export const CAMP_FOCUS_LABEL: Record<TrainingCampFocus, string> = {
  rookie_development: 'Desenvolvimento de Rookies',
  conditioning: 'Condicionamento',
  scheme_installation: 'Instalação de Scheme',
  playbook_installation: 'Instalação de Playbook',
  qb_timing: 'Timing de Passe (QB/WR/TE)',
  ol_cohesion: 'Coesão da Linha Ofensiva',
  pass_rush: 'Pass Rush (DL/OLB)',
  secondary_communication: 'Comunicação do Secundário',
  special_teams: 'Times Especiais'
}

export interface CampResult {
  players: Player[]
  summary: string
  injured: string[]
  touched: number
}

export function applyCamp(focus: TrainingCampFocus, roster: Player[], rng: Rng): CampResult {
  const players: Player[] = []
  const injured: string[] = []
  let touched = 0

  for (const p of roster) {
    let np: Player = { ...p }
    const isRookie = p.yearsPro === 0
    const boost = (n: number): void => {
      np = { ...np, form: Math.min(99, np.form + n), morale: Math.min(99, np.morale + Math.round(n / 2)) }
      touched++
    }
    switch (focus) {
      case 'rookie_development':
        if (isRookie) { boost(6); if (rng.chance(0.4)) np = { ...np, overall: Math.min(np.potential, np.overall + 1) } }
        break
      case 'conditioning': np = { ...np, fatigue: 0, form: Math.min(99, np.form + 3) }; touched++; break
      case 'scheme_installation': boost(2); break
      case 'playbook_installation': boost(2); break // +familiaridade tratada no serviço (meta)
      case 'qb_timing': if (['QB', 'WR', 'TE'].includes(p.position)) boost(5); break
      case 'ol_cohesion': if (OL.includes(p.position)) boost(5); break
      case 'pass_rush': if (DL.includes(p.position) || p.position === 'OLB') boost(5); break
      case 'secondary_communication': if (DB.includes(p.position)) boost(5); break
      case 'special_teams': if (['K', 'P', 'LS'].includes(p.position)) boost(7); break
    }
    if (rng.chance(0.012)) {
      np = { ...np, injuryWeeks: Math.max(np.injuryWeeks, rng.int(1, 3)) }
      injured.push(`${p.firstName} ${p.lastName}`)
    }
    players.push(np)
  }
  return {
    players,
    injured,
    touched,
    summary: `Camp focado em ${CAMP_FOCUS_LABEL[focus]}: ${touched} jogadores impactados${injured.length ? `, ${injured.length} lesão(ões) no camp` : ''}.`
  }
}

const KEY_POS: Position[] = ['QB', 'RB', 'WR', 'TE', 'LT', 'DE', 'CB', 'K']

/** Resolve disputas de posição (§10B.7): titular por overall+potencial+forma. */
export function resolveBattles(roster: Player[], rng: Rng): PositionBattle[] {
  const battles: PositionBattle[] = []
  for (const pos of KEY_POS) {
    const atPos = roster.filter((p) => p.position === pos).sort((a, b) => b.overall - a.overall)
    if (atPos.length < 2 || atPos[0].overall - atPos[1].overall > 6) continue // sem disputa real
    const contenders = atPos.slice(0, 3)
      .map((p) => ({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        overall: p.overall,
        score: Math.round(p.overall * 0.6 + p.potential * 0.15 + p.form * 0.15 + rng.gaussian(0, 4))
      }))
      .sort((a, b) => b.score - a.score)
    battles.push({
      position: pos,
      contenders,
      leaderId: contenders[0].playerId,
      intensity: Math.max(0, Math.min(100, 100 - (contenders[0].score - contenders[1].score) * 8))
    })
  }
  return battles
}
