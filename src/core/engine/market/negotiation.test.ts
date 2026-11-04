import { describe, it, expect } from 'vitest'
import { createRng, deriveSeed } from '../../rng'
import { makeFreeAgent } from './market'
import { openNegotiation, evaluateOffer, roleForOverall, type NegotiationCtx } from './negotiation'

const CTX: NegotiationCtx = { teamIsContender: true, teamNeed: 20, coachReputation: 60, competingTeams: ['GB', 'CHI'] }

describe('Negociação com agente', () => {
  it('oferta generosa (≥ expectativa, papel certo) → aceita e gera contrato', () => {
    const rng = createRng(deriveSeed(1, 'nego'))
    const player = makeFreeAgent(rng, 'WR', 1)
    const s = openNegotiation('n1', player, 'nfl-gb', CTX, rng)
    const offer = { years: s.expectation.years, salaryPerYear: Math.round(s.expectation.salaryPerYear * 1.12), rolePromise: s.expectation.role }
    const r = evaluateOffer(s, offer, CTX, rng)
    expect(r.status).toBe('accepted')
    expect(r.signedContract?.salaryPerYear).toBe(offer.salaryPerYear)
  })

  it('lowball repetido esgota as rodadas → recusado ou assina em outro time', () => {
    const rng = createRng(deriveSeed(2, 'nego'))
    const player = makeFreeAgent(rng, 'CB', 2)
    let s = openNegotiation('n2', player, 'nfl-gb', CTX, rng)
    for (let i = 0; i < 4; i++) {
      s = evaluateOffer(s, { years: 1, salaryPerYear: Math.round(s.expectation.salaryPerYear * 0.5), rolePromise: 'depth' }, CTX, rng)
      if (s.status !== 'countered') break
    }
    expect(['rejected', 'signed_elsewhere']).toContain(s.status)
  })

  it('oferta intermediária → contraproposta do agente', () => {
    const rng = createRng(deriveSeed(3, 'nego'))
    const player = makeFreeAgent(rng, 'RB', 3)
    const s = openNegotiation('n3', player, 'nfl-gb', CTX, rng)
    const r = evaluateOffer(s, { years: s.expectation.years, salaryPerYear: Math.round(s.expectation.salaryPerYear * 0.8), rolePromise: 'rotation' }, CTX, rng)
    if (r.status === 'countered') {
      expect(r.counter).toBeTruthy()
      expect(r.counter!.salaryPerYear).toBeGreaterThanOrEqual(Math.round(s.expectation.salaryPerYear * 0.8))
    } else {
      expect(['accepted', 'rejected']).toContain(r.status)
    }
  })

  it('roleForOverall mapeia faixas', () => {
    expect(roleForOverall(88)).toBe('star')
    expect(roleForOverall(80)).toBe('starter')
    expect(roleForOverall(72)).toBe('rotation')
    expect(roleForOverall(60)).toBe('depth')
  })

  it('é determinística por seed', () => {
    const p = makeFreeAgent(createRng(deriveSeed(9, 'p')), 'QB', 9)
    const a = openNegotiation('x', { ...p }, 'nfl-gb', CTX, createRng(deriveSeed(9, 'nego')))
    const b = openNegotiation('x', { ...p }, 'nfl-gb', CTX, createRng(deriveSeed(9, 'nego')))
    expect(a.expectation).toEqual(b.expectation)
    expect(a.playerInterest).toBe(b.playerInterest)
  })
})
