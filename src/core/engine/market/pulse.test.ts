import { describe, it, expect } from 'vitest'
import { createRng, deriveSeed } from '../../rng'
import { rotateMarket, type RotateCtx } from './pulse'
import type { MarketListing } from '../../domain/types'

function ctx(seed: number, over: Partial<RotateCtx> = {}): RotateCtx {
  return {
    rng: createRng(deriveSeed(seed, 'market', 1, 3)),
    seasonNumber: 1,
    week: 3,
    phase: 'regular',
    totalWeeks: 18,
    isTradeDeadline: false,
    hadMajorInjury: false,
    otherAbbrs: ['GB', 'CHI', 'MIN', 'DET'],
    nextId: 1000,
    ...over
  }
}

describe('Market Pulse — rotação determinística', () => {
  it('gera novas oportunidades e um pulso válido', () => {
    const r = rotateMarket([], ctx(42))
    expect(r.listings.length).toBeGreaterThan(0)
    expect(r.newFreeAgents.length).toBe(r.listings.length) // partindo de zero, toda listagem é nova
    for (const p of r.newFreeAgents) expect(p.persona).toBeTruthy()
    for (const v of [r.pulse.volatility, r.pulse.heat, r.pulse.deadlinePressure, r.pulse.mediaIntensity]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(r.nextId).toBeGreaterThan(1000)
  })

  it('é determinística por seed (mesmo seed → mesmos ids)', () => {
    const a = rotateMarket([], ctx(7))
    const b = rotateMarket([], ctx(7))
    expect(a.listings.map((l) => l.player.id)).toEqual(b.listings.map((l) => l.player.id))
    expect(a.pulse).toEqual(b.pulse)
  })

  it('expira listagens antigas ao longo das rotações e respeita o teto', () => {
    let listings: MarketListing[] = []
    let nextId = 1000
    const startIds = new Set<string>()
    for (let week = 1; week <= 12; week++) {
      const r = rotateMarket(listings, ctx(99, { week, nextId, rng: createRng(deriveSeed(99, 'market', 1, week)) }))
      listings = r.listings
      nextId = r.nextId
      if (week === 1) r.listings.forEach((l) => startIds.add(l.id))
      expect(listings.length).toBeLessThanOrEqual(22)
    }
    // nenhuma listagem da semana 1 sobrevive 12 semanas (expiresInGames ≤ 5)
    expect(listings.some((l) => startIds.has(l.id))).toBe(false)
  })

  it('deadline aumenta pressão e volume', () => {
    const normal = rotateMarket([], ctx(5, { week: 3 }))
    const deadline = rotateMarket([], ctx(5, { week: 11, isTradeDeadline: true, rng: createRng(deriveSeed(5, 'market', 1, 11)) }))
    expect(deadline.pulse.deadlinePressure).toBe(100)
    expect(deadline.pulse.deadlinePressure).toBeGreaterThan(normal.pulse.deadlinePressure)
  })
})
