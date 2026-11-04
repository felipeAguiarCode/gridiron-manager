import { z } from 'zod'

export const POSITIONS = [
  'QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
  'DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'FS', 'SS',
  'K', 'P', 'LS'
] as const

export const TRAITS = [
  'cannon_arm', 'deep_threat', 'elusive', 'bruiser', 'sure_hands', 'brick_wall',
  'sack_artist', 'ball_hawk', 'iron_man', 'fumble_prone', 'ice_veins', 'field_general'
] as const

export const positionSchema = z.enum(POSITIONS)
export const traitSchema = z.enum(TRAITS)

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor hex #rrggbb')

const offenseSchemeSchema = z.enum([
  'air_raid', 'west_coast', 'spread_option', 'power_run', 'vertical', 'pistol_rpo', 'smashmouth'
])
const defenseSchemeSchema = z.enum(['4-3', '3-4', 'nickel', 'dime', 'tampa_2', '46_blitz'])

export const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nickname: z.string().min(1),
  abbr: z.string().min(2).max(3),
  city: z.string().min(1),
  colors: z.object({ primary: hex, secondary: hex }),
  altColors: z.object({ primary: hex, secondary: hex }),
  stadium: z.object({
    name: z.string().min(1),
    capacity: z.number().int().positive(),
    surface: z.enum(['grass', 'turf']),
    dome: z.boolean()
  }),
  conference: z.string().min(1),
  division: z.string(),
  reputation: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  prestige: z.number().int().min(1).max(200),
  budget: z.number().nonnegative(),
  aiProfile: z.enum(['contender', 'rebuild', 'win-now', 'balanced', 'analytics']),
  preferredOffense: offenseSchemeSchema,
  preferredDefense: defenseSchemeSchema,
  inCompetition: z.boolean().optional()
})

export type TeamSeed = z.infer<typeof teamSchema>

/** Arquivo teams.json de uma liga com N franquias. */
export function makeLeagueFileSchema(n: number) {
  return z.object({
    league: z.enum(['nfl', 'cfl', 'ufl', 'ncaa']),
    teams: z.array(teamSchema).length(n)
  })
}

/**
 * Linha compacta do roster:
 * [first, last, age, nat, POS, overall, potential, jersey, traits?, secondary?]
 */
export const rowSchema = z
  .tuple([
    z.string().min(1),
    z.string().min(1),
    z.number().int().min(18).max(45),
    z.string().min(2).max(3),
    positionSchema,
    z.number().int().min(30).max(99),
    z.number().int().min(30).max(99),
    z.number().int().min(0).max(99)
  ])
  .rest(z.union([z.array(traitSchema), z.array(positionSchema)]))

/** Arquivo de squads: { teamId: Row[] }. */
export const squadsFileSchema = z.record(z.string(), z.array(rowSchema))

/** Player expandido (validação do editor / players.json gerado). */
const attrInt = z.number().int().min(0).max(99)
export const attributesSchema = z.object({
  spd: attrInt, acc: attrInt, agi: attrInt, str: attrInt, awr: attrInt, sta: attrInt,
  thp: attrInt, tha: attrInt, tup: attrInt, car: attrInt, bcv: attrInt, trk: attrInt,
  cth: attrInt, rte: attrInt, rac: attrInt, rbk: attrInt, pbk: attrInt, tak: attrInt,
  prsh: attrInt, bsh: attrInt, cov: attrInt, zcv: attrInt, prc: attrInt, kpw: attrInt, kac: attrInt
})

export const playerSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  nationality: z.string(),
  age: z.number().int(),
  position: positionSchema,
  secondaryPositions: z.array(positionSchema),
  handedness: z.enum(['L', 'R']),
  attributes: attributesSchema,
  overall: attrInt,
  potential: attrInt,
  mental: z.object({
    composure: attrInt, leadership: attrInt, consistency: attrInt,
    ambition: attrInt, professionalism: attrInt, durability: attrInt
  }),
  traits: z.array(traitSchema),
  morale: attrInt, form: attrInt, fatigue: attrInt,
  injuryWeeks: z.number().int().nonnegative(),
  suspended: z.number().int().nonnegative().optional(),
  marketValue: z.number().nonnegative(),
  salary: z.number().nonnegative(),
  capHit: z.number().nonnegative(),
  contractYears: z.number().int(),
  jerseyNumber: z.number().int().min(0).max(99),
  yearsPro: z.number().int().nonnegative(),
  classYear: z.enum(['FR', 'SO', 'JR', 'SR']).optional()
})

export const playersFileSchema = z.object({
  generatorSeed: z.number().int(),
  players: z.array(playerSchema)
})
