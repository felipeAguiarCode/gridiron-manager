interface GridironPitchProps {
  los: number // linha de scrimmage (0-100 absoluto: 0 = end zone esquerda, 100 = direita)
  firstDown: number
  ball: number
  attackingRight: boolean
  home: { abbr: string; colors: { primary: string; secondary: string } }
  away: { abbr: string; colors: { primary: string; secondary: string } }
}

// campo ocupa 8%..92% da largura; end zones nas pontas
const x = (yard: number): number => 8 + (Math.max(0, Math.min(100, yard)) / 100) * 84

export function GridironPitch({ los, firstDown, ball, attackingRight, home, away }: GridironPitchProps): React.JSX.Element {
  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ height: 200, background: 'linear-gradient(180deg,#0f2417,#0c1a12)', border: '1px solid var(--color-border)' }}>
      {/* end zones */}
      <div className="absolute inset-y-0 left-0 flex items-center justify-center" style={{ width: '8%', background: home.colors.primary, opacity: 0.85 }}>
        <span className="rotate-180 text-[10px] font-black text-white [writing-mode:vertical-rl]">{home.abbr}</span>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center justify-center" style={{ width: '8%', background: away.colors.primary, opacity: 0.85 }}>
        <span className="text-[10px] font-black text-white [writing-mode:vertical-rl]">{away.abbr}</span>
      </div>

      {/* yard lines a cada 10 + números */}
      {Array.from({ length: 11 }, (_, i) => i * 10).map((yd) => (
        <div key={yd} className="absolute inset-y-0" style={{ left: `${x(yd)}%`, width: 1, background: 'rgba(255,255,255,0.18)' }}>
          {yd > 0 && yd < 100 && (
            <span className="absolute top-1 -translate-x-1/2 text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {yd <= 50 ? yd : 100 - yd}
            </span>
          )}
        </div>
      ))}
      {/* hashmarks */}
      {Array.from({ length: 20 }, (_, i) => i * 5).map((yd) => (
        <div key={'h' + yd} className="absolute" style={{ left: `${x(yd)}%`, top: '38%', width: 1, height: 6, background: 'rgba(255,255,255,0.25)' }} />
      ))}

      {/* linha de 1º down (amarela) */}
      <div className="absolute inset-y-0" style={{ left: `${x(firstDown)}%`, width: 2, background: '#f5d000', boxShadow: '0 0 6px #f5d000' }} />
      {/* linha de scrimmage (azul) */}
      <div className="absolute inset-y-0" style={{ left: `${x(los)}%`, width: 2, background: '#4a9fff', boxShadow: '0 0 6px #4a9fff' }} />

      {/* tokens simplificados: ofensiva e defensiva perto da LOS */}
      {Array.from({ length: 6 }, (_, i) => (
        <div key={'o' + i} className="absolute h-2.5 w-2.5 rounded-full transition-all duration-500" style={{ left: `calc(${x(los + (attackingRight ? -2 : 2))}% - 5px)`, top: `${28 + i * 9}%`, background: attackingRight ? home.colors.secondary : away.colors.secondary }} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <div key={'d' + i} className="absolute h-2.5 w-2.5 rounded-full transition-all duration-500" style={{ left: `calc(${x(los + (attackingRight ? 2 : -2))}% - 5px)`, top: `${28 + i * 9}%`, background: attackingRight ? away.colors.secondary : home.colors.secondary }} />
      ))}

      {/* bola */}
      <div className="absolute h-3 w-4 rounded-full transition-all duration-500" style={{ left: `calc(${x(ball)}% - 8px)`, top: '48%', background: '#c8a06a', border: '1px solid #6b4a20' }} />
    </div>
  )
}
