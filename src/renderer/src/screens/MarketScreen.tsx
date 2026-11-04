import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import { tierOf, POSITION_LABEL } from '../lib/format'
import { NegotiationRoom } from '../components/NegotiationRoom'
import type { MarketView, MarketActionResult, MarketPulseView, TradeBlockView, LegendsView } from '@shared/ipc/contract'
import type { DraftPick, MarketListing, Player, Position } from '@core/domain/types'

type Tab = 'live' | 'fa' | 'trade' | 'block' | 'legends' | 'cap' | 'history'
const REASON_LABEL: Record<string, string> = { cap_casualty: 'corte de cap', rebuild: 'reconstrução', lost_starting_job: 'perdeu a vaga', contract_dispute: 'disputa contratual', scheme_mismatch: 'não encaixa no scheme', locker_room_issue: 'problema de vestiário', veteran_ring_chase: 'veterano em busca de anel', rookie_emergence: 'ascensão de rookie' }
const pickLabel = (p: DraftPick): string => `R${p.round} '${String(p.season).slice(-2)}`
const SOURCE_TAG: Record<string, string> = { agent_call: 'Agente', media_rumor: 'Rumor', scout_tip: 'Olheiro', injury_replacement: 'Lesão', college_showcase: 'College', practice_squad_report: 'PS', deadline_push: 'Deadline', retirement_watch: 'Retorno', waiver_wire: 'Waiver', locker_room_noise: 'Vestiário' }
const TYPE_TAG: Record<string, string> = { free_agent: 'Free Agent', agent_pitch: 'Oferta de Agente', young_talent: 'Jovem Talento', retired_legend: 'Lenda', practice_squad: 'Practice Squad', waiver_wire: 'Waiver', undrafted_rookie: 'Undrafted', trade_block: 'Trade Block' }
const money = (n: number): string => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`)

export function MarketScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const refreshSnapshot = useGameStore((s) => s.refreshSnapshot)
  const [mkt, setMkt] = useState<MarketView | null>(null)
  const [pulse, setPulse] = useState<MarketPulseView | null>(null)
  const [block, setBlock] = useState<TradeBlockView | null>(null)
  const [legends, setLegends] = useState<LegendsView | null>(null)
  const [tab, setTab] = useState<Tab>('live')
  const [msg, setMsg] = useState<string | null>(null)
  const [negotiatingId, setNegotiatingId] = useState<string | null>(null)
  const [tradeInitTeam, setTradeInitTeam] = useState<string | null>(null)

  const refreshPulse = (): void => { invoke('market:pulse').then(setPulse).catch(() => {}); invoke('market:tradeBlock').then(setBlock).catch(() => {}); invoke('market:legends').then(setLegends).catch(() => {}) }
  useEffect(() => { invoke('market:get').then(setMkt).catch(() => {}); refreshPulse() }, [])
  if (!snapshot || !mkt) return null

  const apply = (r: MarketActionResult): void => { setMkt(r.market); setMsg(r.message); refreshSnapshot() }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2">
          {(['live', 'fa', 'trade', 'block', 'legends', 'cap', 'history'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="rounded-md px-4 py-1.5 text-sm font-bold"
              style={{ background: tab === t ? 'var(--color-accent)' : 'var(--color-surface)', color: tab === t ? '#1a0f00' : 'var(--color-text-secondary)' }}>
              {t === 'live' ? 'Mercado Vivo' : t === 'fa' ? 'Free Agency' : t === 'trade' ? 'Trocas' : t === 'block' ? 'Trade Block' : t === 'legends' ? 'Lendas' : t === 'cap' ? 'Cap' : 'Histórico'}
            </button>
          ))}
        </div>
        <div className="text-sm">
          <span style={{ color: 'var(--color-text-muted)' }}>Cap Space: </span>
          <span className="font-black" style={{ color: mkt.capSpace >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{money(mkt.capSpace)}</span>
          <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>Roster {mkt.rosterSize}/53</span>
        </div>
      </div>

      {msg && <div className="card mb-3 p-2 text-center text-sm" style={{ color: 'var(--color-accent)' }}>{msg}</div>}

      {tab === 'live' && <LiveMarket pulse={pulse} onNegotiate={setNegotiatingId} />}
      {tab === 'fa' && <FreeAgency mkt={mkt} onSign={(id) => invoke('market:signFree', { playerId: id }).then(apply)} onRelease={(id) => invoke('market:release', { playerId: id }).then(apply)} />}
      {tab === 'trade' && <Trades mkt={mkt} userTeamId={snapshot.save.teamId} initialTeamId={tradeInitTeam} onResult={(r) => { apply(r); refreshPulse() }} />}
      {tab === 'block' && <TradeBlock data={block} onNegotiate={(teamId) => { setTradeInitTeam(teamId); setTab('trade') }} />}
      {tab === 'legends' && <Legends data={legends} onWorkout={(id) => invoke('market:legendWorkout', { legendId: id }).then((r) => setNegotiatingId(r.playerId)).catch(() => {})} />}
      {tab === 'cap' && <CapTab mkt={mkt} onRelease={(id) => invoke('market:release', { playerId: id }).then(apply)} />}
      {tab === 'history' && <History mkt={mkt} />}

      {negotiatingId && (
        <NegotiationRoom
          playerId={negotiatingId}
          onClose={() => { setNegotiatingId(null); refreshPulse() }}
          onSigned={(m) => { setMsg(m); invoke('market:get').then(setMkt).catch(() => {}); refreshPulse(); refreshSnapshot() }}
        />
      )}
    </div>
  )
}

function pct(v: number): string { return `${Math.round(v)}` }

function LiveMarket({ pulse, onNegotiate }: { pulse: MarketPulseView | null; onNegotiate: (id: string) => void }): React.JSX.Element {
  if (!pulse) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando mercado…</div>
  const meters: [string, number, string][] = [
    ['Volatilidade', pulse.pulse.volatility, 'var(--color-accent)'],
    ['Rumores', pulse.pulse.heat, 'var(--color-neon)'],
    ['Deadline', pulse.pulse.deadlinePressure, 'var(--color-negative)'],
    ['Mídia', pulse.pulse.mediaIntensity, 'var(--color-gold)']
  ]
  return (
    <div>
      {/* pulso */}
      <div className="card mb-3 grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        {meters.map(([label, v, color]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-[11px]"><span style={{ color: 'var(--color-text-muted)' }}>{label}</span><span className="font-bold" style={{ color }}>{pct(v)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-bg-base)' }}>
              <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
            </div>
          </div>
        ))}
      </div>
      {pulse.pulse.stories.length > 0 && (
        <div className="card mb-3 p-3">
          <div className="section-title mb-2">Na roda do mercado</div>
          {pulse.pulse.stories.map((s, i) => <div key={i} className="border-b py-1.5 text-sm last:border-0" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>• {s}</div>)}
        </div>
      )}
      {/* listagens */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {pulse.listings.map((l) => <ListingCard key={l.id} l={l} onNegotiate={onNegotiate} />)}
      </div>
      {pulse.listings.length === 0 && <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Mercado calmo. Avance a semana para novas oportunidades.</div>}
    </div>
  )
}

function ListingCard({ l, onNegotiate }: { l: MarketListing; onNegotiate: (id: string) => void }): React.JSX.Element {
  const p = l.player
  return (
    <div className="card flex items-center justify-between p-3">
      <div className="flex items-center gap-3">
        <TierNum overall={p.overall} />
        <div>
          <div className="text-sm font-semibold">{POSITION_LABEL[p.position]} {p.firstName} {p.lastName}</div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <span className="rounded px-1.5 py-0.5" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>{TYPE_TAG[l.type] ?? l.type}</span>
            <span>{p.age} anos · {SOURCE_TAG[l.source] ?? l.source}</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <button className="btn-neon rounded px-3 py-1 text-xs font-bold" onClick={() => onNegotiate(p.id)}>Negociar</button>
        <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>sai em {l.expiresInGames} {l.expiresInGames === 1 ? 'jogo' : 'jogos'}</div>
      </div>
    </div>
  )
}

function TierNum({ overall }: { overall: number }): React.JSX.Element {
  return <span data-tier={tierOf(overall)} className="inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-black text-white" style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))' }}>{overall}</span>
}

function FreeAgency({ mkt, onSign, onRelease }: { mkt: MarketView; onSign: (id: string) => void; onRelease: (id: string) => void }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card p-3">
        <div className="section-title mb-2">Agentes Livres ({mkt.freeAgents.length})</div>
        <div className="max-h-[60vh] overflow-auto">
          {mkt.freeAgents.map((p) => (
            <Row key={p.id} p={p} right={<button className="btn-neon rounded px-3 py-1 text-xs font-bold" onClick={() => onSign(p.id)}>Assinar {money(p.capHit)}</button>} />
          ))}
        </div>
      </div>
      <div className="card p-3">
        <div className="section-title mb-2">Seu Elenco — liberar para abrir espaço</div>
        <div className="max-h-[60vh] overflow-auto">
          {mkt.roster.map((p) => (
            <Row key={p.id} p={p} right={<button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-negative)' }} onClick={() => onRelease(p.id)}>Liberar</button>} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ p, right }: { p: Player; right: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-2">
        <TierNum overall={p.overall} />
        <div>
          <div className="text-sm font-semibold">{POSITION_LABEL[p.position]} {p.firstName} {p.lastName}</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{p.age} anos · {money(p.capHit)}</div>
        </div>
      </div>
      {right}
    </div>
  )
}

function Trades({ mkt, userTeamId, initialTeamId, onResult }: { mkt: MarketView; userTeamId: string; initialTeamId: string | null; onResult: (r: MarketActionResult) => void }): React.JSX.Element {
  const others = mkt.teams.filter((t) => t.id !== userTeamId)
  const [teamId, setTeamId] = useState(initialTeamId ?? others[0]?.id ?? '')
  const [theirRoster, setTheirRoster] = useState<Player[]>([])
  const [theirPicks, setTheirPicks] = useState<DraftPick[]>([])
  const [give, setGive] = useState<Set<string>>(new Set())
  const [get, setGet] = useState<Set<string>>(new Set())
  const [givePk, setGivePk] = useState<Set<string>>(new Set())
  const [getPk, setGetPk] = useState<Set<string>>(new Set())

  useEffect(() => { if (initialTeamId) setTeamId(initialTeamId) }, [initialTeamId])
  useEffect(() => {
    if (teamId) invoke('roster:get', { teamId }).then((r) => { setTheirRoster(r.players); setTheirPicks(r.picks) }).catch(() => {})
    setGive(new Set()); setGet(new Set()); setGivePk(new Set()); setGetPk(new Set())
  }, [teamId])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string): void => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n)
  }
  const propose = (): void => {
    invoke('market:proposeTrade', { giveIds: [...give], getTeamId: teamId, getIds: [...get], givePickIds: [...givePk], getPickIds: [...getPk] }).then(onResult)
  }
  const canPropose = (give.size > 0 || givePk.size > 0) && (get.size > 0 || getPk.size > 0)

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Negociar com:</span>
        <select className="input-mk !w-auto" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn-neon ml-auto rounded px-5 py-1.5 text-sm font-bold disabled:opacity-40" disabled={!canPropose} onClick={propose}>Propor Troca</button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-3">
          <div className="section-title mb-2">Você envia ({give.size + givePk.size})</div>
          <div className="max-h-[55vh] overflow-auto">
            {mkt.myPicks.map((pk) => <PickRow key={pk.id} pk={pk} sel={givePk.has(pk.id)} onClick={() => toggle(givePk, setGivePk, pk.id)} />)}
            {mkt.roster.map((p) => <SelRow key={p.id} p={p} sel={give.has(p.id)} onClick={() => toggle(give, setGive, p.id)} />)}
          </div>
        </div>
        <div className="card p-3">
          <div className="section-title mb-2">Você recebe ({get.size + getPk.size})</div>
          <div className="max-h-[55vh] overflow-auto">
            {theirPicks.map((pk) => <PickRow key={pk.id} pk={pk} sel={getPk.has(pk.id)} onClick={() => toggle(getPk, setGetPk, pk.id)} />)}
            {theirRoster.map((p) => <SelRow key={p.id} p={p} sel={get.has(p.id)} onClick={() => toggle(get, setGet, p.id)} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function PickRow({ pk, sel, onClick }: { pk: DraftPick; sel: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between border-b py-1.5 text-left last:border-0" style={{ borderColor: 'var(--color-border)', background: sel ? 'var(--color-accent-soft)' : undefined }}>
      <span className="flex items-center gap-2">
        <span className="inline-flex h-6 items-center justify-center rounded px-1.5 text-[10px] font-black" style={{ background: 'var(--color-bg-raised)', color: 'var(--color-neon)' }}>PICK</span>
        <span className="text-sm">Rodada {pk.round} · Draft {pk.season}</span>
      </span>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{pickLabel(pk)}{sel ? ' ✓' : ''}</span>
    </button>
  )
}

function TradeBlock({ data, onNegotiate }: { data: TradeBlockView | null; onNegotiate: (teamId: string) => void }): React.JSX.Element {
  if (!data) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando…</div>
  if (data.items.length === 0) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum jogador no bloco de trocas. Avance a semana.</div>
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {data.items.map((it) => (
        <div key={it.id} className="card flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <TierNum overall={it.player.overall} />
            <div>
              <div className="text-sm font-semibold">{POSITION_LABEL[it.player.position as Position]} {it.player.firstName} {it.player.lastName}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{it.teamAbbr} · {REASON_LABEL[it.reason] ?? it.reason} · pede ~{money(it.askingValue)}</div>
            </div>
          </div>
          <button className="btn-neon rounded px-3 py-1 text-xs font-bold" onClick={() => onNegotiate(it.teamId)}>Negociar troca</button>
        </div>
      ))}
    </div>
  )
}

function SelRow({ p, sel, onClick }: { p: Player; sel: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between border-b py-1.5 text-left last:border-0" style={{ borderColor: 'var(--color-border)', background: sel ? 'var(--color-accent-soft)' : undefined }}>
      <span className="flex items-center gap-2">
        <TierNum overall={p.overall} />
        <span className="text-sm">{POSITION_LABEL[p.position]} {p.lastName}</span>
      </span>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{money(p.marketValue)}{sel ? ' ✓' : ''}</span>
    </button>
  )
}

function Legends({ data, onWorkout }: { data: LegendsView | null; onWorkout: (id: string) => void }): React.JSX.Element {
  if (!data) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando…</div>
  if (data.legends.length === 0) return <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhuma lenda cogitando retorno no momento.</div>
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {data.legends.map((l) => (
        <div key={l.id} className="card flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <TierNum overall={l.effectiveOverall} />
            <div>
              <div className="text-sm font-semibold">{POSITION_LABEL[l.position as Position] ?? l.position} {l.firstName} {l.lastName}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{l.age} anos · pico {l.peakOverall} OVR · agora ~{l.effectiveOverall} (ferrugem) · risco alto</div>
            </div>
          </div>
          <button className="btn-neon rounded px-3 py-1 text-xs font-bold" onClick={() => onWorkout(l.id)}>Sondar retorno</button>
        </div>
      ))}
    </div>
  )
}

function CapTab({ mkt, onRelease }: { mkt: MarketView; onRelease: (id: string) => void }): React.JSX.Element {
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="card p-3 text-center"><div className="text-xl font-black" style={{ color: 'var(--color-accent)' }}>{money(mkt.leagueCap)}</div><div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Salary Cap</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black">{money(mkt.totalCapHit)}</div><div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Cap Hit Total</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black" style={{ color: mkt.capSpace >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{money(mkt.capSpace)}</div><div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Espaço</div></div>
      </div>
      <div className="card p-3">
        <div className="section-title mb-2">Contratos (por cap hit)</div>
        {[...mkt.roster].sort((a, b) => b.capHit - a.capHit).map((p) => (
          <Row key={p.id} p={p} right={
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold">{money(p.capHit)}</span>
              <button className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-negative)' }} onClick={() => onRelease(p.id)}>cortar</button>
            </span>
          } />
        ))}
      </div>
    </div>
  )
}

function History({ mkt }: { mkt: MarketView }): React.JSX.Element {
  return (
    <div className="card p-4">
      <div className="section-title mb-2">Transações</div>
      {mkt.transactions.length === 0 && <div className="py-4 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhuma transação ainda</div>}
      {mkt.transactions.map((t, i) => (
        <div key={i} className="flex items-center gap-2 border-b py-2 text-sm last:border-0" style={{ borderColor: 'var(--color-border)' }}>
          <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: t.type === 'sign' ? 'var(--color-positive)' : t.type === 'release' ? 'var(--color-negative)' : 'var(--color-accent)', color: '#0c0f10' }}>{t.type.toUpperCase()}</span>
          <span>{t.text}</span>
          <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>S{t.seasonNumber} Sem {t.week}</span>
        </div>
      ))}
    </div>
  )
}
