import { describe, it, expect } from 'vitest'
import { createRng, deriveSeed } from '../../rng'
import { makeFreeAgent } from './market'
import { pickValue, picksValue, aiEvaluateTradeWithPicks, rotateTradeBlock, seedTeamPicks } from './trade'
import type { Player } from '../../domain/types'

describe('Draft picks & trade block (M7.2)', () => {
  it('seedTeamPicks gera 7 rodadas por ano', () => {
    const picks = seedTeamPicks('nfl-gb', 2, 2)
    expect(picks.length).toBe(14)
    expect(picks.filter((p) => p.season === 2).length).toBe(7)
    expect(picks.every((p) => p.ownerTeamId === 'nfl-gb')).toBe(true)
  })

  it('pickValue: 1ª rodada vale mais que 7ª e futuro é descontado', () => {
    const r1 = { id: 'a', season: 2, round: 1, originalTeamId: 't', ownerTeamId: 't' }
    const r7 = { id: 'b', season: 2, round: 7, originalTeamId: 't', ownerTeamId: 't' }
    const r1future = { id: 'c', season: 4, round: 1, originalTeamId: 't', ownerTeamId: 't' }
    expect(pickValue(r1, 2)).toBeGreaterThan(pickValue(r7, 2))
    expect(pickValue(r1future, 2)).toBeLessThan(pickValue(r1, 2))
    expect(picksValue([r1, r7], 2)).toBe(pickValue(r1, 2) + pickValue(r7, 2))
  })

  it('aiEvaluateTradeWithPicks: picks generosos fecham a troca', () => {
    const rng = createRng(deriveSeed(1, 't'))
    const star = makeFreeAgent(rng, 'WR', 1)
    const roster: Player[] = [makeFreeAgent(rng, 'WR', 2)]
    // usuário oferece 1 pick de valor alto por um jogador
    const lowPick = aiEvaluateTradeWithPicks(roster, [], [star], 1_000_000, 0, Infinity, false)
    const highPick = aiEvaluateTradeWithPicks(roster, [], [star], star.marketValue * 2, 0, Infinity, false)
    expect(lowPick.accept).toBe(false)
    expect(highPick.accept).toBe(true)
  })

  it('rotateTradeBlock adiciona itens e respeita o teto de 16', () => {
    const rng = createRng(deriveSeed(5, 'tb'))
    const teams = Array.from({ length: 6 }, (_, t) => ({
      teamId: `t${t}`,
      players: Array.from({ length: 10 }, (_, i) => makeFreeAgent(createRng(deriveSeed(t, 'r', i)), 'RB', t * 10 + i))
    }))
    let items = rotateTradeBlock([], teams, 1, rng, 3)
    expect(items.length).toBeGreaterThan(0)
    for (let w = 2; w <= 20; w++) items = rotateTradeBlock(items, teams, w, createRng(deriveSeed(5, 'tb', w)), 3)
    expect(items.length).toBeLessThanOrEqual(16)
  })
})
