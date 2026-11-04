import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { tierOf, POSITION_LABEL } from '../lib/format'
import type { NegotiationView } from '@shared/ipc/contract'
import type { DepthRole } from '@core/domain/types'

const money = (n: number): string => `$${(n / 1_000_000).toFixed(1)}M`
const ROLES: DepthRole[] = ['depth', 'rotation', 'starter', 'star']
const ROLE_LABEL: Record<DepthRole, string> = { star: 'Protagonista', starter: 'Titular', rotation: 'Rotação', depth: 'Elenco' }

function interestLabel(v: number): string {
  if (v >= 85) return 'Pronto para assinar'
  if (v >= 68) return 'Muito interessado'
  if (v >= 52) return 'Interessado'
  if (v >= 38) return 'Ouvindo'
  return 'Frio'
}
function agentMood(patience: number): string {
  if (patience >= 75) return 'Calmo'
  if (patience >= 50) return 'Confiante'
  if (patience >= 28) return 'Pressionado'
  if (patience > 0) return 'Irritado'
  return 'Saindo da mesa'
}

/** Sala de negociação com o agente (§10B.5/10B.6). */
export function NegotiationRoom({ playerId, onClose, onSigned }: { playerId: string; onClose: () => void; onSigned: (msg: string) => void }): React.JSX.Element {
  const [view, setView] = useState<NegotiationView | null>(null)
  const [years, setYears] = useState(2)
  const [salaryM, setSalaryM] = useState(2)
  const [role, setRole] = useState<DepthRole>('rotation')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    invoke('negotiation:start', { playerId }).then((v) => {
      setView(v)
      if (v.session) {
        setYears(v.session.expectation.years)
        setSalaryM(Math.max(0.75, Math.round((v.session.expectation.salaryPerYear / 1_000_000) * 10) / 10))
        setRole(v.session.expectation.role)
      }
    }).catch(() => onClose())
  }, [playerId, onClose])

  if (!view || !view.player || !view.session) {
    return <Backdrop onClose={onClose}><div className="card p-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>Abrindo negociação…</div></Backdrop>
  }
  const { session, player } = view
  const done = session.status === 'accepted' || session.status === 'rejected' || session.status === 'signed_elsewhere'

  const submit = (): void => {
    setBusy(true)
    invoke('negotiation:submitOffer', { years, salaryPerYear: Math.round(salaryM * 1_000_000), rolePromise: role })
      .then((v) => { setView(v); setBusy(false) })
      .catch(() => setBusy(false))
  }
  const takeCounter = (): void => {
    if (!session.counter) return
    setYears(session.counter.years)
    setSalaryM(Math.round((session.counter.salaryPerYear / 1_000_000) * 10) / 10)
    if (session.counter.rolePromise) setRole(session.counter.rolePromise)
  }
  const finalize = (): void => {
    setBusy(true)
    invoke('negotiation:finalize').then((r) => { setBusy(false); onSigned(r.message); onClose() }).catch(() => setBusy(false))
  }
  const walk = (): void => { invoke('negotiation:walkAway').finally(onClose) }

  return (
    <Backdrop onClose={walk}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-raise)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--grad-hero)' }}>
          <div className="section-title" style={{ color: 'var(--color-accent)' }}>Sala de Negociação · Rodada {session.round}/{session.maxRounds}</div>
          <button onClick={walk} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Sair ✕</button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[240px_1fr]">
          {/* card do jogador */}
          <div className="card p-4 text-center">
            <div data-tier={tierOf(player.overall)} className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-black text-white" style={{ background: 'linear-gradient(160deg,var(--tier-from),var(--tier-to))' }}>{player.overall}</div>
            <div className="mt-2 text-sm font-normal" style={{ color: 'var(--color-text-secondary)' }}>{player.firstName}</div>
            <div className="text-lg font-black">{player.lastName}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-accent)' }}>{POSITION_LABEL[player.position]} · {player.age} anos</div>
            <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Valor de mercado ~{money(player.capHit)}</div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Perfil: {(player.persona ?? '').replace(/_/g, ' ')}</div>
            {view.hasCap && <div className="mt-2 text-[11px]">Cap livre: <span style={{ color: view.capSpace >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{money(view.capSpace)}</span></div>}
          </div>

          {/* negociação */}
          <div>
            {/* interest + agent mood */}
            <div className="mb-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-[11px]"><span style={{ color: 'var(--color-text-muted)' }}>Interesse</span><span className="font-bold" style={{ color: 'var(--color-accent)' }}>{interestLabel(session.playerInterest)}</span></div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--color-bg-base)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${session.playerInterest}%`, background: 'var(--grad-neon)' }} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Agente</div>
                <div className="text-xs font-bold">{agentMood(session.agentPatience)}</div>
              </div>
            </div>

            {/* fala do agente */}
            <div className="card mb-3 p-3 text-sm" style={{ borderLeft: '3px solid var(--color-accent)' }}>“{session.agentLine}”</div>

            {session.competingTeams.length > 0 && !done && (
              <div className="mb-3 text-[11px]" style={{ color: 'var(--color-warning)' }}>Concorrência: {session.competingTeams.join(', ')} de olho.</div>
            )}

            {session.status === 'countered' && session.counter && (
              <div className="mb-3 flex items-center justify-between rounded-md p-2 text-xs" style={{ background: 'var(--color-accent-soft)' }}>
                <span>Contraproposta: {session.counter.years}a · {money(session.counter.salaryPerYear)}/ano · {ROLE_LABEL[session.counter.rolePromise ?? 'rotation']}</span>
                <button className="rounded px-2 py-0.5 font-bold" style={{ background: 'var(--color-accent)', color: '#1a0f00' }} onClick={takeCounter}>Usar</button>
              </div>
            )}

            {!done && (
              <div className="card p-3">
                <div className="section-title mb-2">Sua proposta</div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="text-xs">Anos
                    <input type="number" min={1} max={6} value={years} onChange={(e) => setYears(Math.max(1, Math.min(6, +e.target.value)))} className="input-mk mt-1" />
                  </label>
                  <label className="text-xs">Salário/ano ($M)
                    <input type="number" min={0.75} step={0.1} value={salaryM} onChange={(e) => setSalaryM(Math.max(0.75, +e.target.value))} className="input-mk mt-1" />
                  </label>
                  <label className="text-xs">Função
                    <select value={role} onChange={(e) => setRole(e.target.value as DepthRole)} className="input-mk mt-1">
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </label>
                </div>
                <button className="btn-neon mt-3 w-full rounded-md py-2 font-bold disabled:opacity-40" disabled={busy} onClick={submit}>Enviar proposta</button>
              </div>
            )}

            {session.status === 'accepted' && (
              <button className="btn-neon w-full rounded-md py-3 font-black disabled:opacity-40" disabled={busy} onClick={finalize}>✓ Assinar contrato</button>
            )}
            {(session.status === 'rejected' || session.status === 'signed_elsewhere') && (
              <button className="w-full rounded-md py-3 font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={onClose}>Fechar</button>
            )}
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(6,9,10,0.72)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}
