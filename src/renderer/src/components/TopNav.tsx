import { NavLink, useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/gameStore'
import { TeamCrest } from './TeamCrest'
import { PHASE_LABEL } from '../lib/format'

const ITEMS = [
  { to: '/game', label: 'Home', end: true },
  { to: '/game/roster', label: 'Time', end: false },
  { to: '/game/playbooks', label: 'Playbook', end: false },
  { to: '/game/calendar', label: 'Calendário', end: false },
  { to: '/game/scouts', label: 'Olheiros', end: false },
  { to: '/game/market', label: 'Mercado', end: false },
  { to: '/game/draft', label: 'Draft', end: false },
  { to: '/game/preseason', label: 'Pré-Temp', end: false },
  { to: '/game/editor', label: 'Editor', end: false }
]

export function TopNav(): React.JSX.Element {
  const snapshot = useGameStore((s) => s.snapshot)
  const navigate = useNavigate()
  const team = snapshot?.team

  return (
    <nav className="flex items-center gap-4 border-b px-4 py-2" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
      <button onClick={() => navigate('/')} className="text-lg" style={{ color: 'var(--color-text-muted)' }} title="Menu principal">
        ‹
      </button>
      {team && <TeamCrest abbr={team.abbr} colors={team.colors} size={34} />}
      <div className="mr-2">
        <div className="text-sm font-bold leading-tight">{team ? `${team.name} ${team.nickname}` : 'Gridiron'}</div>
        <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {snapshot ? `${PHASE_LABEL[snapshot.save.phase]} · Semana ${snapshot.save.week}` : ''}
        </div>
      </div>
      <div className="flex flex-1 items-center gap-1">
        {ITEMS.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'}`
            }
            style={({ isActive }) => (isActive ? { background: 'var(--color-surface-hover)', boxShadow: 'inset 0 -2px 0 var(--color-accent)' } : undefined)}
          >
            {it.label}
          </NavLink>
        ))}
      </div>
      <div className="text-right">
        <div className="text-sm font-bold">
          {team ? `${team.wins}-${team.losses}${team.ties ? '-' + team.ties : ''}` : ''}
        </div>
        <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {snapshot?.save.coachName}
        </div>
      </div>
    </nav>
  )
}
