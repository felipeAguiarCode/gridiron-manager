import { describe, it, expect } from 'vitest'
import { createRng, deriveSeed } from '../../rng'
import { makeFreeAgent } from '../market/market'
import { applyCamp, resolveBattles } from './camp'
import type { Player } from '../../domain/types'

function roster(seed: number): Player[] {
  const positions = ['QB', 'QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'LT', 'DE', 'CB', 'CB', 'K'] as const
  return positions.map((pos, i) => makeFreeAgent(createRng(deriveSeed(seed, 'p', i)), pos, i))
}

describe('Pré-temporada: camp & battles (M7.4)', () => {
  it('camp de OL só melhora a forma dos linemen', () => {
    const r = roster(1)
    const before = new Map(r.map((p) => [p.id, p.form]))
    const res = applyCamp('ol_cohesion', r, createRng(deriveSeed(1, 'camp')))
    const lt = res.players.find((p) => p.position === 'LT')!
    const wr = res.players.find((p) => p.position === 'WR')!
    expect(lt.form).toBeGreaterThan(before.get(lt.id)!)
    expect(wr.form).toBe(before.get(wr.id)!)
  })

  it('resolveBattles retorna disputas com líder', () => {
    const battles = resolveBattles(roster(3), createRng(deriveSeed(3, 'b')))
    for (const b of battles) {
      expect(b.contenders.length).toBeGreaterThanOrEqual(2)
      expect(b.leaderId).toBe(b.contenders[0].playerId)
      expect(b.intensity).toBeGreaterThanOrEqual(0)
      expect(b.intensity).toBeLessThanOrEqual(100)
    }
  })

  it('é determinístico por seed', () => {
    const a = applyCamp('qb_timing', roster(9), createRng(deriveSeed(9, 'camp')))
    const b = applyCamp('qb_timing', roster(9), createRng(deriveSeed(9, 'camp')))
    expect(a.players.map((p) => p.form)).toEqual(b.players.map((p) => p.form))
  })
})
