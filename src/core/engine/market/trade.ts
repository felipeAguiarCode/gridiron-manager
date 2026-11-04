import type { Rng } from '../../rng'
import type { DraftPick, Player, TradeBlockItem, TradeBlockReason } from '../../domain/types'
import { tradeValue, needScore, type TradeEval } from './market'

/** Valor de uma pick por rodada (em $M), descontado por anos até o draft (§10B.16). */
const PICK_BASE_M = [0, 40, 18, 9, 5, 3, 2, 1] // índice = rodada (1-7)

export function pickValue(pick: DraftPick, currentDraftSeason: number): number {
  const base = PICK_BASE_M[pick.round] ?? 1
  const yearsOut = Math.max(0, pick.season - currentDraftSeason)
  return Math.round(base * 1_000_000 * Math.pow(0.8, yearsOut))
}

export function picksValue(picks: DraftPick[], currentDraftSeason: number): number {
  return picks.reduce((s, p) => s + pickValue(p, currentDraftSeason), 0)
}

/** Avaliação de trade da IA incluindo picks como ativos. */
export function aiEvaluateTradeWithPicks(
  aiRoster: Player[], give: Player[], get: Player[], givePicksValue: number, getPicksValue: number,
  aiCapSpace: number, aiHasCap: boolean
): TradeEval {
  const giveValue = give.reduce((s, p) => s + tradeValue(p), 0) + givePicksValue
  const getValue = get.reduce((s, p) => s + tradeValue(p), 0) + getPicksValue
  const needBonus = give.reduce((s, p) => s + needScore(aiRoster, p.position) * 250_000, 0)
  if (aiHasCap) {
    const capDelta = give.reduce((s, p) => s + p.capHit, 0) - get.reduce((s, p) => s + p.capHit, 0)
    if (capDelta > aiCapSpace) return { accept: false, reason: 'A IA não tem espaço de cap para essa troca.' }
  }
  if (get.length > give.length + 1) return { accept: false, reason: 'A IA não desfalca tanto o elenco.' }
  if (giveValue + needBonus >= getValue * 1.05) return { accept: true, reason: 'Proposta aceita.' }
  return { accept: false, reason: 'Valor insuficiente para a IA. Adicione jogadores ou picks.' }
}

const REASONS: TradeBlockReason[] = ['cap_casualty', 'rebuild', 'lost_starting_job', 'contract_dispute', 'scheme_mismatch', 'locker_room_issue', 'veteran_ring_chase', 'rookie_emergence']

/** Rotaciona o trade block: expira antigos e adiciona novos de rosters da IA. */
export function rotateTradeBlock(
  current: TradeBlockItem[],
  aiPlayersByTeam: { teamId: string; players: Player[] }[],
  week: number, rng: Rng, add: number
): TradeBlockItem[] {
  const items = current.map((i) => ({ ...i, expiresInGames: i.expiresInGames - 1 })).filter((i) => i.expiresInGames > 0)
  const onBlock = new Set(items.map((i) => i.playerId))
  for (let k = 0; k < add; k++) {
    const team = rng.pick(aiPlayersByTeam)
    if (!team || !team.players.length) continue
    // jogador "tradeável": nem os 3 melhores do elenco, ainda não no bloco
    const sorted = [...team.players].sort((a, b) => b.overall - a.overall)
    const candidates = sorted.slice(3).filter((p) => !onBlock.has(p.id))
    if (!candidates.length) continue
    const player = rng.pick(candidates)
    onBlock.add(player.id)
    items.push({
      id: `tb-${week}-${k}-${player.id}`,
      playerId: player.id, teamId: team.teamId, reason: rng.pick(REASONS),
      askingValue: Math.round(player.marketValue * (0.85 + rng.next() * 0.4)),
      createdWeek: week, expiresInGames: rng.int(2, 5)
    })
  }
  return items.slice(0, 16)
}

/** Picks iniciais de um time: rounds 1-7 para os próximos `years` drafts. */
export function seedTeamPicks(teamId: string, firstDraftSeason: number, years: number): DraftPick[] {
  const picks: DraftPick[] = []
  for (let y = 0; y < years; y++) {
    const season = firstDraftSeason + y
    for (let round = 1; round <= 7; round++) {
      picks.push({ id: `pick-${teamId}-${season}-r${round}`, season, round, originalTeamId: teamId, ownerTeamId: teamId })
    }
  }
  return picks
}
