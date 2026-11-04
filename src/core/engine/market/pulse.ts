import type { Rng } from '../../rng'
import type { MarketListing, MarketListingType, MarketPulse, MarketSource, Player, Position, SeasonPhase } from '../../domain/types'
import { makeFreeAgent } from './market'
import { ensurePersona } from './persona'
import { buildPlayer } from '../generation/generate'
import { FIRST_NAMES, LAST_NAMES } from '../generation/names'

/**
 * Market Pulse Engine (§10B.2/10B.8). Rotaciona o mercado de forma determinística
 * após cada jogo/semana: expira oportunidades, cria novas de fontes narrativas e
 * recalcula o "pulso" (volatility/heat/deadline/media). Puro — sem I/O.
 */

const MAX_LISTINGS = 22
const POS_POOL: Position[] = [
  'QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'DE', 'DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'CB', 'FS', 'SS', 'K', 'P'
]

export interface RotationConfig {
  expireMin: number
  expireMax: number
  newMin: number
  newMax: number
  youngTalentChance: number
  agentPitchChance: number
}

export const MARKET_ROTATION: Record<'regular' | 'afterInjury' | 'deadline', RotationConfig> = {
  regular: { expireMin: 3, expireMax: 6, newMin: 4, newMax: 8, youngTalentChance: 0.18, agentPitchChance: 0.28 },
  afterInjury: { expireMin: 2, expireMax: 5, newMin: 5, newMax: 9, youngTalentChance: 0.22, agentPitchChance: 0.4 },
  deadline: { expireMin: 6, expireMax: 12, newMin: 10, newMax: 18, youngTalentChance: 0.2, agentPitchChance: 0.55 }
}

export interface RotateCtx {
  rng: Rng
  seasonNumber: number
  week: number
  phase: SeasonPhase
  totalWeeks: number
  isTradeDeadline: boolean
  hadMajorInjury: boolean
  otherAbbrs: string[]
  nextId: number
}

export interface RotateResult {
  listings: MarketListing[]
  newFreeAgents: Player[]
  pulse: MarketPulse
  nextId: number
}

const SOURCE_LABEL: Record<MarketSource, string> = {
  agent_call: 'ligação de agente',
  media_rumor: 'rumor da mídia',
  scout_tip: 'dica de olheiro',
  locker_room_noise: 'clima de vestiário',
  injury_replacement: 'reposição de lesão',
  deadline_push: 'movimento de deadline',
  retirement_watch: 'especulação de retorno',
  waiver_wire: 'waiver wire',
  practice_squad_report: 'practice squad',
  college_showcase: 'vitrine universitária'
}

function makeYoungTalent(rng: Rng, position: Position, idx: number): Player {
  const overallTarget = Math.round(rng.triangular(56, 74, 63))
  const potential = Math.min(99, overallTarget + Math.round(rng.triangular(8, 26, 16)))
  const age = Math.round(rng.triangular(21, 24, 22))
  const p = buildPlayer(
    rng,
    {
      teamId: 'free-agent', firstName: rng.pick(FIRST_NAMES), lastName: rng.pick(LAST_NAMES),
      age, nationality: 'USA', position, overallTarget, potential,
      jerseyNumber: rng.int(1, 99), traits: [], secondaryPositions: []
    },
    idx
  )
  p.id = `yt-${idx}-${p.lastName}`
  p.potential = potential
  return p
}

function pickSource(rng: Rng, type: MarketListingType, hadInjury: boolean): MarketSource {
  if (hadInjury && rng.chance(0.5)) return 'injury_replacement'
  if (type === 'agent_pitch') return 'agent_call'
  if (type === 'young_talent') return rng.pick(['scout_tip', 'college_showcase', 'practice_squad_report'] as const)
  return rng.pick(['agent_call', 'media_rumor', 'scout_tip'] as const)
}

function configFor(ctx: RotateCtx): RotationConfig {
  if (ctx.isTradeDeadline) return MARKET_ROTATION.deadline
  if (ctx.hadMajorInjury) return MARKET_ROTATION.afterInjury
  return MARKET_ROTATION.regular
}

export function rotateMarket(current: MarketListing[], ctx: RotateCtx): RotateResult {
  const { rng } = ctx
  const cfg = configFor(ctx)
  let nextId = ctx.nextId

  // 1. envelhece e expira naturalmente
  let listings = current
    .map((l) => ({ ...l, expiresInGames: l.expiresInGames - 1 }))
    .filter((l) => l.expiresInGames > 0)

  // 2. força expiração extra (churn) removendo os mais próximos de expirar
  const forceExpire = Math.min(listings.length, rng.int(cfg.expireMin, cfg.expireMax))
  if (forceExpire > 0) {
    listings = [...listings].sort((a, b) => a.expiresInGames - b.expiresInGames).slice(forceExpire)
  }

  // 3. cria novas oportunidades
  const newFreeAgents: Player[] = []
  const stories: string[] = []
  const nNew = rng.int(cfg.newMin, cfg.newMax)
  for (let i = 0; i < nNew; i++) {
    const type: MarketListingType = rng.chance(cfg.youngTalentChance)
      ? 'young_talent'
      : rng.chance(cfg.agentPitchChance)
        ? 'agent_pitch'
        : 'free_agent'
    const position = rng.pick(POS_POOL)
    const player = type === 'young_talent' ? makeYoungTalent(rng, position, nextId) : makeFreeAgent(rng, position, nextId)
    ensurePersona(rng, player)
    nextId++
    const source = pickSource(rng, type, ctx.hadMajorInjury)
    const interested = rng.shuffle(ctx.otherAbbrs).slice(0, rng.int(0, Math.min(3, ctx.otherAbbrs.length)))
    listings.push({
      id: `ml-${ctx.seasonNumber}-${ctx.week}-${i}-${nextId}`,
      type,
      source,
      player,
      createdSeason: ctx.seasonNumber,
      createdWeek: ctx.week,
      expiresInGames: rng.int(2, 5),
      urgency: rng.int(30, 92),
      interestedTeams: interested
    })
    newFreeAgents.push(player)
    if (stories.length < 3 && rng.chance(0.6)) {
      const label = type === 'young_talent' ? 'jovem promessa' : type === 'agent_pitch' ? 'agente oferece' : 'no mercado'
      stories.push(`${player.firstName} ${player.lastName} (${player.position}, ${player.overall} OVR) — ${label} via ${SOURCE_LABEL[source]}.`)
    }
  }

  // 4. teto de listagens (remove as mais antigas)
  if (listings.length > MAX_LISTINGS) {
    listings = listings.sort((a, b) => b.expiresInGames - a.expiresInGames).slice(0, MAX_LISTINGS)
  }

  // 5. pulso
  const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))
  const deadlinePressure = ctx.isTradeDeadline
    ? 100
    : clamp((100 * Math.max(0, ctx.week - ctx.totalWeeks * 0.4)) / Math.max(1, ctx.totalWeeks * 0.5))
  const volatility = clamp((forceExpire + nNew) * 5 + (ctx.hadMajorInjury ? 20 : 0) + (ctx.isTradeDeadline ? 30 : 0))
  const heat = clamp(stories.length * 16 + nNew * 3 + deadlinePressure * 0.2)
  const mediaIntensity = clamp((heat + volatility) / 2)

  const pulse: MarketPulse = {
    seasonNumber: ctx.seasonNumber,
    week: ctx.week,
    phase: ctx.phase,
    volatility,
    heat,
    deadlinePressure,
    mediaIntensity,
    stories
  }
  return { listings, newFreeAgents, pulse, nextId }
}
