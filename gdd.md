# GDD — Gridiron Manager (Manager de Futebol Americano)

> **Documento de Game Design + Prompt de Construção.** Este arquivo é autossuficiente: um agente de engenharia deve conseguir construir o jogo do zero a partir dele. O jogo é uma adaptação completa, ao universo do futebol americano, de um manager de futebol (soccer) já existente e maduro (`continental-champions`) — herdando arquitetura, UI/UX, features e mecânicas, e traduzindo tudo para gridiron: posições, atributos, motor de partida por descidas (downs), escalações por unidade (ataque/defesa/special teams), salary cap, draft, e quatro ligas jogáveis (NFL, CFL, UFL, NCAA College).

---

## 1. Visão & Pilares

**Pitch:** um manager/head-coach de futebol americano onde você comanda uma franquia em uma de quatro ligas (NFL, CFL, UFL, NCAA College), monta o roster de 53 jogadores com **cards estilo Ultimate Team**, define **schemes** ofensivos e defensivos, gere **salary cap / free agency / trades / draft**, e disputa temporada + playoffs até o título (Super Bowl / Grey Cup / UFL Championship / National Championship). Simulação realista por **drives e downs**, com timeline play-by-play.

**Pilares de design:**
1. **Profundidade de manager, não de arcade** — decisões de elenco, esquema, cap e desenvolvimento importam mais do que reflexo.
2. **Cards UT como identidade visual** — cada jogador é um card com raridade, foto, atributos e traits; a coleção é o coração da UI.
3. **Simulação transparente e justa** — o motor é seedável/determinístico e o pós-jogo explica o "porquê" (matchup de scheme, fadiga, momentum, turnovers).
4. **Quatro ligas como modos** — escolha a liga no início da carreira; cada uma com formato, calendário e regras próprias.
5. **Modo-deus/Editor completo** — editar tudo (times, jogadores, atributos, traits), criar franquia custom, import/export JSON, reset.
6. **Determinismo replayável** — RNG semeado em toda a geração e simulação; mesma seed → mesmo resultado.

**Cortes assumidos no MVP (pós-MVP documentado):** sem coletivas de imprensa complexas, sem staff assistente detalhado, sem estádio/expansão, sem apostas; **NCAA→Draft→NFL integrado** fica pós-MVP (as 4 ligas são modos separados no MVP); logos oficiais desligados (**apenas escudos minimalistas** — capacete/monograma gerado das cores).

---

## 2. Stack & Decisões (uma escolha por item)

| Item | Escolha | Motivo |
|---|---|---|
| Scaffold | **electron-vite** + electron-builder (NSIS) | HMR unificado main/preload/renderer |
| Banco | **better-sqlite3** (síncrono, no main) | `postinstall: electron-builder install-app-deps` resolve rebuild nativo no Windows; fallback `sql.js` se travar |
| ORM | **Drizzle** | TS puro sobre better-sqlite3; empacota fácil no Electron |
| Estado UI | **Zustand** | Renderer é view fina sobre snapshots vindos por IPC |
| Validação | **Zod** | Schemas compartilhados = contrato IPC + validador de seed |
| Rotas | react-router v7 `createHashRouter` | history routing quebra em `file://` empacotado |
| Estilo | **Tailwind v4 + CSS variables** | tema dark premium via `@theme`; raridade via `data-tier` |
| Fonte | **Poppins** (self-hosted via @fontsource) | CSP bloqueia Google Fonts; empacotada pelo Vite |

**Restrição de CSP:** `script-src 'self'`, sem fonts/imagens remotas. Sem fotos reais de jogadores; a foto do card é um asset genérico (busto) recortado com `mix-blend-mode: multiply` sobre o gradiente de raridade. Escudos = **monograma/capacete gerado das cores do time** (sem logos oficiais).

---

## 3. Arquitetura — 3 camadas com fronteira dura

Regra: o renderer **nunca** calcula resultado de jogo — envia intenções por IPC e recebe snapshots. `src/core/` é testável sem Electron nem DB.

```
american-football/
├── electron.vite.config.ts / electron-builder.yml / drizzle.config.ts
├── resources/
│   ├── migrations/                 # .sql do drizzle-kit
│   └── seed/
│       ├── nfl/     teams.json + squads/*.json      # 32 franquias + rosters
│       ├── cfl/     teams.json + squads/*.json      # 9 franquias
│       ├── ufl/     teams.json + squads/*.json      # 8 franquias
│       ├── ncaa/    teams.json + squads/*.json      # ~40 programas
│       └── players/ *.json (gerados por scripts/generate-seed.ts)
├── scripts/generate-seed.ts        # deriva atributos completos dos rosters compactos
├── src/
│   ├── core/                       # LÓGICA PURA — zero import de Electron/Node/SQLite
│   │   ├── domain/
│   │   │   ├── types.ts            # Team, Player, Coach, Play, Drive, GameResult, League...
│   │   │   ├── positions.ts        # famílias de posição, ARCHETYPES (pesos), computeOverall
│   │   │   ├── ratings.ts          # EffOff/EffDef, chemistry, playerMod
│   │   │   ├── market.ts           # tipos de cap/FA/trade
│   │   │   └── events.ts           # cartas de acontecimento
│   │   ├── rng.ts                  # mulberry32 + deriveSeed(fnv1a) — determinístico
│   │   └── engine/
│   │       ├── game/               # simulador de partida (drives/downs) + BALANCE
│   │       ├── season/             # schedule, standings, tiebreakers, playoff bracket
│   │       ├── scheme/             # schemes off/def, formations/personnel, matchup
│   │       ├── market/             # cap, free agency, trades, valuation, scouting
│   │       ├── ai/                 # seleção de depth chart / play-calling da IA
│   │       ├── events/             # draw + apply de cartas
│   │       ├── generation/         # geração procedural de jogadores
│   │       └── objectives.ts       # objetivos por reputação + arquétipos de HC
│   ├── shared/
│   │   ├── ipc/contract.ts         # mapa canal → {input Zod, output TS}
│   │   ├── coaches.ts              # arquétipos + head coaches reais por liga
│   │   ├── divisions.ts            # divisões/conferências por liga
│   │   └── schemas/                # Zod: team, player, export, market
│   ├── main/
│   │   ├── db/                     # connection.ts (WAL), schema/ (Drizzle), seed.ts
│   │   ├── services/
│   │   │   ├── game-service.ts     # orquestra core ↔ DB, snapshot, advanceWeek
│   │   │   ├── market-service.ts   # cap/FA/trades, tick semanal
│   │   │   ├── events-service.ts   # cartas de acontecimento
│   │   │   └── feed-service.ts     # timeline social/notícias (observer)
│   │   └── ipc/router.ts           # handler genérico: valida input → service → valida output
│   ├── preload/index.ts            # contextBridge expõe invoke() tipado (sandbox on)
│   └── renderer/src/               # api/, stores/ (Zustand), screens/, components/, theme/
```

**Um SQLite por save** em `%APPDATA%/gridiron-manager/saves/<slug>/save.db`. Índice dos slots em `saves/index.json`. Sem coluna `save_id` em lugar nenhum.

Tabelas: `meta` (kv: versão, seed mestre, semana atual, league), `teams`, `players`, `contracts`, `seasons`, `games` (week, home, away, seed, status, result JSON), `game_plays` (play-by-play), `standings` (materializada), `schemes`/`depth_charts`, `draft_picks`, `transactions` (FA/trade), `objectives`, `finances` (cap ledger), `news`. Autosave = `wal_checkpoint` + `VACUUM INTO backups/auto-<ts>.db`; manter 5 auto + 3 manuais rotativos.

---

## 4. Modelo de Domínio

### 4.1 League (competição = modo)

```ts
type League = 'nfl' | 'cfl' | 'ufl' | 'ncaa'
```

Gravado no `saveInfo` (meta `save`; ausente → default a definir). Cada liga tem seed próprio, número fixo de times, divisões/conferências, nº de jogos e formato de playoff (§6). O caminho de cada liga é um branch paralelo — como o continental-champions faz com `'ucl' | 'worldcup'`.

### 4.2 Team (Franquia)

```ts
interface Team {
  id: string                 // ex.: 'nfl-gb', 'ncaa-ohio-state'
  name: string               // 'Green Bay'
  nickname: string           // 'Packers'
  abbr: string               // 'GB' (2-3 letras)
  city: string
  colors: { primary: string; secondary: string }
  altColors: { primary: string; secondary: string }
  stadium: { name: string; capacity: number; surface: 'grass' | 'turf'; dome: boolean }
  conference: string         // 'AFC' | 'NFC' | 'East'(CFL) | 'USFL'/'XFL'(UFL) | 'Big Ten'(NCAA)...
  division: string           // 'North' | 'South' | 'East' | 'West' (quando aplicável)
  reputation: 1 | 2 | 3 | 4  // prestígio da franquia/programa
  prestige: number           // ranking (desempate/seeding), 1-200
  capSpace?: number          // espaço de salary cap (ligas com cap)
  budget: number             // caixa de operações / recrutamento (NCAA)
  aiProfile: 'contender' | 'rebuild' | 'win-now' | 'balanced' | 'analytics'
  preferredOffense: OffenseSchemeId
  preferredDefense: DefenseSchemeId
  inCompetition?: boolean    // participa da liga selecionada (extras ficam fora)
}
```

`ClubCrest` (herdado) renderiza **apenas o escudo minimalista**: monograma `abbr` sobre `linear-gradient(135deg, primary 48%, secondary 52%)`. A prop `official` fica disponível para o futuro mas desligada globalmente por padrão de exibição.

### 4.3 Player (com atributos gridiron)

O `Player` mantém a mesma **forma geral** do soccer (id, nome, idade, posição, secundárias, status, contrato, overall/potential, traits, morale/form/fatigue/injuryWeeks, marketValue→capHit, salary, jerseyNumber) e troca o **bloco de atributos** por um conjunto gridiron.

```ts
type Position =
  // Ataque
  | 'QB' | 'RB' | 'FB' | 'WR' | 'TE' | 'LT' | 'LG' | 'C' | 'RG' | 'RT'
  // Defesa
  | 'DE' | 'DT' | 'NT' | 'OLB' | 'ILB' | 'MLB' | 'CB' | 'FS' | 'SS'
  // Special teams
  | 'K' | 'P' | 'LS'

type Unit = 'offense' | 'defense' | 'special'

interface Attributes {
  // Físicos (universais, 0-99)
  spd: number   // speed
  acc: number   // acceleration
  agi: number   // agility
  str: number   // strength
  awr: number   // awareness (universal)
  sta: number   // stamina
  // Técnicos por família (0-99; irrelevantes ficam baixos)
  thp: number   // throw power         (QB)
  tha: number   // throw accuracy      (QB)
  tup: number   // throw under pressure(QB) / play-action
  car: number   // carrying            (RB/FB/QB)
  bcv: number   // ball-carrier vision (RB)
  trk: number   // trucking/elusive    (RB/FB)
  cth: number   // catching            (WR/TE/RB)
  rte: number   // route running       (WR/TE)
  rac: number   // catch-in-traffic/RAC(WR/TE)
  rbk: number   // run block           (OL/TE/FB)
  pbk: number   // pass block          (OL/TE)
  tak: number   // tackle              (DL/LB/DB)
  prsh: number  // pass rush           (DL/OLB)
  bsh: number   // block shed          (DL/LB)
  cov: number   // man coverage        (CB/S/LB)
  zcv: number   // zone coverage       (CB/S/LB)
  prc: number   // play recognition    (defesa)
  kpw: number   // kick power          (K/P)
  kac: number   // kick accuracy       (K/P)
}

interface Player {
  id: string; teamId: string
  firstName: string; lastName: string
  nationality: string        // maioria 'USA'; college/CFL têm CAN, etc.
  age: number                // 20-40
  position: Position
  secondaryPositions: Position[]
  handedness: 'L' | 'R'      // relevante p/ QB/K
  attributes: Attributes
  mental: {                  // 20-99 (idêntico em espírito ao soccer)
    composure: number; leadership: number; consistency: number
    ambition: number; professionalism: number; durability: number
  }
  morale: number; form: number; fatigue: number   // 0-100
  injuryWeeks: number; suspended?: number
  marketValue: number        // valuation → base do cap hit
  salary: number             // salário anual
  capHit: number             // impacto no salary cap na temporada
  contractYears: number
  jerseyNumber: number       // 0-99
  overall: number; potential: number
  traits: TraitId[]
  yearsPro: number           // experiência (rookie = 0); NCAA usa "class": FR/SO/JR/SR
}
```

