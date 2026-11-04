/**
 * One-off: adiciona os programas Army (Black Knights) e Navy (Midshipmen) à NCAA.
 * - Insere as 2 franquias em resources/seed/ncaa/teams.json (idempotente).
 * - Gera rosters válidos de 53 (via generateRoster → ROSTER_TEMPLATE, garante
 *   mínimos de posição + números únicos) e escreve squads/ncaa-d.json, com alguns
 *   nomes/traits "reais" nos titulares para dar cara autorada.
 * Depois rode: `tsx scripts/generate-seed.ts ncaa` para regenerar players.json.
 * Uso: `npx tsx scripts/author-service-academies.ts`
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createRng, deriveSeed } from '../src/core/rng'
import { generateRoster, type Row } from '../src/core/engine/generation/generate'
import type { Player, TraitId } from '../src/core/domain/types'
import type { TeamSeed } from '../src/shared/schemas/world'

const GEN_SEED = 20260703

const NEW_TEAMS: TeamSeed[] = [
  {
    id: 'ncaa-army',
    name: 'Army',
    nickname: 'Black Knights',
    abbr: 'ARM',
    city: 'Army',
    colors: { primary: '#000000', secondary: '#d4bf7a' },
    altColors: { primary: '#d4bf7a', secondary: '#000000' },
    stadium: { name: 'Michie Stadium', capacity: 38000, surface: 'grass', dome: false },
    conference: 'FBS',
    division: 'Group of 5',
    reputation: 2,
    prestige: 110,
    budget: 6200000,
    aiProfile: 'balanced',
    preferredOffense: 'power_run',
    preferredDefense: '3-4'
  },
  {
    id: 'ncaa-navy',
    name: 'Navy',
    nickname: 'Midshipmen',
    abbr: 'NAV',
    city: 'Navy',
    colors: { primary: '#00205b', secondary: '#c5b783' },
    altColors: { primary: '#c5b783', secondary: '#00205b' },
    stadium: { name: 'Navy-Marine Corps Memorial Stadium', capacity: 34000, surface: 'grass', dome: false },
    conference: 'FBS',
    division: 'Group of 5',
    reputation: 2,
    prestige: 106,
    budget: 6100000,
    aiProfile: 'balanced',
    preferredOffense: 'smashmouth',
    preferredDefense: '3-4'
  }
]

// nomes/traits "reais" para os titulares (índices no ROSTER_TEMPLATE: 0=QB1, 3=RB1, 7=WR1)
const FLAVOR: Record<string, Record<number, { first: string; last: string; trait?: TraitId }>> = {
  'ncaa-army': {
    0: { first: 'Bryson', last: 'Daily', trait: 'field_general' },
    3: { first: 'Kanye', last: 'Udoh', trait: 'bruiser' },
    7: { first: 'Casey', last: 'Reynolds', trait: 'sure_hands' }
  },
  'ncaa-navy': {
    0: { first: 'Blake', last: 'Horvath', trait: 'field_general' },
    3: { first: 'Eli', last: 'Heidenreich', trait: 'elusive' },
    7: { first: 'Nathan', last: 'Kent', trait: 'deep_threat' }
  }
}

function toRow(p: Player): Row {
  const row: (string | number | TraitId[])[] = [
    p.firstName, p.lastName, p.age, 'USA', p.position, p.overall, p.potential, p.jerseyNumber
  ]
  if (p.traits.length) row.push(p.traits)
  return row as Row
}

const dir = join(process.cwd(), 'resources', 'seed', 'ncaa')

// 1) teams.json — inserir franquias se ainda não existirem
const teamsPath = join(dir, 'teams.json')
const teamsFile = JSON.parse(readFileSync(teamsPath, 'utf-8')) as { league: string; teams: TeamSeed[] }
for (const t of NEW_TEAMS) {
  if (teamsFile.teams.some((x) => x.id === t.id)) {
    console.log(`= ${t.id} já presente em teams.json`)
  } else {
    teamsFile.teams.push(t)
    console.log(`+ ${t.id} adicionado a teams.json`)
  }
}
writeFileSync(teamsPath, JSON.stringify(teamsFile, null, 2) + '\n')
console.log(`teams.json agora tem ${teamsFile.teams.length} times`)

// 2) squads/ncaa-d.json — rosters de 53 para as novas franquias
const squads: Record<string, Row[]> = {}
for (const t of NEW_TEAMS) {
  const rng = createRng(deriveSeed(GEN_SEED, t.id, 'author'))
  const players = generateRoster(rng, t.id, t.prestige, GEN_SEED)
  const flavor = FLAVOR[t.id] ?? {}
  players.forEach((p, i) => {
    const f = flavor[i]
    if (f) {
      p.firstName = f.first
      p.lastName = f.last
      if (f.trait) p.traits = [f.trait]
    }
    // rosters autorados dispensam posições secundárias (mantém as rows enxutas)
    p.secondaryPositions = []
  })
  squads[t.id] = players.map(toRow)
  console.log(`${t.id}: ${players.length} jogadores`)
}
const squadPath = join(dir, 'squads', 'ncaa-d.json')
writeFileSync(squadPath, JSON.stringify(squads, null, 0) + '\n')
console.log(`escrito ${squadPath}`)
