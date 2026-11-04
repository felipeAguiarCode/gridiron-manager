import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { TeamCrest } from '../components/TeamCrest'
import { FormPills } from '../components/FormPills'
import { recordStr } from '../lib/format'
import type { StandingView } from '@shared/ipc/contract'

const ZONE_TINT: Record<string, string> = {
  division_leader: 'rgba(63,208,122,0.10)',
  wildcard: 'rgba(255,159,28,0.10)',
  bubble: 'transparent',
  eliminated: 'transparent'
}

export function CompetitionScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const [conf, setConf] = useState<string | null>(null)
  if (!snapshot) return null
  const conferences = [...new Set(snapshot.standings.map((s) => s.conference))]
  const active = conf ?? conferences[0]
  const divisions = [...new Set(snapshot.standings.filter((s) => s.conference === active).map((s) => s.division))]

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex gap-2">
        {conferences.map((c) => (
          <button key={c} onClick={() => setConf(c)} className="rounded-md px-4 py-1.5 text-sm font-bold transition"
            style={{ background: c === active ? 'var(--color-accent)' : 'var(--color-surface)', color: c === active ? '#1a0f00' : 'var(--color-text-secondary)' }}>
            {c}
          </button>
        ))}
      </div>

      {divisions.map((div) => {
        const rows = snapshot.standings.filter((s) => s.conference === active && s.division === div).sort((a, b) => a.position - b.position)
        return (
          <div key={div} className="card mb-4 overflow-hidden">
            <div className="section-title px-4 pt-3">{active} {div}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="text-center">W-L-T</th>
                  <th className="text-center">PCT</th>
                  <th className="text-center">PF</th>
                  <th className="text-center">PA</th>
                  <th className="text-center">DIFF</th>
                  <th className="px-3 text-right">Últimos 5</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => <Row key={s.teamId} s={s} userId={snapshot.team.id} />)}
              </tbody>
            </table>
          </div>
        )
      })}
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span style={{ color: 'var(--color-positive)' }}>▉</span> líder de divisão · <span style={{ color: 'var(--color-accent)' }}>▉</span> wild card
      </div>
    </div>
  )
}

function Row({ s, userId }: { s: StandingView; userId: string }): React.JSX.Element {
  return (
    <tr style={{ background: ZONE_TINT[s.zone], fontWeight: s.teamId === userId ? 700 : 400 }}>
      <td className="flex items-center gap-2 px-3 py-2">
        <TeamCrest abbr={s.abbr} colors={s.colors} size={22} />
        <span style={s.teamId === userId ? { color: 'var(--color-accent)' } : undefined}>{s.name}</span>
      </td>
      <td className="text-center">{recordStr(s.wins, s.losses, s.ties)}</td>
      <td className="text-center">{s.pct.toFixed(3).replace(/^0/, '')}</td>
      <td className="text-center">{s.pointsFor}</td>
      <td className="text-center">{s.pointsAgainst}</td>
      <td className="text-center" style={{ color: s.pointDiff >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{s.pointDiff >= 0 ? '+' : ''}{s.pointDiff}</td>
      <td className="px-3 py-2"><div className="flex justify-end"><FormPills last5={s.last5} /></div></td>
    </tr>
  )
}