**Overall por posição** = média ponderada dos atributos pelos pesos do arquétipo da posição (§9), na mesma fórmula do soccer (`computeOverall`). Overall nunca é armazenado como fonte de verdade fora do card: é derivado dos atributos.

### 4.4 Coach (Head Coach = você)

```ts
interface Coach {
  name: string
  archetype: CoachArchetypeId   // §13
  known?: string                // time real associado (rótulo)
}
```

### 4.5 Simulação: Play, Drive, GameResult

```ts
type PlayType = 'run' | 'pass' | 'punt' | 'field_goal' | 'kickoff' | 'extra_point' | 'two_point' | 'kneel' | 'spike'
type PlayOutcome =
  | 'gain' | 'first_down' | 'touchdown' | 'field_goal_good' | 'field_goal_miss'
  | 'punt' | 'sack' | 'interception' | 'fumble_lost' | 'incomplete' | 'safety' | 'turnover_on_downs' | 'penalty'

interface PlayEvent {
  quarter: 1|2|3|4|'OT'; clock: string          // "12:43"
  offenseTeamId: string
  down: 1|2|3|4; distance: number; yardline: number  // 0-100 (perspectiva do ataque)
  type: PlayType; outcome: PlayOutcome
  yards: number
  scorerId?: string; passerId?: string; rusherId?: string; tacklerId?: string
  text: string                                   // narração "QB #12 completa 14 jardas para WR #80"
}

interface Drive {
  offenseTeamId: string; startYardline: number
  plays: PlayEvent[]; result: 'TD' | 'FG' | 'PUNT' | 'TURNOVER' | 'DOWNS' | 'SAFETY' | 'END_HALF'
  points: number
}

interface GameResult {
  homeTeamId: string; awayTeamId: string
  homeScore: number; awayScore: number
  quarters: [number, number][]        // pontos por quarter [home, away]
  drives: Drive[]
  plays: PlayEvent[]                   // timeline completa (event log persistido)
  stats: { home: TeamGameStats; away: TeamGameStats }
  playerStats: PlayerGameLine[]        // passing/rushing/receiving/defense/kicking por jogador
  momentum: number[]                   // série p/ o gráfico de ímpeto
  overtime: boolean
  winnerTeamId: string | null
}
```

---

## 5. Banco de Dados & Saves

Idêntico em filosofia ao continental-champions: **um arquivo SQLite por save**, meta KV para estado volátil (sem migração para features novas), autosave por `VACUUM INTO`. Estados que vivem no meta: `save` (league, masterSeed, coach, teamId, week), `season` (phase, week, number), `standings`, `bracket`, `champion`, `depthChart`/`userLineup`, `scheme` (off/def escolhidos), `market` (cap/FA/trade state), `events`, `feed`, `display` (`{ minimalCrests: true }` fixo por ora), `draft` (pós-MVP).

---

## 6. Ligas e Formatos

Cada liga é fixada estruturalmente (como a UCL fixa 36 e a Copa fixa 48). Um save pertence a **uma** liga.

### 6.1 NFL — 32 franquias
- **Conferências:** AFC / NFC, cada uma com 4 divisões de 4 (North/South/East/West).
- **Temporada regular:** 17 jogos (6 divisionais 2×3, + cruzamentos de divisão/conferência via fórmula rotativa). Semana de bye.
- **Playoffs:** 7 seeds por conferência (4 campeões de divisão + 3 wild cards); #1 tem bye. Wild Card → Divisional → Conference Championship → **Super Bowl** (jogo único, campo neutro, sem empate — overtime).
- **Cap:** salary cap rígido.

### 6.2 NCAA College — ~40 programas (MVP)
- **Conferências** (ex.: Big Ten, SEC, ACC, Big 12, Pac, Grupo dos 5 reduzido). Temporada regular ~12 jogos (majoritariamente intra-conferência + rivalidades).
- **Playoff:** **College Football Playoff de 12 times** (bracket seeded; top-4 com bye na 1ª rodada) → Quarters → Semis (Bowls) → **National Championship**.
- **Economia:** sem salary cap; recrutamento/orçamento de programa (recruiting no lugar de free agency — no MVP, mercado reskin como "portal de transferências" + recrutas). "Contrato" = classe (FR/SO/JR/SR) e elegibilidade; jogadores se formam (saem) após SR.

### 6.3 CFL — 9 franquias
- **Divisões:** Leste / Oeste. **18 jogos** de temporada regular.
- **Regras canadenses (variação de motor):** campo mais largo e longo (110 jardas + end zones de 20), **3 downs** (não 4), **12 jogadores** por lado, motion ilimitado antes do snap, single (rouge = 1 ponto). Documentado como flags no motor (`downsPerSet: 3`, `playersOnField: 12`, `fieldLength: 110`, `rouge: true`).
- **Playoffs:** semifinais e finais de divisão → **Grey Cup**.

### 6.4 UFL — 8 franquias
- **Conferências:** USFL / XFL, 4 cada. **10 jogos** de temporada (primavera).
- **Regras UFL (variação):** conversões alternativas (1/2/3 pontos por distância), kickoff dinâmico, overtime por tentativas alternadas da linha de 2 jardas.
- **Playoffs:** 2 seeds por conferência → semifinais → **UFL Championship**.

> **Depth chart obrigatório de campo:** 11 por lado (CFL: 12). Guardas de roster mínimas por unidade (§9.4).

---

## 7. Motor de Partida — Drive/Down (núcleo)

`simulateGame(input: GameInput, seed: number): GameResult` — **puro, determinístico, seedável**. A seed é derivada e gravada no `game`; o match viewer anima o event log gravado, **nunca re-rola**.

### 7.1 Loop de alto nível
1. Coin toss (seed) decide posse inicial; kickoff.
2. **4 quarters de 15:00 de relógio.** Posse alterna por drive. Cada drive é um loop de downs até TD/FG/punt/turnover/safety/fim de quarter.
3. Fim do 2Q = intervalo (halftime). Fim do 4Q empatado → **overtime** (regra por liga).
4. Acumula stats, playerStats, momentum e o event log completo.

### 7.2 Força efetiva por unidade
Para cada jogada, a **unidade ofensiva** (11 em campo) enfrenta a **defensiva**:

```
EffOff = base(11 atacantes por sub-fase) × chemistry × schemeFit × schemeMatchup
       × staminaMod × moraleMod × formMod × homeAdv × weatherMod × (1 + MOMENTUM_EFFECT × momentum)
EffDef = base(11 defensores) × chemistry × schemeFit × schemeMatchup × staminaMod × ...
```
- **base ofensiva** pondera setores conforme o tipo de jogada escolhido: passe usa QB (THP/THA/AWR) + WR/TE (RTE/CTH) + OL (PBK); corrida usa RB (BCV/TRK/CAR) + OL (RBK) + FB. **base defensiva** usa DL (PRSH/BSH), LB (TAK/PRC/COV), DB (COV/ZCV).
- `schemeMatchup` = matriz off-scheme × def-scheme (§8), multiplicador ±8–15%.
- `staminaMod`, `moraleMod`, `formMod`, `homeAdv`, `weatherMod` reaproveitados do soccer (mesmas constantes em `BALANCE`).

### 7.3 Escolha e resolução da jogada
1. **Play-call** (IA ou usuário via game plan): distribuição run/pass pela situação (down, distância, relógio, placar, scheme). Ex.: 3rd & long → pass alto; 4th & short → decisão FG/punt/go.
2. **Ganho de jardas:** `share = EffOff / (EffOff + EffDef)`; aplica sharpening `share^K/(share^K+(1-share)^K)` (K≈do soccer, o botão de calibragem) → jardas via distribuição (curta/média/longa por tipo). Passe tem prob. de incompleto; corrida raramente perde jardas.
3. **Eventos discretos por rolagem** (modificados por atributos/traits):
   - **Sack** (PRSH vs PBK), **INT** (tha/tup vs cov/prc + zona), **fumble** (car/trk vs tak/str; trait Fumble-Prone ↑), **big play** (spd/rte/bcv), **broken tackle** (trk vs tak).
   - **Penalidades** (holding, false start, PI, offside) — reposicionam a bola/down.
4. **Situações de pontuação:**
   - **Touchdown** = 6 + tentativa de **PAT** (extra point por KPW/KAC) ou **2-point** (jogada normal da linha de 2).
   - **Field goal** (3): probabilidade por distância × KPW/KAC × clima; trait Ice Veins ↑ em FGs decisivos.
   - **Punt** (4th down conservador): troca de posse por yardline (P.KPW).
   - **Safety** (2 p/ defesa) quando ataque é parado na própria end zone.
   - **Turnover on downs** em 4th down falho.

### 7.4 Relógio, quarters e overtime
- Cada jogada consome tempo (run gasta mais; incompleto para o relógio; out-of-bounds para). **2-minute drill** acelera play-calling. Timeouts (3 por metade) geridos pela IA/usuário.
- **Overtime por liga:** NFL (posse alternada modificada), CFL/UFL (tentativas alternadas da linha de 2/35). Sem empate nos playoffs; empate possível na fase regular da NFL/CFL após 1 OT (configurável).

### 7.5 Momentum, fadiga, lesões
- **Momentum** [-1,+1] por time: sobe com TD/turnover forçado/3rd-down conversion, cai com turnover/sack sofrido/3-and-out. Decai por drive. `mod = 1 + MOMENTUM_EFFECT × momentum`.
- **Fadiga por snaps:** cada jogada adiciona fadiga aos 11 em campo da unidade; stamina = `maxStamina(raridade) − fatigue`. Zonas verde/amarelo/vermelho afetam desempenho e risco de lesão (idêntico ao soccer). Rotação de RB/WR/DL pela IA.
- **Lesões:** rolagem por contato × fadiga × trait Iron Man/Fumble; jogador sai por X semanas; sub forçada do depth chart.

