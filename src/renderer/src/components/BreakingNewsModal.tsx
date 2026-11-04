import { useEffect, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import type { NewsItem } from '@shared/ipc/contract'

/** Modal de "breaking news" (§10B.9). Reaparece quando o snapshot muda (ex.: após
 * uma contratação) e há uma notícia de destaque não reconhecida. */
export function BreakingNewsModal(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const [news, setNews] = useState<NewsItem | null>(null)

  useEffect(() => {
    invoke('news:getBreaking').then(setNews).catch(() => {})
  }, [snapshot])

  if (!news) return null
  const dismiss = (): void => { invoke('news:acknowledge').finally(() => setNews(null)) }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(6,9,10,0.8)', backdropFilter: 'blur(4px)' }} onClick={dismiss}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="event-card-float w-full max-w-xl overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(150deg, #2a1a05 0%, #14191b 60%)', border: '1px solid var(--color-accent)', boxShadow: 'var(--shadow-glow)' }}
      >
        <div className="flex items-center gap-2 px-5 py-2" style={{ background: 'var(--grad-neon)' }}>
          <span className="text-xs font-black tracking-[0.2em]" style={{ color: '#1a0f00' }}>● BREAKING</span>
          <span className="text-[11px] font-bold" style={{ color: '#2a1a05' }}>MERCADO</span>
        </div>
        <div className="p-6">
          <div className="text-2xl font-black leading-tight text-white">{news.headline}</div>
          <div className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{news.subheadline}</div>
          <button className="btn-neon mt-6 w-full rounded-md py-2.5 font-bold" onClick={dismiss}>Entendido</button>
        </div>
      </div>
    </div>
  )
}
