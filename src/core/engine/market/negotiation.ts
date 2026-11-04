import type { Rng } from '../../rng'
import type { ContractOffer, DepthRole, NegotiationSession, Player, PlayerPersona } from '../../domain/types'
import { ensurePersona } from './persona'

/**
 * Negociação com agente (§10B.5), modelo de contrato simples: anos + salário +
 * função prometida. Puro/determinístico — `main` só persiste a sessão.
 */

const ROLE_RANK: Record<DepthRole, number> = { star: 3, starter: 2, rotation: 1, depth: 0 }
const ROLES: DepthRole[] = ['depth', 'rotation', 'starter', 'star']

export function roleForOverall(overall: number): DepthRole {
  if (overall >= 85) return 'star'
  if (overall >= 78) return 'starter'
  if (overall >= 70) return 'rotation'
  return 'depth'
}

export interface NegotiationCtx {
  teamIsContender: boolean
  teamNeed: number // 0-40 (needScore)
  coachReputation: number // 0-100
  competingTeams: string[]
}

function baseExpectation(player: Player, persona: PlayerPersona): NegotiationSession['expectation'] {
  const role = roleForOverall(player.overall)
  let salary = player.capHit
  if (persona === 'money_first' || persona === 'mercenary') salary *= 1.15
  if (persona === 'ring_chaser' || persona === 'mentor' || persona === 'loyal_veteran') salary *= 0.9
  // anos: jovens querem mais; veteranos 1-2
  let years = player.age <= 26 ? 4 : player.age <= 30 ? 3 : player.age <= 33 ? 2 : 1
  if (persona === 'money_first') years = Math.min(5, years + 1)
  if (persona === 'prove_it') years = Math.max(1, years - 2)
  return { years, salaryPerYear: Math.round(salary), role }
}

export function openNegotiation(id: string, player: Player, teamId: string, ctx: NegotiationCtx, rng: Rng): NegotiationSession {
  const persona = ensurePersona(rng, player)
  const expectation = baseExpectation(player, persona)
  const wantsContender = persona === 'ring_chaser' || persona === 'spotlight_star'
  const interest = Math.round(46 + (ctx.teamIsContender && wantsContender ? 14 : 0) + ctx.coachReputation * 0.06)
  const competing = ctx.competingTeams.slice(0, rng.int(0, Math.min(3, ctx.competingTeams.length)))
  return {
    id,
    playerId: player.id,
    teamId,
    status: 'open',
    round: 0,
    maxRounds: 4,
    playerInterest: Math.max(0, Math.min(100, interest)),
    agentPatience: 100,
    persona,
    expectation,
    competingTeams: competing,
    agentLine: agentIntro(persona, expectation)
  }
}

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(v)))