### 7.6 `BALANCE` (constantes centrais, calibráveis)
Reaproveita o objeto do soccer, reinterpretado:
```
K (sharpening de força → jardas), HOME_ADV (~1.03), MOMENTUM_EFFECT/GAIN/DECAY,
MORALE_SCALE, FORM_SCALE, FATIGUE_MAX_PENALTY, CRIT_PERF_EXTRA, CRIT_INJURY_MULT,
BASE_PLAYS_PER_GAME (~120-130 no total), PASS_RATE_BASE, SACK_P, INT_P, FUMBLE_P,
BIG_PLAY_P, FG_BASE_BY_DISTANCE[], PENALTY_P, RATING_BASE (nota pós-jogo).
```

### 7.7 Harness de calibragem (teste-chefe)
1000 sims por faixa de gap de overall, assertando bandas realistas: **placar médio** ~20-27 pts/time, distribuição de vitória por gap (favorito forte 70-85%, equilíbrio 45-55%, zebra 15-30%), turnovers/jogo (1-2/time), jardas totais (~330/time). Serve para tunar `K` e o `BALANCE`.

---

## 8. Schemes, Formações & Personnel

**Schemes ofensivos** (equivalem aos playbooks do soccer): `air_raid`, `west_coast`, `spread_option`, `power_run`, `vertical`, `pistol_rpo`, `smashmouth`.
**Schemes defensivos:** `4-3`, `3-4`, `nickel`, `dime`, `tampa_2`, `46_blitz`.

Cada scheme tem: **requisito de elenco** (ex.: Air Raid exige WR corps com RTE médio ≥ limiar, senão −5%), **custo de fadiga** (blitz-heavy e air-raid gastam mais), **viés de play-call** (pass/run split, agressividade em 4th down, blitz rate), e um **matchup** contra os schemes rivais.

**Matriz de matchup off×def** (multiplicador ao `EffOff`; simétrica invertida, calibrar com o harness):

| Off ↓ / Def → | 4-3 | 3-4 | Nickel | Dime | Tampa-2 | 46-Blitz |
|---|---|---|---|---|---|---|
| Air Raid | 1.02 | 1.00 | 0.96 | 1.06 | 0.94 | 1.08 |
| West Coast | 1.00 | 1.02 | 1.00 | 0.98 | 1.03 | 0.96 |
| Spread Option | 1.04 | 0.98 | 1.02 | 1.05 | 0.97 | 0.92 |
| Power Run | 1.05 | 1.06 | 1.02 | 1.10 | 1.00 | 0.90 |
| Vertical | 0.98 | 1.00 | 0.95 | 1.04 | 0.90 | 1.07 |
| Pistol/RPO | 1.03 | 0.97 | 1.02 | 1.04 | 0.99 | 0.95 |
| Smashmouth | 1.06 | 1.05 | 1.03 | 1.08 | 1.01 | 0.88 |

**Formações/Personnel:** grupos ofensivos (`I-Form`, `Singleback`, `Shotgun`, `Empty`, `Pistol`) mapeando personnel (ex.: `11` = 1 RB/1 TE/3 WR, `21`, `12`, `22`) e fronts defensivos (`Base 4-3`, `Base 3-4`, `Nickel`, `Dime`, `Goal Line`). O jogador escolhe scheme + formação-base; a IA seleciona personnel por situação. Isso alimenta o depth chart (quais 11 entram por sub-fase).

**Sliders táticos** (1-100, equivalem aos sliders do soccer): `tempo` (no-huddle), `aggression` (4th-down/deep shots), `blitzRate`, `coverageTightness`, `runPassBias`, `playActionRate`, `screenRate`, `tempoDefense`. Efeitos declarativos no motor (ex.: `blitzRate` alto → +pressão/sack, −cobertura, +risco big play concedido).

---

## 8B. Sistema de Playbooks, Play Calling & Controle de Jogadas

> O playbook é a identidade tática concreta de cada franquia. Enquanto o **scheme** (§8) define a filosofia geral do time — Air Raid, West Coast, Power Run, 3-4, Nickel etc. — o **playbook** define quais jogadas o time realmente tem disponíveis em campo. Durante a partida, quando o jogador assumir controle, ele poderá escolher a próxima jogada antes do snap, influenciando diretamente o motor de drives/downs (§7).

**Notas de consistência com o código existente.** `OffenseSchemeId`/`DefenseSchemeId` já existem em `src/core/domain/types.ts` — o `baseScheme` do playbook reusa esses ids. `FormationId` reusa `OffenseFormation`/`DefenseFront` (`types.ts`). `PersonnelGroup` é novo (`'10'|'11'|'12'|'21'|'22'|'nickel'|'dime'|'goal_line'|'jumbo'`). Todos os `AttributeKey` dos exemplos (`rbk`,`bcv`,`tha`,`rte`,`cth`,`pbk`,`thp`,`prsh`,`zcv`,`prc`,`tak`,`kpw`,`kac`,`car`,`str`,`spd`,`awr`,`cov`) já existem em `Attributes`. `PlayEvent` (§4.5) ganha campos opcionais `offensePlayId?`/`defensePlayId?`/`offensePlayName?`/`playCallSource?` (opcionais ⇒ saves e testes antigos não quebram).

### 8B.1 Visão Geral

Todo time deve possuir pelo menos um playbook ativo. O playbook contém jogadas organizadas por: **Run, Pass, Play Action, Screen, RPO/Option, Trick Plays, Short Yardage, Red Zone, Goal Line, 2-Minute Drill, 4th Down, Special Teams, Defensive Calls**.

O jogador pode: (1) usar o playbook padrão do time; (2) clonar um playbook existente; (3) criar um customizado; (4) renomear; (5) editar quais jogadas fazem parte dele; (6) definir jogadas favoritas; (7) definir jogadas por situação; (8) salvar múltiplos customizados; (9) atribuir um playbook ativo ao time; (10) usar o playbook durante as partidas quando assumir controle.

### 8B.2 Relação entre Scheme, Formação e Playbook

```txt
Scheme        = filosofia geral
Formation     = alinhamento em campo
Playbook      = biblioteca de jogadas disponíveis
Play Call     = jogada escolhida no momento
```

Exemplo: `Scheme: West Coast · Formation: Shotgun Trips · Playbook: Kings Balanced Offense · Play Call: Slants Mesh Y-Cross`.

- **Scheme** influencia: preferência run/pass, agressividade, ritmo, tipos de formação, bônus de familiaridade.
- **Formação** influencia: personnel em campo, matchups, opções de jogadas.
- **Playbook** influencia: variedade tática, jogadas por situação, familiaridade, previsibilidade, risco de execução, capacidade de surpreender.

### 8B.3 Tipos de Playbook

```ts
type PlaybookType = 'offense' | 'defense' | 'special_teams' | 'full_team'

interface TeamPlaybookProfile {
  teamId: string
  activeOffensivePlaybookId: string
  activeDefensivePlaybookId: string
  activeSpecialTeamsPlaybookId: string
  defaultPlaybookIds: string[]
  customPlaybookIds: string[]
  familiarity: Record<string, number> // playbookId → 0-100
}
```

Para simplificar a UI, o jogador vê como um único playbook completo do time, mas internamente ele é dividido em **Offensive / Defensive / Special Teams**.

### 8B.4 Estrutura de um Playbook

```ts
interface Playbook {
  id: string
  ownerTeamId?: string
  name: string
  description?: string
  type: PlaybookType
  baseScheme: OffenseSchemeId | DefenseSchemeId | 'special_teams'
  createdBy: 'system' | 'user' | 'imported'
  isDefault: boolean
  isCustom: boolean
  tags: PlaybookTag[]
  plays: PlaybookPlay[]
  createdAt: string
  updatedAt: string
}

type PlaybookTag =
  | 'balanced' | 'pass_heavy' | 'run_heavy' | 'vertical' | 'west_coast' | 'spread'
  | 'power' | 'rpo' | 'trickster' | 'defensive_pressure' | 'coverage_heavy'
  | 'bend_dont_break' | 'red_zone_specialist' | 'clock_control'
```

### 8B.5 Estrutura de uma Jogada

```ts
interface PlaybookPlay {
  id: string
  name: string
  category: PlayCategory
  side: 'offense' | 'defense' | 'special_teams'
  formation: FormationId
  personnel: PersonnelGroup
  tags: PlayTag[]

  baseRisk: number          // 0-100
  baseReward: number        // 0-100
  complexity: number        // 0-100
  staminaCost: number       // 0-100
  requiredFamiliarity: number

  runPassType?: 'run' | 'pass' | 'play_action' | 'screen' | 'rpo' | 'option'
  targetDepth?: 'short' | 'medium' | 'deep' | 'mixed'
  fieldZoneFit: FieldZone[]
  downDistanceFit: DownDistanceSituation[]
  clockFit: ClockSituation[]

  primaryAttributes: AttributeKey[]
  counteredBy: DefensivePlayTag[]
  strongAgainst: DefensivePlayTag[]

  successMod: number
  turnoverRiskMod: number
  bigPlayMod: number
  sackRiskMod?: number
  penaltyRiskMod?: number

  flavorText: string
}
```

### 8B.6 Categorias de Jogadas

```ts
type PlayCategory =
  | 'run' | 'pass' | 'play_action' | 'screen' | 'rpo' | 'option' | 'trick'
  | 'short_yardage' | 'red_zone' | 'goal_line' | 'two_minute' | 'fourth_down'
  | 'special_teams' | 'defense_base' | 'defense_blitz' | 'defense_coverage'
  | 'defense_goal_line' | 'defense_prevent'
```

### 8B.7 Tags de Jogadas

```ts
type PlayTag =
  | 'inside_run' | 'outside_run' | 'power' | 'zone_run' | 'draw' | 'quick_pass'
  | 'slants' | 'mesh' | 'crossers' | 'deep_shot' | 'shotgun' | 'under_center'
  | 'motion' | 'misdirection' | 'bootleg' | 'screen' | 'rpo' | 'option'
  | 'flea_flicker' | 'hb_pass' | 'fake_punt' | 'fake_field_goal' | 'hail_mary'
  | 'qb_sneak' | 'clock_kill' | 'sideline' | 'high_risk' | 'safe'

type DefensivePlayTag =
  | 'man_coverage' | 'zone_coverage' | 'cover_2' | 'cover_3' | 'cover_4'
  | 'press' | 'soft_coverage' | 'blitz' | 'zero_blitz' | 'spy_qb' | 'contain'
  | 'run_commit' | 'pass_commit' | 'prevent' | 'goal_line_stack'
```

### 8B.8 Exemplos de Jogadas Ofensivas

