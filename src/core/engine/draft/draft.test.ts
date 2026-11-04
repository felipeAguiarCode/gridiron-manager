import { describe, it, expect } from 'vitest'
import { generateDraftClass } from './class'
import { scoutProspect } from './scouting'

describe('Draft class & scouting (M7.3)', () => {
  it('gera classe determinística com atributos verdadeiros ocultos', () => {
    const a = generateDraftClass(42, 2, 60)
    const b = generateDraftClass(42, 2, 60)
    expect(a.length).toBe(60)
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id))
    expect(a.map((p) => p.trueOverall)).toEqual(b.map((p) => p.trueOverall))
    for (const p of a) {
      expect(p.trueOverall).toBeGreaterThanOrEqual(52)
      expect(p.trueOverall).toBeLessThanOrEqual(90)
      expect(p.projectedRound).toBeGreaterThanOrEqual(1)
      expect(p.projectedRound).toBeLessThanOrEqual(7)
      expect(p.scoutingLevel).toBe(0)
    }
  })

  it('scouting estreita o range e o nível 4 revela o valor exato', () => {
    let p = generateDraftClass(7, 2, 10)[0]
    const initialWidth = p.revealedOverall[1] - p.revealedOverall[0]
    p = scoutProspect(p)
    expect(p.scoutingLevel).toBe(1)
    expect(p.revealedOverall[1] - p.revealedOverall[0]).toBeLessThan(initialWidth)
    while (p.scoutingLevel < 4) p = scoutProspect(p)
    expect(p.scoutingLevel).toBe(4)
    expect(p.revealedOverall).toEqual([p.trueOverall, p.trueOverall])
    expect(p.revealedPotential).toEqual([p.truePotential, p.truePotential])
  })
})