export function evaluateOffer(session: NegotiationSession, offer: ContractOffer, ctx: NegotiationCtx, rng: Rng): NegotiationSession {
  const exp = session.expectation
  const persona = session.persona
  const round = session.round + 1

  const moneyRatio = offer.salaryPerYear / Math.max(1, exp.salaryPerYear)
  let moneyScore = Math.max(-45, Math.min(42, (moneyRatio - 1) * 62))
  if (persona === 'money_first' || persona === 'mercenary') moneyScore *= 1.3

  const offeredRole = offer.rolePromise ?? 'depth'
  const roleDelta = ROLE_RANK[offeredRole] - ROLE_RANK[exp.role]
  let roleScore = offer.rolePromise === undefined ? -6 : roleDelta >= 0 ? 12 + roleDelta * 4 : roleDelta * 16
  if (persona === 'prove_it' || persona === 'spotlight_star') roleScore *= 1.4

  const yearsScore = -Math.abs(offer.years - exp.years) * 4 + (persona === 'money_first' && offer.years >= exp.years ? 8 : 0)
  const contenderScore = ctx.teamIsContender ? (persona === 'ring_chaser' ? 20 : persona === 'spotlight_star' ? 10 : 6) : 0

  const interest = clamp(45 + moneyScore + roleScore + yearsScore + contenderScore)

  // paciência cai com rodadas e com lowball
  const lowball = moneyRatio < 0.85 ? (0.85 - moneyRatio) * 120 : 0
  const patience = clamp(session.agentPatience - 18 - lowball - session.competingTeams.length * 6)

  const next: NegotiationSession = { ...session, round, playerInterest: interest, agentPatience: patience, lastOffer: offer, counter: undefined }

  if (interest >= 68 && moneyRatio >= 0.92) {
    next.status = 'accepted'
    next.signedContract = { years: offer.years, salaryPerYear: offer.salaryPerYear, rolePromise: offer.rolePromise ?? exp.role }
    next.agentLine = agentAccept(persona)
    return next
  }
  if (round >= session.maxRounds || patience <= 0) {
    const poached = session.competingTeams.length > 0 && interest < 60 && rng.chance(0.6)
    next.status = poached ? 'signed_elsewhere' : 'rejected'
    next.agentLine = poached ? agentPoached(session.competingTeams[0]) : agentReject(persona)
    return next
  }
  // contraproposta: salário no meio do caminho (puxado p/ a expectativa), função ≥ esperada
  const counterSalary = Math.round(Math.max(offer.salaryPerYear, (offer.salaryPerYear + exp.salaryPerYear * 1.05) / 2) / 100_000) * 100_000
  const counterRole = ROLES[Math.max(ROLE_RANK[offeredRole], ROLE_RANK[exp.role])]
  next.status = 'countered'
  next.counter = { years: exp.years, salaryPerYear: counterSalary, rolePromise: counterRole }
  next.agentLine = agentCounter(persona, interest)
  return next
}

// ---------------------------------------------------- falas do agente (flavor)

const money = (n: number): string => `$${(n / 1_000_000).toFixed(1)}M`

function agentIntro(persona: PlayerPersona, exp: NegotiationSession['expectation']): string {
  const role = exp.role === 'star' ? 'protagonista' : exp.role === 'starter' ? 'titular' : exp.role === 'rotation' ? 'de rotação' : 'de elenco'
  if (persona === 'money_first') return `Meu cliente ouve, mas o número tem que ser sério. Pensamos em ${exp.years} anos na casa de ${money(exp.salaryPerYear)}/ano.`
  if (persona === 'ring_chaser') return `Ele quer ganhar. Se o projeto for de contender, dá pra conversar em torno de ${money(exp.salaryPerYear)}/ano.`
  if (persona === 'prove_it') return `Contrato curto e chance de jogar. Um papel ${role} e ${money(exp.salaryPerYear)}/ano abrem a conversa.`
  return `Vamos ouvir sua proposta. A expectativa é ${exp.years} anos, ${money(exp.salaryPerYear)}/ano, papel ${role}.`
}
function agentCounter(persona: PlayerPersona, interest: number): string {
  if (interest < 45) return persona === 'money_first' ? 'Longe do que buscamos — o valor precisa subir bastante.' : 'Isso não chega perto. Meu cliente esperava mais.'
  if (persona === 'spotlight_star') return 'Está perto, mas ele não veio para ser peça de rotação. Garanta o papel e fechamos.'
  return 'Estamos quase lá. Ajuste um pouco e temos acordo.'
}
function agentAccept(persona: PlayerPersona): string {
  if (persona === 'ring_chaser') return 'Fechado. Ele vem para buscar o anel com vocês.'
  if (persona === 'money_first') return 'Números certos. Podem preparar o contrato.'
  return 'Temos um acordo. Bem-vindo ao elenco.'
}
function agentReject(persona: PlayerPersona): string {
  if (persona === 'fragile_ego') return 'Encerramos. Meu cliente não se sentiu valorizado.'
  return 'Não vamos chegar a um número. Encerramos por aqui.'
}
function agentPoached(teamAbbr: string): string {
  return `Chegou tarde — ${teamAbbr} fechou com ele antes.`
}
