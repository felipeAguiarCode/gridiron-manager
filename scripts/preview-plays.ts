/**
 * Dev tooling: gera um "contact sheet" HTML com a prancheta de TODAS as jogadas
 * (mesmo render do componente PlayDiagram, em string), pra conferência visual.
 *   npx tsx scripts/preview-plays.ts [arquivo-saida.html]
 */
import { writeFileSync } from 'fs'
import { ALL_PLAYS } from '../src/core/engine/playbook/plays'
import { synthesizePlay, type RouteColor, type Marker } from '../src/renderer/src/lib/playDiagram'

const ROUTE_STROKE: Record<RouteColor, string> = { downfield: '#e4c53b', primary: '#e5533c', block: '#e8edf0' }
const BADGE_FILL: Record<string, string> = { X: '#3b82c4', B: '#e5533c', A: '#3fd07a', H: '#2bb8c4', Y: '#d7b53a', Y2: '#d7b53a', Y3: '#d7b53a' }
const FLAG_COLOR: Record<string, string> = { RUN: '#e5843c', PASS: '#5aa9e6', DEF: '#e5533c', ST: '#9fb0b5' }

function glyph(m: Marker): string {
  if (m.kind === 'ol') {
    return `<g stroke="#e8edf0" stroke-width="1" fill="none" stroke-linecap="round"><line x1="${m.x - 1.6}" y1="${m.y}" x2="${m.x + 1.6}" y2="${m.y}"/><line x1="${m.x}" y1="${m.y}" x2="${m.x}" y2="${m.y + 2}"/></g>`
  }
  const bc = m.badge ? BADGE_FILL[m.badge] : undefined
  const r = m.kind === 'qb' ? 1.9 : 1.7
  const circle = `<circle cx="${m.x}" cy="${m.y}" r="${r}" fill="${bc ? 'rgba(8,11,12,0.85)' : '#e8edf0'}" stroke="${bc ?? '#e8edf0'}" stroke-width="${bc ? 0.8 : 0}"/>`
  const label = m.badge && m.badge !== 'FB' ? `<text x="${m.x}" y="${m.y + 0.9}" text-anchor="middle" font-size="2.4" font-weight="800" fill="${bc ?? '#e8edf0'}">${m.badge.replace(/\d/, '')}</text>` : ''
  return circle + label
}

function svg(playId: string): string {
  const g = synthesizePlay(ALL_PLAYS.find((p) => p.id === playId)!)
  const defs = (Object.keys(ROUTE_STROKE) as RouteColor[]).map((c) =>
    `<marker id="arw-${c}-${playId}" markerWidth="5" markerHeight="5" refX="2.4" refY="2.5" orient="auto-start-reverse"><path d="M0,0 L5,2.5 L0,5 z" fill="${ROUTE_STROKE[c]}"/></marker>`).join('')
  const zones = (g.zones ?? []).map((z) => `<circle cx="${z.x}" cy="${z.y}" r="${z.r}" fill="rgba(90,169,230,0.06)" stroke="rgba(90,169,230,0.5)" stroke-width="0.4" stroke-dasharray="1.6 1.4"/>`).join('')
  const routes = g.routes.map((rt) => {
    const pts = rt.points.map((p) => `${p.x},${p.y}`).join(' ')
    const dash = rt.dashed ? ' stroke-dasharray="1.8 1.6"' : ''
    const mk = rt.arrow ? ` marker-end="url(#arw-${rt.color}-${playId})"` : ''
    return `<polyline points="${pts}" fill="none" stroke="${ROUTE_STROKE[rt.color]}" stroke-width="${rt.color === 'block' ? 0.92 : 1.15}" stroke-linejoin="round" stroke-linecap="round"${dash}${mk}/>`
  }).join('')
  const markers = g.markers.map(glyph).join('')
  const flag = `<text x="2" y="60" font-size="7" font-weight="900" font-style="italic" fill="${FLAG_COLOR[g.flag]}" opacity="0.9">${g.flag}</text>`
  return `<svg viewBox="0 0 100 62" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;background:radial-gradient(120% 120% at 50% 0%,#12181a,#0c1011 60%,#080b0c);border-radius:8px"><defs>${defs}</defs><line x1="4" y1="42" x2="96" y2="42" stroke="rgba(255,255,255,0.16)" stroke-width="0.4"/><line x1="42" y1="38" x2="42" y2="46" stroke="rgba(255,255,255,0.10)" stroke-width="0.3"/><line x1="58" y1="38" x2="58" y2="46" stroke="rgba(255,255,255,0.10)" stroke-width="0.3"/>${zones}${routes}${markers}${flag}</svg>`
}

const bySide = new Map<string, typeof ALL_PLAYS>()
for (const p of ALL_PLAYS) { const a = bySide.get(p.side) ?? []; a.push(p); bySide.set(p.side, a) }

const sections = [...bySide.entries()].map(([side, plays]) => {
  const cards = plays.map((p) =>
    `<div style="border:1px solid #283236;border-radius:10px;overflow:hidden;background:#14191b">${svg(p.id)}<div style="padding:6px;text-align:center;font-size:12px;font-weight:700;color:#fff;background:#2f7d86">${p.name}</div><div style="padding:3px 6px;text-align:center;font-size:9px;color:#6c7d82">${p.formation.replace(/_/g, ' ')} · ${p.personnel} · ${p.tags.join(', ')}</div></div>`).join('')
  return `<h2 style="color:#ff9f1c;font-size:16px;margin:24px 0 10px">${side} — ${plays.length} jogadas</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">${cards}</div>`
}).join('')

const html = `<!doctype html><meta charset="utf-8"><title>Pranchetas — contact sheet</title><body style="margin:0;padding:24px;background:#0c0f10;font-family:system-ui,sans-serif"><h1 style="color:#eef2f4;font-size:22px">Pranchetas de jogada — ${ALL_PLAYS.length} jogadas</h1>${sections}</body>`

const outArg = process.argv[2] ?? 'plays-preview.html'
writeFileSync(outArg, html)
console.log(`Escrito: ${outArg} (${ALL_PLAYS.length} jogadas)`)