```ts
// Run
{ name: 'Inside Zone', category: 'run', side: 'offense', formation: 'shotgun', personnel: '11',
  tags: ['inside_run','zone_run','safe'], baseRisk: 22, baseReward: 46, complexity: 30, staminaCost: 28,
  targetDepth: 'short', primaryAttributes: ['rbk','bcv','car','str'],
  strongAgainst: ['soft_coverage','prevent'], counteredBy: ['run_commit','goal_line_stack'],
  successMod: 1.02, turnoverRiskMod: 0.92, bigPlayMod: 0.85 }

// Pass
{ name: 'Slants Mesh', category: 'pass', side: 'offense', formation: 'shotgun', personnel: '11',
  tags: ['quick_pass','slants','mesh','safe'], baseRisk: 28, baseReward: 52, complexity: 42, staminaCost: 25,
  targetDepth: 'short', primaryAttributes: ['tha','awr','rte','cth','pbk'],
  strongAgainst: ['blitz','soft_coverage'], counteredBy: ['press','man_coverage'],
  successMod: 1.03, turnoverRiskMod: 0.88, sackRiskMod: 0.72, bigPlayMod: 0.78 }

// Deep Shot
{ name: 'Four Verticals', category: 'pass', side: 'offense', formation: 'shotgun', personnel: '10',
  tags: ['deep_shot','shotgun','high_risk'], baseRisk: 68, baseReward: 88, complexity: 62, staminaCost: 38,
  targetDepth: 'deep', primaryAttributes: ['thp','tha','rte','spd','pbk'],
  strongAgainst: ['cover_2','run_commit'], counteredBy: ['cover_4','prevent','pass_commit'],
  successMod: 0.96, turnoverRiskMod: 1.22, sackRiskMod: 1.18, bigPlayMod: 1.55 }

// Trick Play
{ name: 'Flea Flicker', category: 'trick', side: 'offense', formation: 'singleback', personnel: '12',
  tags: ['flea_flicker','misdirection','deep_shot','high_risk'], baseRisk: 82, baseReward: 92,
  complexity: 88, staminaCost: 42, targetDepth: 'deep', primaryAttributes: ['car','awr','thp','rte','spd'],
  strongAgainst: ['run_commit','cover_2'], counteredBy: ['contain','cover_4','pass_commit'],
  successMod: 0.88, turnoverRiskMod: 1.45, sackRiskMod: 1.25, bigPlayMod: 1.85 }
```

### 8B.9 Exemplos de Jogadas Defensivas

```ts
// Blitz
{ name: 'Nickel Double A-Gap Blitz', category: 'defense_blitz', side: 'defense', formation: 'nickel',
  personnel: 'nickel', tags: ['blitz','press','pass_commit'], baseRisk: 70, baseReward: 78,
  complexity: 66, staminaCost: 45, primaryAttributes: ['prsh','spd','prc','cov'],
  strongAgainst: ['deep_shot','play_action'], counteredBy: ['quick_pass','screen'],
  successMod: 1.08, turnoverRiskMod: 1.10, bigPlayMod: 1.20 }

// Coverage
{ name: 'Cover 3 Cloud', category: 'defense_coverage', side: 'defense', formation: 'nickel',
  personnel: 'nickel', tags: ['zone_coverage','cover_3','soft_coverage'], baseRisk: 34, baseReward: 55,
  complexity: 48, staminaCost: 24, primaryAttributes: ['zcv','prc','awr','tak'],
  strongAgainst: ['deep_shot','sideline'], counteredBy: ['inside_run','short_yardage'],
  successMod: 1.02, turnoverRiskMod: 0.96, bigPlayMod: 0.74 }
```

### 8B.10 Playbook Editor

Nova tela `/game/playbooks`. Abas: **Meus Playbooks · Playbook do Time · Ofensivo · Defensivo · Special Teams · Criar/Editar · Importar/Exportar**. Ações: criar, clonar, renomear, descrição, escolher scheme base, adicionar/remover jogadas, marcar favoritas, definir jogadas por situação, testar em simulação rápida, exportar/importar JSON, definir como ativo.

```ts
const PLAYBOOK_LIMITS = {
  maxOffensivePlays: 80, maxDefensivePlays: 70, maxSpecialTeamsPlays: 25, maxTrickPlays: 8,
  minRunPlays: 12, minPassPlays: 18, minDefensiveCalls: 20, minSpecialTeamsCalls: 8
}
```

### 8B.11 Familiaridade com Playbook

```ts
interface PlaybookFamiliarity {
  teamId: string
  playbookId: string
  overallFamiliarity: number // 0-100
  formationFamiliarity: Record<FormationId, number>
  playFamiliarity: Record<string, number>
}
```

Familiaridade **aumenta** com: Training Camp, repetição em jogos, scheme installation, QB experiente, HC compatível, veteranos, mesmo playbook por várias temporadas. **Cai** com: troca de HC, mudança brusca de scheme, muitos rookies, QB novo, playbook recém-criado, muitas trick plays.

Efeito no motor:

```ts
playExecutionMod = 1 + familiarityBonus - complexityPenalty - lowChemistryPenalty
```

Jogadas complexas com baixa familiaridade têm maior chance de: false start, holding, broken route, sack, interception, fumble, wasted timeout.

### 8B.12 Previsibilidade e Adaptação da IA

```ts
interface PlayUsageMemory {
  teamId: string
  opponentTeamId: string
  playId: string
  timesCalled: number
  successRate: number
  lastCalledQuarter: number
}

predictabilityPenalty = repeatedPlayPenalty + repeatedFormationPenalty + repeatedSituationPenalty
```

A IA aprende padrões durante o jogo: muito run em 1st down → mais run commit; muito deep shot → mais Cover 4/prevent; abuso de blitz → screen/quick pass do rival; muitas trick plays → risco de execução ruim ↑. Camada de xadrez tático.

### 8B.13 Controle Durante a Partida

```ts
type GameControlMode = 'full_coach_control' | 'key_moments' | 'simulation_only'
```

- **Full Coach Control** — escolhe jogada antes de cada snap do seu time (ataque, defesa, special teams).
- **Key Moments** — a IA simula, mas chama o jogador em momentos decisivos: 3rd down decisivo, 4th down, red zone, 2-minute drill, FG decisivo, overtime, turnover swing, final drive.
- **Simulation Only** — a IA chama tudo com base em playbook/scheme/sliders/situação.

### 8B.14 Play Calling UI

Antes do snap, abrir o painel **Choose Next Play**. Topo: Quarter, Clock, Down & Distance, Yardline, Score, Timeouts, Momentum. Centro: cards filtrados por situação (Recommended, Run, Pass, Play Action, Screen, Trick, Short Yardage, Red Zone, Special Teams). Cada card mostra: nome, categoria, formação, personnel, risco, recompensa, familiaridade, melhor contra, fraca contra, stamina cost, tags.

```txt
SLANTS MESH
Shotgun · 11 Personnel
Risco: Baixo · Recompensa: Média · Familiaridade: 82%
Boa contra: Blitz / Soft Coverage · Ruim contra: Press Man
[Chamar Jogada]
```

### 8B.15 Recomendação do Coordenador

```ts
interface PlayCallRecommendation {
  playId: string
  confidence: number
  reason: string
  riskLabel: 'safe' | 'balanced' | 'aggressive' | 'desperate'
}

recommendationScore =
  situationFit * 0.30 + playFamiliarity * 0.20 + matchupAdvantage * 0.20
  + playerPersonnelFit * 0.15 + opponentTendencyCounter * 0.15
```

Ex.: *"Slants Mesh é uma opção segura contra blitz. O adversário pressionou em 3 das últimas 5 terceiras descidas."* (OC) / *"Cover 3 Cloud reduz big plays. O ataque rival está buscando passes longos neste drive."* (DC)

### 8B.16 Resolução da Jogada no Motor

```ts
interface PlayCallInput {
  offensePlayId?: string
  defensePlayId?: string
  specialTeamsPlayId?: string
  controlMode: GameControlMode
}
```

A jogada modifica: EffOff, EffDef, prob. de sack/turnover/big play/penalidade, consumo de stamina/relógio, matchup por formação, risco de execução. Fórmula conceitual:

```ts
finalPlayShare =
  baseUnitShare * offensivePlayExecution * defensiveCounterMod * personnelMatchup
  * familiarityMod * predictabilityMod * momentumMod * fatigueMod
```

### 8B.17 Determinismo

O sistema continua determinístico. Toda jogada escolhida é registrada no event log (`PlayEvent` estendido com `offensePlayId?/defensePlayId?/specialTeamsPlayId?/playCallSource: 'user'|'ai'|'recommended'|'delegated'`). Seed derivado por jogada:

```ts
playSeed = deriveSeed(gameSeed, driveIndex, playIndex, offensePlayId, defensePlayId)
```

**Mesmo jogo + mesmas escolhas = mesmo resultado.** O motor da IA/season (`simulateGame`) mantém a assinatura pública e roda como driver não-interativo do mesmo laço.

### 8B.18 Playbook dos Times da Liga

```ts
interface TeamPlaybookTemplate {
  teamId: string
  offensiveIdentity: 'balanced' | 'west_coast' | 'air_raid' | 'vertical' | 'power_run'
    | 'spread_option' | 'pistol_rpo' | 'smashmouth'
  defensiveIdentity: 'base_4_3' | 'base_3_4' | 'nickel_heavy' | 'blitz_heavy' | 'tampa_2' | 'coverage_heavy'
  specialTeamsIdentity: 'safe' | 'aggressive' | 'field_position' | 'trick_specialist'
}
```

Cada time recebe um playbook padrão coerente com sua identidade (derivado de `preferredOffense`/`preferredDefense`).

### 8B.19 Playbook Customizado

```ts
interface CustomPlaybook {
  id: string
  userId?: string
  saveId?: string
  name: string
  nickname?: string
  basePlaybookId?: string
  type: PlaybookType
  plays: string[]
  favoritePlays: string[]
  situationalRules: PlaybookSituationRule[]
}

interface PlaybookSituationRule {
  id: string
  situation: 'first_down' | 'third_and_short' | 'third_and_long' | 'red_zone' | 'goal_line'
    | 'two_minute' | 'protect_lead' | 'trailing_late' | 'fourth_and_short'
  preferredPlayIds: string[]
  avoidedPlayIds: string[]
}
```

### 8B.20 Integração com Training Camp e Pré-Temporada

`TrainingCampFocus` ganha `'playbook_installation'`: + familiaridade geral, + execução de jogadas complexas, − penalidades mentais, − evolução física individual. Durante a pré-temporada o usuário pode marcar jogadas para testar:

```ts
interface PreseasonPlaybookTestPlan {
  playIdsToTest: string[]
  formationFocus: FormationId[]
  trickPlayAllowed: boolean
  startersUsage: number
  rookiesUsage: number
}
```

### 8B.21 Progressão de Jogadas

```ts
interface PlayMastery {
  playId: string
  teamId: string
  mastery: number // 0-100
  timesCalled: number
  successRate: number
  turnoverRate: number
  explosivePlayRate: number
}
```

Níveis: `0-24 Desconhecida · 25-49 Instalada · 50-74 Confiável · 75-89 Especialidade · 90-100 Assinatura do Time`. Jogadas assinatura recebem pequeno bônus, mas o uso excessivo gera previsibilidade.

### 8B.22 Signature Plays

```ts
interface SignaturePlay {
  playId: string
  teamId?: string
  coachArchetype?: CoachArchetypeId
  bonusType: 'execution' | 'reduced_turnover' | 'reduced_sack' | 'big_play' | 'red_zone' | 'third_down'
  bonusValue: number
}
```

Ex.: Offensive Guru → bônus em passe/play action/red zone; Defensive Mastermind → disfarces de cobertura e blitz situacional; Special Teams Ace → fake punt/punt coverage/field position.

### 8B.23 Special Teams Playbook

