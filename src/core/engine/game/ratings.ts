import type { AttrKey, GameTeam, Player, Position } from '../../domain/types'
import { staminaPct } from '../../domain/types'
import { BALANCE } from './constants'
import { OFFENSE_SCHEMES } from '../scheme/schemes'

/** Modificador de disponibilidade do jogador: stamina × moral × forma. */
export function playerMod(p: Player): number {
  const stam = staminaPct(p.overall, p.fatigue)
  const stamMod = 1 - BALANCE.FATIGUE_MAX_PENALTY * (1 - stam)
  const moraleMod = 1 + (p.morale - 50) / BALANCE.MORALE_SCALE
  const formMod = 1 + (p.form - 50) / BALANCE.FORM_SCALE
  return stamMod * moraleMod * formMod
}

const OL: Position[] = ['LT', 'LG', 'C', 'RG', 'RT']
const REC: Position[] = ['WR', 'TE']
const DL: Position[] = ['DE', 'DT', 'NT']
const LB: Position[] = ['OLB', 'ILB', 'MLB']
const DB: Position[] = ['CB', 'FS', 'SS']

function groupRating(players: Player[], attrs: AttrKey[]): number {
  if (!players.length) return 40
  let sum = 0
  for (const p of players) {
    const a = attrs.reduce((s, k) => s + p.attributes[k], 0) / attrs.length
    sum += a * playerMod(p)
  }
  return sum / players.length
}

function onField(gt: GameTeam, ids: string[]): Player[] {
  return ids.map((id) => gt.players.get(id)).filter((p): p is Player => !!p)
}

function pickGroup(players: Player[], positions: Position[]): Player[] {
  return players.filter((p) => positions.includes(p.position))
}

export interface UnitBaseline {
  passOff: number
  runOff: number
  passDef: number
  runDef: number
}

/** Ratings base por sub-fase (0-99ish), sensíveis a fadiga/moral/forma. */
export function computeBaseline(off: GameTeam, def: GameTeam): UnitBaseline {
  const offP = onField(off, off.depth.offense)
  const defP = onField(def, def.depth.defense)

  const qb = pickGroup(offP, ['QB'])
  const rb = pickGroup(offP, ['RB', 'FB'])
  const rec = pickGroup(offP, REC)
  const ol = pickGroup(offP, OL)

  const dl = pickGroup(defP, DL)
  const lb = pickGroup(defP, LB)
  const db = pickGroup(defP, DB)

  const passOff =
    0.42 * groupRating(qb, ['thp', 'tha', 'tup', 'awr']) +
    0.33 * groupRating(rec, ['rte', 'cth', 'rac']) +
    0.25 * groupRating(ol, ['pbk'])

  const runOff =
    0.45 * groupRating(rb, ['bcv', 'trk', 'car', 'spd']) +
    0.55 * groupRating(ol, ['rbk', 'str'])

  const passDef =
    0.3 * groupRating(dl, ['prsh']) +
    0.2 * groupRating(lb, ['cov', 'prc']) +
    0.5 * groupRating(db, ['cov', 'zcv', 'prc'])

  const runDef =
    0.45 * groupRating(dl, ['bsh', 'str', 'tak']) +
    0.4 * groupRating(lb, ['tak', 'prc', 'bsh']) +
    0.15 * groupRating(pickGroup(defP, ['FS', 'SS']), ['tak', 'str'])

  return { passOff, runOff, passDef, runDef }
}

/** Fit de scheme ofensivo — penaliza roster que não atende ao requisito. */
export function schemeFitOffense(off: GameTeam): number {
  const offP = onField(off, off.depth.offense)
  const scheme = off.scheme.offense
  const recRte = groupRating(pickGroup(offP, REC), ['rte'])
  const olRbk = groupRating(pickGroup(offP, OL), ['rbk'])
  let fit = 1.0
  if ((scheme === 'air_raid' || scheme === 'vertical') && recRte < 78) fit *= 0.95
  if ((scheme === 'power_run' || scheme === 'smashmouth') && olRbk < 75) fit *= 0.95
  // schemes de tempo alto cansam mais mas rendem um pouco mais quando frescos
  fit *= 1 + (OFFENSE_SCHEMES[scheme].bigPlayBias - 1) * 0.03
  return fit
}
