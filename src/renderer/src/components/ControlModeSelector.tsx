import { useGameStore } from '../stores/gameStore'
import type { GameControlMode } from '@core/domain/playbook'

const MODES: { id: GameControlMode; label: string; desc: string }[] = [
  { id: 'simulation_only', label: 'Simulação', desc: 'A IA chama tudo — manager clássico.' },
  { id: 'key_moments', label: 'Momentos-Chave', desc: 'Você decide em jogadas decisivas.' },
  { id: 'full_coach_control', label: 'Controle Total', desc: 'Você chama toda jogada ofensiva.' }
]

export function ControlModeSelector(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const setControlMode = useGameStore((s) => s.setControlMode)
  if (!snapshot) return null
  const current = snapshot.controlMode

  return (
    <div>
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setControlMode(m.id)}
            className="flex-1 rounded-md px-3 py-2 text-sm font-bold transition-colors"
            style={{
              background: current === m.id ? 'var(--color-accent)' : 'var(--color-surface)',
              color: current === m.id ? '#1a0f00' : 'var(--color-text-secondary)'
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {MODES.find((m) => m.id === current)?.desc}
      </div>
    </div>
  )
}