Special Teams deixa de ser automático em momentos críticos. Jogadas: punt normal/direcional/curto, fake punt run/pass, field goal, fake FG, extra point, two-point, kickoff deep, squib kick, onside kick, safe/aggressive return, fair catch. Usam KPW, KAC, velocidade dos retornadores, awareness, special teams familiarity, risco de fumble, posição de campo, relógio, placar.

### 8B.24 Banco de Dados

Novas tabelas (DDL aditiva idempotente, coluna `data TEXT` JSON): `playbooks`, `playbook_plays`, `team_playbook_profiles`, `custom_playbooks`, `playbook_familiarity`, `play_mastery`, `play_usage_memory`, `signature_plays`. Singletons por save/time do usuário (controlMode, profile ativo, familiaridade, signature) podem viver no `meta` KV, seguindo o padrão de `userScheme`/`userDepth`.

```ts
interface PlaybookRow { id: string; name: string; type: PlaybookType; baseScheme: string;
  createdBy: 'system'|'user'|'imported'; isDefault: boolean; isCustom: boolean; payloadJson: string;
  createdAt: string; updatedAt: string }
interface PlaybookPlayRow { id: string; playbookId: string; playId: string; category: PlayCategory;
  sortOrder: number; isFavorite: boolean }
```

### 8B.25 Serviços

`src/main/services/playbook-service.ts` — listar/criar/clonar/renomear playbooks, adicionar/remover jogadas, validar limites, importar/exportar JSON, atribuir ao time, calcular familiaridade. `src/main/services/play-call-service.ts` — buscar jogadas disponíveis para o estado atual, recomendar, registrar play call, enviar ao motor, atualizar uso/familiaridade/previsibilidade.

### 8B.26 IPC

```txt
playbook:list · playbook:get · playbook:create · playbook:clone · playbook:update · playbook:rename
playbook:addPlay · playbook:removePlay · playbook:setFavorite · playbook:setActive · playbook:export
playbook:import · playbook:familiarity
playcall:getAvailable · playcall:getRecommended · playcall:startGame · playcall:getState · playcall:choose
playcall:advance · playcall:delegate · playcall:finishGame · playcall:getHistory
settings:setControlMode
```

### 8B.27 Telas e Componentes

Nova rota `/game/playbooks`. Componentes: `PlaybookHubScreen`, `PlaybookEditorScreen`, `PlaybookPlayCard`, `PlaybookCategoryTabs`, `PlaybookFormationFilter`, `PlaybookSituationRules`, `PlayCallOverlay`, `PlayCallCard`, `CoordinatorRecommendationCard`, `PlaybookFamiliarityBar`, `PlayRiskRewardMeter`. `GameDayScreen` passa a ter o fluxo: Pré-jogo → Kickoff → **antes do snap: Choose Next Play** → resolução → play-by-play → próximo snap → pós-jogo. Em `simulation_only` o overlay não aparece; em `key_moments` só em situações decisivas; em `full_coach_control` antes de todo snap do time do usuário.

### 8B.28 Testes (core/)

1. **Playbook validation** — sem mínimo de jogadas, trick acima do limite, jogada incompatível com tipo.
2. **Determinismo** — mesma seed + mesmas play calls = mesmo resultado; play calls diferentes = resultado diferente mas reproduzível.
3. **Play recommendation** — coerente com down/distance; FG/punt em situação plausível; defesa contra tendência.
4. **Familiaridade** — baixa familiaridade ↑ erro; training camp ↑ familiaridade; repetição ↑ mastery.
5. **Previsibilidade** — repetir jogada gera penalidade; IA adapta resposta defensiva.
6. **Special Teams** — fake punt/onside = risco alto; FG respeita distância, KPW/KAC e clima.

### 8B.29 Ordem de Construção

- **M5.5 — Playbook Foundation:** tipos puros em `core/domain/playbook.ts`, biblioteca inicial de jogadas, playbooks padrão por scheme, atribuir playbook a cada time.
- **M5.6 — Playbook Editor:** listar/clonar/renomear, adicionar/remover jogadas, definir ativo.
- **M5.7 — Play Calling Engine:** `simulateGame`/motor interativo aceita `PlayCallInput`, registra playId no event log, aplica modificadores, mantém determinismo.
- **M5.8 — GameDay Play Call UI:** overlay de escolha, filtros por categoria, recomendações, modos Full/Key/Simulation.
- **M5.9 — Familiarity & Predictability:** mastery por jogada, penalidade por repetição, adaptação da IA, integração com training camp.

### 8B.30 Ajuste Estratégico

Esta mecânica muda o jogo de "manager que assiste" para **head coach que decide**. Os três modos equilibram: `simulation_only` (carreira rápida), `key_moments` (equilíbrio manager/coach), `full_coach_control` (tática profunda). Primeira implementação priorizada: **playbook padrão por time + escolher jogada ofensiva em Key Moments**; depois expande para defesa, special teams, editor completo e familiaridade.

---

## 9. Roster, Depth Chart & Stamina

### 9.1 Roster de 53
Cada franquia carrega **53 jogadores** (NCAA ~85 com walk-ons opcionais; MVP pode usar 53 uniforme). Distribuição-alvo:
- **Ataque (~25):** 3 QB, 4 RB/FB, 6 WR, 3 TE, 9 OL (LT/LG/C/RG/RT + reservas)
- **Defesa (~24):** 8 DL (DE/DT/NT), 7 LB (OLB/ILB/MLB), 9 DB (CB/FS/SS)
- **Special (~4):** 1 K, 1 P, 1 LS + 1 utility (KR/PR sai do roster)

### 9.2 Depth Chart
Ordenação por posição (starter → 2nd → 3rd). A tela de Roster (ex-Squad) gere isso via **campo de gridiron** com 11 tokens por unidade + arrastar-e-soltar (reserva sobre titular → modal de confirmação de troca), igual ao drag&drop do soccer. Três "unidades" com toggle: **Ataque / Defesa / Special Teams**.

### 9.3 Stamina
`maxStamina(raridade)` (legend 100 … bronze 75) e zonas verde/amarelo/vermelho, idênticas ao soccer. Fadiga acumula por **snaps** jogados; unidades diferentes desgastam independentemente (QB e OL jogam quase todos os snaps ofensivos; RB/WR rotacionam). Recuperação entre jogos (semana cheia). CPU recebe fadiga pseudo-aleatória por semana (exceto semana 1). Barras de stamina sob cada card/token em toda a UI.

### 9.4 Guardas de roster (validação pré-jogo)
`MIN_ROSTER = 46` ativos, e por unidade: ≥1 QB, ≥1 K/P (pode acumular), ≥5 OL, ≥4 DL, ≥3 LB, ≥4 DB. Se a escalação de qualquer unidade não fecha 11 disponíveis (lesão/suspensão), o jogo bloqueia e força ajuste — mesma UX do "jogador impedido" do soccer (modal um-a-um).

---

## 10. Economia — Salary Cap + Free Agency + Trades (+ Draft pós-MVP)

Modelo NFL real (substitui o mercado de transferências com taxa do soccer). NCAA usa variante de recrutamento/portal.

### 10.1 Salary Cap
- Cada liga com cap tem um teto (`LEAGUE_CAP`). `capSpace = LEAGUE_CAP − Σ capHit`. Não é permitido fechar contrato/trade que estoure o cap.
- `capHit` deriva de `valuation × ageMult × contractMult` (fórmula análoga a `computeMarketValue` do soccer) e do salário assinado.
- **Dead money** simplificado no MVP (cortar jogador libera cap parcial).

### 10.2 Free Agency
- Janela de FA (offseason/semana específica). Agentes livres com `satisfaction` = f(salário/demanda, anos, bônus, prestígio do time, papel prometido) — reaproveita `freeAgentSatisfaction` do soccer. Sem taxa de compra: só contrato.
- Olheiros/scouting alimentam a lista (relatórios progressivos 1-4 níveis — herdado).

### 10.3 Trades
- Troca de **jogadores e/ou draft picks** entre times. IA avalia por valor (trade value chart) + necessidade posicional (`needScore`) + cap. Contraproposta (≤4 rodadas), aceitar/recusar — máquina de estados herdada de `negotiation.ts`, reinterpretada (moeda = valor + picks, não dinheiro puro).
- Guarda: nenhum lado pode ficar abaixo das guardas de roster (§9.4) nem estourar o cap.

### 10.4 Draft (pós-MVP)
Documentado: draft anual de calouros (7 rodadas NFL), pool de prospects gerado, ordem inversa à classificação, scouting de calouros com incerteza. No MVP, a offseason re-sorteia FA + envelhece/desenvolve o elenco (rollover). **Implementado no §10B abaixo.**

---

## 10B. Sistema de Offseason, Draft, Pré-Temporada & Mercado Vivo

> Este sistema transforma o gerenciamento de elenco em um ciclo vivo, imprevisível e estratégico. O jogador não apenas "compra atletas": ele lê o mercado, negocia com agentes, reage a rumores, avalia jovens, seduz veteranos, disputa promessas com outras franquias e convive com consequências midiáticas.

### 10B.1 Visão Geral

Três grandes momentos de roster management:

1. **Offseason / Draft Season** — avaliação da temporada, renovações/cortes/aposentadorias/retornos, combine/scouting/draft board/Draft Night, Free Agency em ondas, assinatura de rookies e veteranos.
2. **Pré-Temporada** — training camp, jogos de pré-temporada, position battles, tryouts, cortes finais, ajuste de depth chart antes da Week 1.
3. **Mercado Vivo Durante a Temporada** — mercado muda após cada jogo; agentes anunciam disponibilidade; jovens surgem; veteranos/lendas cogitam retorno; insatisfeitos pedem trade; rivais entram em leilões; notícias/rumores afetam valor, moral e negociação.

Filosofia: **todo jogo altera o mercado** (lesão, derrota pesada, sequência de vitórias, QB em crise, rookie brilhando).

### 10B.2 Market Pulse Engine

Coração do sistema. `MarketPulse` = { seasonId, week, phase, volatility 0-100, heat 0-100, deadlinePressure, mediaIntensity, activeStories, availablePlayers, agentMessages, tradeBlock, comebackRumors, prospectWatch }. Recalculado em: depois de cada jogo do usuário; depois de cada semana; após lesões importantes; após insatisfação/holdout; em marcos fixos (Week 1/4/8, Trade Deadline, últimas 3 semanas, início dos playoffs, offseason). Ao completar jogo: `updateTeamNeeds → updateLeagueInjuries → updatePlayerMorale → updateAgentIntentions → rotateMarketListings → generateMarketStories → updateNewsFeed`.

### 10B.3 Tipos de Oportunidade

`MarketListingType = 'free_agent' | 'trade_block' | 'agent_pitch' | 'young_talent' | 'retired_legend' | 'practice_squad' | 'waiver_wire' | 'camp_invite' | 'international_prospect' | 'undrafted_rookie'`.

