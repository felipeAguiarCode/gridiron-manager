import { useMemo } from 'react'

/**
 * Partículas de brasa subindo (leve, sobre a tela). Geradas uma vez; delays
 * negativos p/ já iniciarem em movimento (a tela não começa vazia). Usa a classe
 * `.ember` + keyframe `ember-rise` do theme.css. Compartilhada entre o menu
 * principal e a seleção de liga.
 */
export function Embers({ count = 26 }: { count?: number }): React.JSX.Element {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        dur: 7 + Math.random() * 9,
        delay: -Math.random() * 14,
        sway: (Math.random() * 2 - 1) * 44,
        op: 0.35 + Math.random() * 0.5
      })),
    [count]
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="ember"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              '--ember-x': `${p.sway}px`,
              '--ember-op': p.op
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
