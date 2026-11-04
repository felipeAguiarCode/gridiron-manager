import { describe, it, expect } from 'vitest'
import { ALL_PLAYS, getPlay } from '@core/engine/playbook/plays'
import { synthesizePlay } from './playDiagram'

describe('synthesizePlay', () => {
  it('gera markers + rotas válidas para toda a biblioteca', () => {
    for (const play of ALL_PLAYS) {
      const g = synthesizePlay(play)
      expect(g.markers.length, play.id).toBeGreaterThan(0)
      expect(g.routes.length, play.id).toBeGreaterThan(0)
      expect(['RUN', 'PASS', 'DEF', 'ST']).toContain(g.flag)
      // coordenadas finitas e dentro do viewBox 0..100 x 0..62
      const pts = [
        ...g.markers.map((m) => ({ x: m.x, y: m.y })),
        ...g.routes.flatMap((r) => r.points),
        ...(g.zones ?? []).map((z) => ({ x: z.x, y: z.y }))
      ]
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${play.id} coord`).toBe(true)
        expect(p.x, `${play.id} x`).toBeGreaterThanOrEqual(0)
        expect(p.x, `${play.id} x`).toBeLessThanOrEqual(100)
        expect(p.y, `${play.id} y`).toBeGreaterThanOrEqual(0)
        expect(p.y, `${play.id} y`).toBeLessThanOrEqual(62)
      }
    }
  })

  it('Four Verticals → passe com ≥4 rotas verticais', () => {
    const g = synthesizePlay(getPlay('off_four_verticals')!)
    expect(g.flag).toBe('PASS')
    expect(g.routes.filter((r) => r.color === 'downfield').length).toBeGreaterThanOrEqual(4)
  })

  it('Inside Zone → corrida com caminho de portador (primary)', () => {
    const g = synthesizePlay(getPlay('off_inside_zone')!)
    expect(g.flag).toBe('RUN')
    expect(g.routes.some((r) => r.color === 'primary')).toBe(true)
    // 5 setas de bloqueio da OL
    expect(g.markers.filter((m) => m.kind === 'ol').length).toBe(5)
  })

  it('jogada defensiva → flag DEF com defensores', () => {
    const g = synthesizePlay(getPlay('def_cover_2')!)
    expect(g.flag).toBe('DEF')
    expect(g.markers.some((m) => m.kind === 'def')).toBe(true)
    expect(g.zones && g.zones.length).toBeGreaterThan(0) // cover 2 desenha zonas
  })

  it('special teams → flag ST', () => {
    expect(synthesizePlay(getPlay('st_punt')!).flag).toBe('ST')
    expect(synthesizePlay(getPlay('st_field_goal')!).flag).toBe('ST')
  })
})