- **Free agents convencionais** — sem contrato (QB veterano, WR rápido baixo overall, CB de rotação, kicker, OL reserva).
- **Agent Pitch** — agente oferece jogador com prazo curto; pode falar com outros times; jogador pode aceitar menos por projeto ou exigir função. Campos: agente, jogador, tom (formal/aggressive/desperate/exclusive/media_leak), função esperada, anos mínimos, expectativa salarial/bônus, times concorrentes, motivação oculta.
- **Jovem Talento** — undrafted, practice-squad standout, cortado por rival, prospect internacional, college não-draftado, liga menor. **Fog of war**: vê potencial estimado, não o real (`visibleOverallRange`, `visiblePotentialRange`, `truePotential`, `boomBustRating`, `requiresTryout`).
- **Lenda aposentada querendo voltar** — raro. Gatilhos: último título, convite do HC, crise de lesões, rivalidade, pressão da mídia, falta de bons jogadores na posição, campanha forte. Equilíbrio: overall reduzido por idade+ferrugem, stamina menor, injury risk maior, contratos curtos (1-2 anos), alta exigência de função, alto impacto midiático/moral. `effectiveOverall = base - ageDecline - rustPenalty + motivationBoost + coachArchetypeBonus`.

### 10B.4 Player Persona / Career DNA

`PlayerPersona = 'ring_chaser' | 'money_first' | 'loyal_veteran' | 'prove_it' | 'spotlight_star' | 'quiet_professional' | 'locker_room_leader' | 'fragile_ego' | 'hometown_hero' | 'scheme_purist' | 'mercenary' | 'mentor' | 'comeback_story'`. Orienta negociação, moral, chance de pedir trade, aceitar contrato e reação ao mercado. Ex.: **Ring Chaser** aceita menos se contender/playoffs/QB forte/HC reputado; **Money First** prioriza salário/garantia/bônus/contrato longo; **Prove It** aceita curto com promessa de snaps; **Spotlight Star** quer mercado grande/papel de estrela/mídia; **Mentor** aceita papel secundário com rookies na posição.

### 10B.5 Negociação com Agentes

Mini-jogo de tensão com rodadas limitadas. `NegotiationSession` = { player, agent, team, status (open/waiting_agent/countered/accepted/rejected/stalled/leaked_to_media/signed_elsewhere), round, maxRounds, leverage, playerInterest 0-100, agentPatience 0-100, offers, promises, activeCompetingOffers }. **Oferta:** anos, salário/ano, bônus, % garantido, incentivos, função prometida, cláusulas. **Promessas** (quebra gera moral negativa): starter_role, wr1_role, feature_back, mentor_rookie, playoff_push, scheme_fit, captaincy_consideration, no_trade_this_season, development_plan. **Incentivos:** games_played/playoff/pro_bowl/yardage/sack/interception/touchdown/comeback bonus.

`playerInterest = base + money + role + contender + schemeFit + coachReputation + location + agentRelationship + mediaMomentum - capInstability - rosterCompetition - brokenPromises`. `NegotiationLeverage` = { teamNeed, playerMarketDemand, competingTeamsCount, agentPower, playerUrgency, deadlinePressure, recentPerformance }. Regras: mais necessidade → agente pede mais; mais times → menos paciência; perto da deadline → jogador útil mais caro; perto do fim → veteranos aceitam curto; sem mercado por semanas → reduz expectativa; leak à mídia → outros times entram.

**UI Agent Negotiation Room:** sala escura, card do jogador à esquerda (OVR/idade/posição/traits/histórico/fit/risco/expectativa), agente à direita (humor: calmo/confiante/pressionado/irritado/saindo), proposta ao centro (contract builder), interest meter (Frio/Ouvindo/Interessado/Muito interessado/Pronto para assinar), resposta textual com personalidade.

### 10B.6 Draft Season

`DraftPhase = 'class_reveal' | 'regional_scouting' | 'combine' | 'pro_days' | 'private_workouts' | 'draft_board_lock' | 'draft_night' | 'rookie_signing'`. Cada temporada gera `DraftClass` (força/fraqueza por posição, headliners, sleepers, bustRisks, prospects). `Prospect` = { nome, idade, posição, college, região, altura/peso, visibleGrade, projectedRound, projectedPickRange, trueOverall, truePotential, developmentTrait, combine, traits, redFlags, interviews, scoutingCompletion, revealedAttributes }.

**Scouting com fog of war** (4 níveis): (1) perfil básico; (2) 3-5 atributos em range + fit; (3) traits + red flags + entrevista parcial; (4) análise final (true range reduzido, comparação com elenco, bust risk, potencial de estrela).

**Draft Board:** o jogador ranqueia + tag (must_pick/target/value/avoid/sleeper/medical_risk). IA sugere por `bestPlayerAvailable*0.35 + teamNeed*0.25 + schemeFit*0.15 + developmentUpside*0.15 + capValue*0.10`.

**Draft Night:** clima de evento (palco, ticker de picks, war room, contagem, trades em tempo real). Opções: draftar, trocar pick p/ baixo, subir, delegar ao staff, pedir recomendação. Trade de picks (offeredPicks/requestedPicks/players, aiMotivation). Pick reveal com card do rookie, nota, reação da mídia, fit, comparação.

**Pós-Draft:** rookies entram como `unsigned_rookie`; assinar contratos (picks altos exigem mais, baixos aceitam curto/barato; estrelas podem holdout raro). Não assinar → rookie fora do camp, perde dev, moral baixa, agente vaza.

### 10B.7 Pré-Temporada

`PreSeasonPhase = 'training_camp' | 'position_battles' | 'preseason_week_1..3' | 'final_cuts' | 'depth_chart_lock'`. **Training Camp** foco (`TrainingCampFocus`: rookie_development, conditioning, scheme_installation, qb_timing, ol_cohesion, pass_rush, secondary_communication, special_teams) altera dev/stamina/chemistry/injury/moral. **Position Battles:** `battleScore = overall*0.35 + preseasonPerf*0.30 + schemeFit*0.15 + potential*0.10 + coachTrust*0.10`. **Jogos de pré-temporada:** `PreseasonGamePlan` (startersSnapPct, rookiesSnapPct, evaluatePosition, protectStars, testSchemeVariation) — proteger titulares/testar rookies/dar volume a battle/testar scheme, com trade-offs de lesão/chemistry/dev/ritmo. **Final Cuts:** keep/cut/practice_squad/trade com risco (dead money, reação de vestiário, waiver, virar rival, volta como FA depois). **Waiver Wire:** claim por prioridade (pior campanha → SoS → ordem fixa).

### 10B.8 Mercado Vivo Durante a Temporada

Rotação após cada jogo (`MarketRotationConfig`): regularWeek {expira 4-9, novos 6-12, rumor 0.35, agentPitch 0.28, retiredLegend 0.03, youngTalent 0.18, tradeDemand 0.08}; afterMajorInjury {rumor 0.55, agentPitch 0.40, retiredLegend 0.08, ...}; tradeDeadline {expira 8-15, novos 12-22, rumor 0.75, agentPitch 0.55, ...}. **Fontes** (`MarketSource`): agent_call, media_rumor, scout_tip, locker_room_noise, injury_replacement, deadline_push, retirement_watch, waiver_wire, practice_squad_report, college_showcase.

**Trade Market:** `TradeBlockItem` com reason (cap_casualty/rebuild/lost_starting_job/contract_dispute/scheme_mismatch/locker_room_issue/veteran_ring_chase/rookie_emergence) e mediaVisibility. `tradeValue = overallValue + potential + positionalScarcity + contractValue + teamNeedPremium + biddingWarPremium - age - injury - cap - morale`. Negociação ≤4 rodadas com respostas de IA. **Retorno de lendas:** estágios (rumor → training_video → agent_confirmation → private_workout → negotiation → signed/retired_again); `PrivateWorkoutResult` (fitness A-D, medicalRisk, rustPenalty, projectedOverallRange, mediaBuzz, recomendação).

### 10B.9 News & Feed

Toda contratação relevante gera **tela de Breaking News** (fundo âmbar, ticker BREAKING, escudo, card do jogador, headline grande, subtítulo com anos/valor, reação da torcida, impacto no depth chart, botões Ver contrato/Ir para roster). `NewsItem` = { type (signing/trade/draft_pick/comeback/holdout/injury/rumor/deadline), importance (low/medium/high/breaking), headline, subheadline, body, teamIds, playerIds, createdWeek, visualStyle (standard/breaking/draft/legend/deadline) }. **Feed** com abas: Breaking, Rumores, Transações, Draft, Lesões, Power Rankings, Meu Time.

### 10B.10 Persistência, Serviços, IPC, Telas

**Tabelas:** market_pulses, market_listings, agent_messages, negotiation_sessions, contract_offers, contract_promises, trade_block, trade_negotiations, draft_classes, draft_prospects, draft_boards, draft_picks, scouting_reports, preseason_battles, waiver_claims, retired_legends, news. **Serviços (`src/main/services/`):** market-service, negotiation-service, draft-service, preseason-service, agent-service, news-service, waiver-service, retired-legends-service. **IPC:** canais `market:*`, `negotiation:*`, `draft:*`, `preseason:*`, `news:*`. **Telas:** Market Hub (`/game/market`), Draft Center (`/game/draft`), Preseason Center (`/game/preseason`), News Center (`/game/news`).

### 10B.11 Integração com Head Coach Archetypes

Offensive Guru (atrai QB/WR/TE, dev ofensivo), Defensive Mastermind (atrai DL/LB/DB, scouting defensivo), Players' Coach (negocia insatisfeitos, reduz holdout, ajuda lendas), CEO/GM (melhora trades, reduz cap, negocia agentes), Special Teams Ace (acha kickers/punters, tryouts), Analytics (revela sleepers, melhora board, precisão de bust, contratos subvalorizados).

### 10B.12 Balanceamento

Por temporada: agent pitches 12-25, young talents 6-12, lendas 0-3, trade demands 3-10 (liga), holdouts 2-8, waiver gems 2-6, breaking news 10-25, rumores 40-80. Proteções: lendas com alto risco físico/contrato curto, promessas quebradas prejudicam reputação, cap trava empilhamento, bidding wars da IA, jovens com chance de bust, rumores falsos, jogador assina em outro time se o usuário enrolar.

### 10B.13 Ordem de Construção

M6.5 Market Pulse base → M7.1 Agent Negotiation (+ breaking news) → M7.2 Trade Block vivo → M7.3 Draft Center → M7.4 Pré-Temporada → M7.5 Legends & Young Talents → M7.6 News Center premium. Determinístico por seed, persistido no SQLite do save, validado por Zod, IPC tipado, testes no `core`. Primeiro fluxo jogável NFL: **mercado rotativo após jogo → negociação com agente → contratação → notícia → jogador no roster**.

---

## 11. Scouting

Herdado 1:1 do soccer (olheiros): buscas por critérios/nome/posição/idade/potencial, prioridades, **relatórios progressivos em 4 níveis** (do genérico ao "análise final + comparação com o seu depth chart"), monitorados. Duas modalidades: **pro scouting** (FA/trades) e, na NCAA, **recruiting** (recrutas do ensino médio / portal).

---

## 12. Eventos Surpresa (Calendário Vivo)

Deck reskin do soccer (24 cartas), mesmos **efeitos declarativos** (moraleDelta, fatigueDelta, injuryWeeksRange, cureInjury, budget/capPct, reputationDelta, potentialDelta, salaryPct, marketOffer, groupFilter). Ritual das **3 cartas viradas** (embaralhar → escolher → flip 3D), bloqueando avançar/jogar até resolver. Exemplos gridiron:
- **Positivas:** Bônus da Diretoria, Capitão Inspirado, Herói Improvável (reserva), Patrocinador Generoso, Semana de Descanso Extra, Promessa do Practice Squad.
- **Negativas:** Kicker em Crise, Festa Fora de Hora, Crise no Vestiário, Manchete Maliciosa, Lesão no Treino, Pressão da Torcida, Viagem Desgastante.
- **Mistas:** Holdout Contratual (star pede renovação), Oferta de Trade Misteriosa, Jovem Quer Titularidade, Agente Inconveniente.
- **Raras/Épicas:** Milagre no Departamento Médico, Discurso Histórico, Crise de Cap Relâmpago, Escândalo de Bastidores.

