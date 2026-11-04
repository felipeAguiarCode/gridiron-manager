/**
 * Deck de "Acontecimentos Surpresa" (reskin gridiron). Efeitos declarativos
 * aplicados ao elenco/franquia. Ritual das 3 cartas (embaralhar → escolher → flip).
 */
export type EventType = 'positive' | 'negative' | 'mixed'
export type EventRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type EventGroup = 'all' | 'star' | 'random' | 'rookie' | 'defense' | 'offense'

export interface EventEffects {
  moraleDelta?: number
  formDelta?: number
  fatigueDelta?: number
  capCredit?: number // crédito (+) ou custo (−) de salary cap em dólares
  reputationDelta?: number
  potentialDelta?: number
  injuryWeeks?: number // lesiona um alvo
  cureInjury?: boolean
  group?: EventGroup
}

export interface EventCard {
  id: string
  title: string
  narrative: string
  type: EventType
  rarity: EventRarity
  effects: EventEffects
}

export const EVENT_DECK: EventCard[] = [
  // positivas
  { id: 'board_bonus', title: 'Bônus da Diretoria', narrative: 'A diretoria libera uma verba extra de cap para reforços.', type: 'positive', rarity: 'common', effects: { capCredit: 5_000_000 } },
  { id: 'captain', title: 'Capitão Inspirado', narrative: 'O líder do vestiário eleva a moral de todo o elenco.', type: 'positive', rarity: 'common', effects: { moraleDelta: 8, group: 'all' } },
  { id: 'unlikely_hero', title: 'Herói Improvável', narrative: 'Um reserva brilha nos treinos e ganha confiança.', type: 'positive', rarity: 'common', effects: { formDelta: 15, potentialDelta: 2, group: 'random' } },
  { id: 'sponsor', title: 'Patrocinador Generoso', narrative: 'Um novo patrocínio reforça o caixa e o cap.', type: 'positive', rarity: 'rare', effects: { capCredit: 9_000_000, reputationDelta: 0 } },
  { id: 'rest_week', title: 'Semana de Descanso Extra', narrative: 'Descanso recupera o físico do elenco.', type: 'positive', rarity: 'common', effects: { fatigueDelta: -25, group: 'all' } },
  { id: 'practice_squad', title: 'Promessa do Practice Squad', narrative: 'Um jovem do practice squad estoura de potencial.', type: 'positive', rarity: 'rare', effects: { potentialDelta: 5, formDelta: 8, group: 'rookie' } },
  // negativas (destino, não punição — capadas)
  { id: 'kicker_crisis', title: 'Kicker em Crise', narrative: 'O especialista perde a confiança nos chutes.', type: 'negative', rarity: 'common', effects: { formDelta: -18, group: 'random' } },
  { id: 'bad_party', title: 'Festa Fora de Hora', narrative: 'Uma festa mal planejada abala a preparação.', type: 'negative', rarity: 'common', effects: { fatigueDelta: 15, moraleDelta: -5, group: 'all' } },
  { id: 'locker_crisis', title: 'Crise no Vestiário', narrative: 'Atritos internos derrubam a moral.', type: 'negative', rarity: 'rare', effects: { moraleDelta: -12, group: 'all' } },
  { id: 'bad_headline', title: 'Manchete Maliciosa', narrative: 'A imprensa alfineta a franquia.', type: 'negative', rarity: 'common', effects: { moraleDelta: -6, reputationDelta: 0, group: 'all' } },
  { id: 'practice_injury', title: 'Lesão no Treino', narrative: 'Um titular se machuca em campo.', type: 'negative', rarity: 'rare', effects: { injuryWeeks: 3, group: 'star' } },
  { id: 'travel_fatigue', title: 'Viagem Desgastante', narrative: 'Uma viagem longa desgasta o elenco.', type: 'negative', rarity: 'common', effects: { fatigueDelta: 18, group: 'all' } },
  // mistas
  { id: 'holdout', title: 'Holdout Contratual', narrative: 'Uma estrela pede renovação — motivação sobe, físico cai.', type: 'mixed', rarity: 'rare', effects: { moraleDelta: -8, formDelta: 10, group: 'star' } },
  { id: 'young_wants_start', title: 'Jovem Quer Titularidade', narrative: 'Um calouro exige mais minutos e treina forte.', type: 'mixed', rarity: 'common', effects: { formDelta: 12, moraleDelta: -4, group: 'rookie' } },
  // raras/épicas
  { id: 'medical_miracle', title: 'Milagre no Departamento Médico', narrative: 'A equipe médica antecipa recuperações.', type: 'positive', rarity: 'epic', effects: { cureInjury: true, group: 'all' } },
  { id: 'historic_speech', title: 'Discurso Histórico', narrative: 'Um discurso inflamado une o grupo.', type: 'positive', rarity: 'epic', effects: { moraleDelta: 14, formDelta: 8, group: 'all' } },
  { id: 'cap_crunch', title: 'Crise de Cap Relâmpago', narrative: 'Um ajuste contábil aperta o salary cap.', type: 'negative', rarity: 'epic', effects: { capCredit: -7_000_000 } },
  { id: 'dynasty_moment', title: 'Momento de Dinastia', narrative: 'A franquia respira confiança — moral e prestígio em alta.', type: 'positive', rarity: 'legendary', effects: { moraleDelta: 18, reputationDelta: 0, capCredit: 6_000_000, group: 'all' } }
]

export const CARD_BY_ID = new Map(EVENT_DECK.map((c) => [c.id, c]))
