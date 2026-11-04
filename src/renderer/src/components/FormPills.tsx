export function FormPills({ last5 }: { last5: ('W' | 'L' | 'T')[] }): React.JSX.Element {
  const color = (r: string): string =>
    r === 'W' ? 'var(--color-positive)' : r === 'L' ? 'var(--color-negative)' : 'var(--color-text-muted)'
  return (
    <div className="flex gap-1">
      {last5.map((r, i) => (
        <span key={i} className="flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold" style={{ background: color(r), color: '#0c0f10' }}>
          {r}
        </span>
      ))}
    </div>
  )
}