Financeiro proporcional (± % do cap/orçamento com piso/teto). Negativo capado ("destino, não punição"). Máx. 1 lendária por temporada.

---

## 13. Objetivos & Arquétipos de Head Coach

### 13.1 Objetivos por reputação (diretoria)
| Rep | Primário exemplo |
|---|---|
| 4 (Elite/Blueblood) | Vencer o título (Super Bowl/Grey Cup/UFL/National) |
| 3 | Chegar à final de conferência / bowl de acesso |
| 2 | Classificar aos playoffs |
| 1 | Terminar acima de .500 / não ser o pior da divisão |

Secundários sorteados: recorde em casa, X vitórias divisionais, cap saudável, desenvolver 2 rookies, defesa top-5 em pontos sofridos, sequência de vitórias. Avaliação contínua: `safe → observed → pressured → ultimatum → fired` (demissão = game over do save).

### 13.2 Arquétipos de HC (6)
- **Offensive Guru** — ataque evolui/rende mais; fraqueza: defesa menos responsiva.
- **Defensive Mastermind** — defesa forte, melhor em jogos truncados; fraqueza: menos explosão ofensiva.
- **Players' Coach** — moral recupera rápido, reação a derrotas; fraqueza: scouting menos preciso.
- **CEO/GM** — melhor gestão de cap e trades; fraqueza: impacto motivacional menor.
- **Special Teams Ace** — FGs/returns/field position; fraqueza: bônus ofensivo/defensivo menor.
- **Analytics** — relatórios precisos, garimpo de subvalorizados, 4th-down agressivo eficiente; fraqueza: torcida cética.

