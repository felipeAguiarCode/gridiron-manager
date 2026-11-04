interface TeamCrestProps {
  abbr: string
  colors: { primary: string; secondary: string }
  size?: number
}

/**
 * Escudo minimalista — capacete/monograma gerado das cores do time (sem logos
 * oficiais, conforme GDD). Gradiente 135° primary→secondary com o abbr por cima.
 */
export function TeamCrest({ abbr, colors, size = 40 }: TeamCrestProps): React.JSX.Element {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center font-black"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(135deg, ${colors.primary} 48%, ${colors.secondary} 52%)`,
        color: '#fff',
        fontSize: size * 0.34,
        textShadow: '0 1px 2px rgba(0,0,0,0.55)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)'
      }}
    >
      {abbr}
    </div>
  )
}