### 13.3 Head coaches reais por liga
Listas em `src/shared/coaches.ts` (`REAL_COACHES` por liga, com arquétipo e time associado — apenas rótulo). Ex. NFL: Andy Reid (offensive guru), Bill Belichick-style defensive mastermind, Sean McVay, Kyle Shanahan, Mike Tomlin, Dan Campbell (players' coach), John Harbaugh (special teams ace)… NCAA: técnicos de programas grandes. CFL/UFL: técnicos das ligas. (Melhor esforço; editáveis.)

---

## 14. Finanças

`officeFinance` (herdado) adaptado:
```ts
interface OfficeFinance {
  capSpace: number       // espaço de salary cap (ligas com cap)
  totalCapHit: number    // Σ capHit
  cashBudget: number     // caixa de operações / recrutamento (NCAA)
  rosterValue: number    // Σ valuation
  rosterSize: number
  avgOverall: number
}
```
**Premiação por fase de playoff** (receita ao avançar): Wild Card < Divisional < Conference < Título. Eventos podem ±% do cap/orçamento. Salários debitam implicitamente (restrição de cap, não tick semanal de caixa).

---

## 15. Geração Procedural de Jogadores

`generateRoster(rng, team)` cria 53 por template posicional. Por jogador: `overall base = f(prestige, depth)`, atributos rolados pelos **pesos do arquétipo** da posição (Gaussian em torno do alvo, recomputa overall a ±1), mentais Gaussianos, idade triangular (rookies 21-23; veteranos até ~38; K/P até 42), contrato/cap coerentes, 0-3 traits. Estrela do time recebe bônus. Determinístico por seed. `scripts/generate-seed.ts` lê rosters compactos (uma linha por jogador) e deriva o resto — mesmo pipeline do soccer.

**Linha compacta (Row) do seed:** `[first, last, age, nat, POS, overall, potential, jersey, traits?, secondary?]` — o gerador expande em atributos completos por arquétipo.

---

## 16. Seed Data (por liga)

- **NFL:** 32 franquias reais (nomes/cores/cidades/divisões) + rosters melhor-esforço (~53 cada; QB/skill/OL/DL/DB/K reais das temporadas recentes).
- **CFL:** 9 franquias + rosters.
- **UFL:** 8 franquias + rosters.
- **NCAA:** ~40 programas em conferências + rosters (nomes de calouros podem ser fictícios plausíveis).

Autoria por **fan-out de agentes** (um bloco por divisão/conferência), validando contagem/posições/números únicos, igual ao processo das 48 seleções da Copa. `teams.json` valida por Zod (`makeLeagueFileSchema(n)` por liga). Escudos = monograma minimalista (sem PNGs de logo).

---

## 17. Sistema Visual — Tema "Gridiron" (herda Betify)

Mesma base escura + neon, com accent adaptado ao gramado. Tokens `@theme` (trocar do verde-esmeralda para **âmbar-elétrico**, mantendo estrutura; verde continua disponível como alternativa trivial):

| Token | Valor proposto |
|---|---|
| `--color-bg-base` | `#0c0f10` (preto frio) |
| `--color-surface` / `--color-bg-raised` | `#14191b` / `#1b2225` |
| `--color-surface-hover` | `#1f282b` · `--color-border` `#28323644`→`#283236` |
| `--color-text-primary/secondary/muted` | `#eef2f4` / `#9fb0b5` / `#6c7d82` |
| `--color-accent` | `#ff9f1c` (âmbar neon) · `--color-accent-strong` `#f77f00` · `--color-accent-soft` `#3a2408` |
| `--color-neon` | `#ffb703` · positive `#3fd07a` · negative `#f2555f` · warning `#f5b73c` · gold `#e8c46a` |

Mantém: `--shadow-card/raise/hero/glow` (glow âmbar), `--grad-hero` (gradiente do gramado noturno), `--grad-neon`. Gradientes de raridade `data-tier` (bronze→legend) idênticos. Fonte Poppins. Classes `.sheen`, `.grad-border`, `.btn-neon`, `.glow`, `.card`, animações de evento (flip 3D, shuffle, float).

---

## 18. Telas (herdadas 1:1, reskin gridiron)

Rotas (hash router):
```
/                      MainMenuScreen        (caixas + Criador + sheen)
/new-career            NewCareerScreen        (wizard)
/game (GameLayout: TopNav + Outlet)
  /                    OfficeScreen           (sala do HC/GM)
  /roster              RosterScreen           (Depth Chart / Atletas / Cards)
  /competition         CompetitionScreen      (Standings / Playoffs)
  /calendar            CalendarScreen         (grade semanal + lista)
  /scouts              ScoutsScreen           (pro scouting / recruiting)
  /market              MarketScreen           (Free Agency / Trades / Cap / Histórico)
  /feed                FeedScreen
  /editor              EditorHubScreen        (4 tiles)
    /editor/teams      EditorScreen
    /editor/database   EditorDatabaseScreen
    /editor/save       EditorSaveScreen
    /editor/display    EditorDisplayScreen
/game-day              GameDayScreen          (pré-jogo → play-by-play → pós-jogo)
```

- **MainMenu:** caixas grandes (Nova Carreira / Carregar / Criador) com `.sheen`, arte de jogador (multiply). Criador mostra links do autor. Rodapé com versão.
- **NewCareer (wizard):** passos **`league` → `mode` → `team`/`customTeam` → `coachType` → `coach`/`realCoach` → `objectives`**.
  - **league:** caixas retangulares **empilhadas** (NFL, NCAA, CFL, UFL) com gradientes distintos + `.sheen` + `.grad-border`.
  - **mode:** "Criar Franquia" | "Escolher Franquia".
  - **team (estilo EA FC):** coluna esquerda agrupa por **conferência/divisão**; caixa central com escudo minimalista + setas ‹ ›, nome, estrelas de prestígio e médias **OFF / DEF / ST**; caixa direita com **preview do campo de gridiron** (11 titulares ofensivos posicionados).
  - **customTeam:** formulário (nome, nickname, abbr, cidade, cores ×2, estádio, conferência/divisão, prestígio) + fonte do roster (Gerar aleatório | Importar JSON) — as demais franquias da liga completam o número fixo (sorteio sem repetição, a excluída vira extra).
  - **coachType/coach:** criar HC (nome + arquétipo) ou escolher HC real da liga; **objectives:** metas da diretoria sorteadas.
- **Office:** header (escudo + franquia + HC + arquétipo + posição na divisão), banner de campeão (dourado), cartões de finanças (cap space / cap hit / valor do elenco / overall médio), metas (principais/secundárias com status), HeroMatchCard do próximo jogo (prob. vitória), últimos resultados, vizinhança na standings.
- **Roster (ex-Squad):** abas **Depth Chart** (campo de gridiron com toggle Ataque/Defesa/Special + drag&drop + reservas em cards + setas de formação/scheme) · **Atletas** (tabela ordenável: OVR, snaps, stats da posição — passing/rushing/receiving/tackles/sacks/INT — cartões de status, lesão, stamina) · **Cards** (coleção UT com busca + filtro por posição/raridade). StatsPanel lateral com atributos, estrelas de capacidade/potencial, traits.
- **Competition:** **Standings** por divisão/conferência (W-L-T, PCT, PF, PA, DIFF, streak, Últimos 5 com FormPills W/L/T; tinta de zona: playoff / bolha / eliminado) + aba **Playoffs** (bracket seeded). NCAA: ranking + bracket de 12.
- **Calendar:** grade **semanal** (temporada set→jan/fev; UFL primavera) + lista por fase; chip do dia com escudo do adversário + placar/local + ✨ evento pendente; "ir para a semana atual". Bolinha verde/vermelha no vencedor/perdedor na lista (herdado).
- **GameDay/Match:** pré-jogo (depth charts lado a lado + probabilidades + escolha de scheme/uniforme) → **viewer play-by-play** (campo horizontal de gridiron com yard lines/end zones, marcador de linha de scrimmage e 1st-down, tokens das 11 posições, relógio/quarter/down&distance, narração jogada-a-jogada, gráfico de ímpeto, velocidades 1x/2x/pular) → **pós-jogo** com **sub-abas Resumo / Estatísticas / Meu Time / Standings** (box score, drives, líderes de passe/corrida/recepção, defensivos, timeline).
- **Scouts / Market / Feed / Editor (4 tiles) / PlayerEditor:** 1:1 com o soccer, reskin de termos. Market com abas **Free Agency / Trades / Cap / Histórico**.

---

## 19. Componentes (herdados)

`ClubCrest`→**TeamCrest** (só minimal: monograma/capacete das cores), `PlayerCard`/`PlayerCardMini`/`PlayerToken`/`PlayerPhoto` (raridade `data-tier`, foto genérica multiply, OVR, POS, 3 mini-stats por família de posição, StaminaBar, StatusStack de lesão/suspensão), `TopNav` (Escritório, Elenco, Feed, Calendário, Competição, Olheiros, Mercado, Editor — Mercado some/vira Recruiting na NCAA conforme regra), `HeroMatchCard`, `FormPills` (W/L/T), `StatusPill`, `StaminaBar`, `Stars`, `GridironPitch` (ex-MatchPitch: campo horizontal, yard lines a cada 10, hashmarks, end zones coloridas, tokens por posição), `TeamKit` (capacete + jersey SVG das cores), `SurpriseEventOverlay` (3 cartas), `PlayerEditor` (modo-deus com atributos gridiron + live overall/valuation), `ClubPitchPreview`→**FormationPreview** (11 ofensivos em perspectiva).

---

## 20. Contrato IPC (canais do MVP)

Mesma espinha do soccer, `league` no lugar de `competition`:
```
save:list / save:create / save:createCustom / save:load / save:delete / save:reset
game:snapshot / game:advanceWeek / season:new
roster:get / roster:stats / tactics:setScheme / tactics:setDepthChart / tactics:setUniform
world:teams(league) / world:teamPreview(teamId, league)
game:preview / game:play
calendar:get / events:get / events:choose
market:get / market:signFree / market:proposeTrade / market:respondTrade / market:release / market:cap
scout:createSearch / scout:deleteSearch / scout:watch / scout:report
editor:listTeams / editor:getTeam / editor:updateTeam / editor:addTeam / editor:setLeagueTeams
editor:updatePlayer / editor:createPlayer / editor:movePlayer / editor:deletePlayer
editor:exportTeams / editor:importTeams / editor:resetWorld
settings:get / settings:set   (minimalCrests: true fixo por ora) / settings:setControlMode
feed:get
playbook:list / playbook:get / playbook:create / playbook:clone / playbook:update / playbook:rename
playbook:addPlay / playbook:removePlay / playbook:setFavorite / playbook:setActive / playbook:export / playbook:import / playbook:familiarity
playcall:getAvailable / playcall:getRecommended / playcall:startGame / playcall:getState / playcall:choose / playcall:advance / playcall:delegate / playcall:finishGame / playcall:getHistory
```
Os canais `playbook:*` / `playcall:*` implementam o sistema de Playbooks & Play Calling (§8B.26).
Cada canal com `{ input Zod, output TS }` em `shared/ipc/contract.ts`; router valida input, chama service, serializa erro como `{ ok:false, code, message }`. Preload expõe `invoke()` genérico tipado. Zustand `gameStore` (snapshot, lastAdvance, advancing, minimalCrests) idêntico.

---

## 21. Testes (vitest, tudo em `core/`)

1. **Harness de distribuição** (chefe): 1000 sims/faixa de gap, bandas de placar/vitória/turnovers/jardas do §7.7 — ferramenta de tuning do `K`/`BALANCE`.
2. **Golden test** de reprodutibilidade (seed fixa → snapshot do play-by-play).
3. **Property test do schedule** por liga: nº correto de jogos, divisionais 2×, home/away balanceado, sem repetição indevida, semanas válidas.
4. **Standings & tiebreakers:** head-to-head, divisão, conferência, strength of victory (inclui empates a 3).
5. **Playoff bracket:** seeding correto, byes, avanço.
6. **Cap/FA/Trades:** não estoura cap; guardas de roster; contraproposta converge ≤4; satisfação de FA/veterano.
7. **Desenvolvimento:** 5 temporadas sem inflação de overall; aposentadorias repostas.

---

## 22. Ordem de Construção (jogável o quanto antes)

| # | Milestone | Resultado |
|---|---|---|
| 0 | Skeleton: electron-vite + Tailwind + better-sqlite3 (de-risk Windows primeiro) | Janela abre com MainMenu |
| 1 | Mundo: domain (Player gridiron, Team), rng, positions/ARCHETYPES, seed de 1 liga (NFL) | Mundo inspecionável em testes |
| 2 | Motor de partida drive/down + `BALANCE` + harness | CLI: simular 2 times dentro das bandas |
| 3 | Temporada headless: schedule + standings + tiebreakers + playoff bracket (NFL) | CLI: temporada completa até o campeão |
| 4 | Shell jogável: schema Drizzle + saves + IPC + React mínimo (standings, roster tabela, avançar semana, resultado em texto) | **Primeiro build jogável (NFL)** |
| 5 | Schemes + depth chart + GameDay viewer (replay play-by-play) | A parte "coach" vira real |
| 6 | Finanças + diretoria (objetivos, pressão, demissão = game over) | Stakes |
| 7 | Salary cap + Free Agency + Trades + scouting + telas | Loop de montar roster |
| 8 | Multi-temporada: desenvolvimento/aging, rollover, offseason | Loop MVP completo |
| 9 | Demais ligas (CFL/UFL/NCAA) como modos + eventos + feed + editor + polimento (cards UT, tema Gridiron) | Ship |

Cada milestone verifica com `tsc --noEmit`, `npm test`, `electron-vite build` e um smoke headless (`--smoke`) que cria save, joga temporada, playoffs e rollover.

**Extensão pós-M9 — Playbooks & Play Calling (§8B):** M5.5 Playbook Foundation → M5.6 Editor → M5.7 Play Calling Engine → M5.8 GameDay Play Call UI → M5.9 Familiarity & Predictability. Primeiro fluxo jogável: time tem playbook padrão → GameDay em Key Moments → escolhe jogada ofensiva → motor resolve (determinístico por seed) → play-by-play mostra o nome da jogada.

---

## 23. Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Rebuild nativo better-sqlite3 no Windows | Milestone 0 dedicado; `install-app-deps`; fallback sql.js |
| Motor de downs parecer aleatório/injusto | Harness de 1000 sims como tuning contínuo; pós-jogo explica matchup/turnovers/field position |
| Schedule/tiebreakers inválidos | Property tests por liga; construção determinística |
| 4 ligas explodirem escopo | NFL primeiro (M1-M8); demais ligas só no M9 como modos reskin da mesma máquina |
| Regras CFL/UFL divergentes | Flags no motor (`downsPerSet`, `playersOnField`, `fieldLength`, `rouge`, OT por liga) — não forks |
| Cap/economia quebrar em multi-temporada | Teste de 5 temporadas; dead money simplificado |
| Rosters reais imprecisos | Melhor esforço + Editor completo (modo-deus) resolve |

---

## 24. Prompt de Construção (resumo executável)

> Construa, em `C:\www\side-projects\american-football`, um manager de futebol americano em **Electron + TypeScript + React + SQLite** replicando a arquitetura, UI/UX e features do `continental-champions` (soccer), porém no universo do gridiron. **3 camadas** (core puro / main services+IPC / shared Zod / renderer React), **um SQLite por save**, **RNG determinístico**. Quatro ligas como **modos separados** (NFL 32, NCAA ~40, CFL 9, UFL 8) escolhidos no wizard. **Roster de 53** com depth chart por unidade (Ataque/Defesa/Special, 11 em campo; CFL 12). **Motor de partida realista por drives/downs** (4 quarters, 1ª-4ª descida, jardas, TD/FG/punt/turnover/safety, PAT/2pt, overtime por liga, timeline play-by-play persistida, momentum, fadiga por snaps, lesões, penalidades). **Atributos Madden-style** por família de posição com overall derivado de pesos de arquétipo; **cards Ultimate Team** com raridade/traits/stamina. **Schemes** ofensivos×defensivos com matriz de matchup + formações/personnel + sliders. **Salary cap + Free Agency + Trades** (draft pós-MVP) + scouting com relatórios em 4 níveis. **Eventos surpresa** (deck de cartas, ritual das 3 cartas), **objetivos** por reputação, **arquétipos de head coach** + coaches reais por liga, **finanças** (cap/receita de playoff). **UI herdada 1:1**: tema escuro neon "Gridiron" (accent âmbar), Poppins, componentes (TeamCrest minimal, PlayerCard UT, GridironPitch, HeroMatchCard, TopNav, SurpriseEventOverlay, PlayerEditor modo-deus), telas (MainMenu, NewCareer wizard, Office, Roster, Competition/Standings+Playoffs, Calendar, GameDay viewer, Scouts, Market, Feed, EditorHub de 4 tiles). **Apenas escudos minimalistas** (monograma das cores; logos oficiais desligados). Contrato IPC tipado por Zod, Zustand no renderer. Testes vitest: harness de distribuição de placares (tuning do K/BALANCE), property tests de schedule/bracket, tiebreakers, cap/FA/trades, desenvolvimento multi-temporada. Ordem de construção M0→M9 (NFL jogável primeiro; demais ligas no M9). Verificação por milestone: `tsc --noEmit` + `npm test` + `electron-vite build` + smoke headless (criar save → temporada → playoffs → rollover).

---

### Apêndice A — Mapa de tradução rápido (soccer → gridiron)

| Soccer | Gridiron |
|---|---|
| Club | Team/Franchise |
| Competition (ucl/worldcup) | League (nfl/cfl/ufl/ncaa) |
| 11 titulares + reservas (25) | 53-man roster, 11 por unidade (12 na CFL) |
| GK/CB/LB/RB/DM/CM/AM/LW/RW/ST | QB/RB/FB/WR/TE/OL(LT-LG-C-RG-RT) · DE/DT/NT/OLB/ILB/MLB/CB/FS/SS · K/P/LS |
| pac/sho/pas/dri/def/phy (+gk) | spd/acc/agi/str/awr/sta + thp/tha/car/bcv/trk/cth/rte/rbk/pbk/tak/prsh/bsh/cov/zcv/prc/kpw/kac |
| 7 playbooks + 12 formações | schemes off (7) × def (6) + personnel/formations + sliders |
| Segmento 15min → chance → gol | Drive → downs → jardas → TD(6+PAT/2pt)/FG(3)/punt/turnover/safety(2) |
| Liga suíça 36 / grupos 48 | Divisões + wild cards + playoff bracket por liga |
| Mercado (valor + taxa) | Salary cap + Free Agency + Trades (+ Draft pós-MVP) |
| Cartões amarelo/vermelho | Penalidades + ejeção rara |
| Traits (matador, motor, muralha…) | Traits (Cannon Arm, Iron Man, Brick Wall, Deep Threat, Sack Artist, Ice Veins, Fumble-Prone…) |
| Objetivos continentais | Objetivos: playoffs → divisão → conferência → título (Super Bowl/Grey Cup/UFL/National) |

### Apêndice B — Constantes iniciais sugeridas (calibrar no harness)

```
BALANCE = {
  K: 4.8,                          // sharpening força → jardas
  HOME_ADV: 1.03,
  BASE_PLAYS_PER_TEAM: 64,         // ~128 no jogo
  PASS_RATE_BASE: 0.57,
  SACK_P: 0.065, INT_P: 0.025, FUMBLE_P: 0.018, BIG_PLAY_P: 0.09,
  FG_BASE_BY_DISTANCE: { '<30': 0.97, '30-39': 0.90, '40-49': 0.78, '50+': 0.58 },
  PENALTY_P: 0.09,
  MOMENTUM_EFFECT: 0.15, MOMENTUM_GAIN_TD: 0.25, MOMENTUM_TO: 0.30, MOMENTUM_DECAY: 0.55,
  MORALE_SCALE: 500, FORM_SCALE: 500,
  FATIGUE_PER_SNAP: 0.8, FATIGUE_MAX_PENALTY: 0.22,
  CRIT_PERF_EXTRA: 0.93, CRIT_INJURY_MULT: 2.0,
  INJURY_P_PER_PLAY: 0.004,
  RATING_BASE: 6.2
}
```
