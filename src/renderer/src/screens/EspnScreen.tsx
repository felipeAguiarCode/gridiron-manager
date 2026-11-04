import { useEffect, useMemo, useState } from 'react'
import { invoke } from '../api/game-client'
import { useGameStore } from '../stores/gameStore'
import type { NewsView, NewsItem, FeedView, FeedPost } from '@shared/ipc/contract'

// Normalized "blog article" — funde NewsItem (rico) e FeedPost (curto) num só formato.
type EspnEntry = {
  id: string
  kind: 'news' | 'feed'
  breaking: boolean
  catKey: string
  catLabel: string
  icon: string
  tone?: 'good' | 'bad' | 'neutral'
  title: string
  body?: string
  seasonNumber: number
  week: number
}

const NEWS_CAT: Record<NewsItem['type'], { key: string; label: string; icon: string }> = {
  signing: { key: 'signing', label: 'Contratação', icon: '💼' },
  trade: { key: 'trade', label: 'Troca', icon: '🔁' },
  draft_pick: { key: 'draft', label: 'Draft', icon: '🎯' },
  comeback: { key: 'comeback', label: 'Retorno', icon: '↩️' },
  holdout: { key: 'holdout', label: 'Holdout', icon: '✋' },
  injury: { key: 'injury', label: 'Lesão', icon: '🚑' },
  rumor: { key: 'rumor', label: 'Rumor', icon: '💬' },
  deadline: { key: 'deadline', label: 'Deadline', icon: '⏰' }
}
const FEED_CAT: Record<FeedPost['category'], { key: string; label: string; icon: string }> = {
  game: { key: 'game', label: 'Jogo', icon: '🏈' },
  event: { key: 'event', label: 'Bastidores', icon: '✨' },
  transaction: { key: 'transaction', label: 'Mercado', icon: '💼' },
  board: { key: 'board', label: 'Diretoria', icon: '🏛️' }
}
const TONE: Record<string, string> = { good: 'var(--color-positive)', bad: 'var(--color-negative)', neutral: 'var(--color-text-muted)' }

type FilterKey = 'all' | 'breaking' | 'game' | 'market' | 'event' | 'draft' | 'board'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'breaking', label: 'Breaking' },
  { key: 'game', label: '🏈 Jogo' },
  { key: 'market', label: '💼 Mercado' },
  { key: 'event', label: '✨ Bastidores' },
  { key: 'draft', label: '🎯 Draft' },
  { key: 'board', label: '🏛️ Diretoria' }
]
const matchesFilter = (e: EspnEntry, f: FilterKey): boolean => {
  switch (f) {
    case 'all': return true
    case 'breaking': return e.breaking
    case 'game': return e.catKey === 'game'
    case 'market': return e.catKey === 'signing' || e.catKey === 'trade' || e.catKey === 'transaction'
    case 'event': return e.catKey === 'event'
    case 'draft': return e.catKey === 'draft'
    case 'board': return e.catKey === 'board'
  }
}

export function EspnScreen(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const [news, setNews] = useState<NewsView | null>(null)
  const [feed, setFeed] = useState<FeedView | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    Promise.all([invoke('news:get'), invoke('feed:get')])
      .then(([n, f]) => { setNews(n); setFeed(f) })
      .catch(() => {})
  }, [snapshot?.save.week])

  const allEntries = useMemo<EspnEntry[]>(() => {
    if (!news || !feed) return []
    // Uma contratação de FA grava news (signing) E uma transação no feed (mesma season/week).
    // Preferimos a news rica: dropamos os posts de transação (tom não-negativo) da mesma semana.
    const signingWeeks = new Set(
      news.items.filter((n) => n.type === 'signing').map((n) => `${n.seasonNumber}:${n.week}`)
    )
    const newsEntries: EspnEntry[] = news.items.map((n) => {
      const cat = NEWS_CAT[n.type] ?? { key: n.type, label: n.type, icon: '📰' }
      return {
        id: `news-${n.id}`, kind: 'news', breaking: n.importance === 'breaking',
        catKey: cat.key, catLabel: cat.label, icon: cat.icon,
        title: n.headline, body: n.subheadline, seasonNumber: n.seasonNumber, week: n.week
      }
    })
    const feedEntries: EspnEntry[] = feed.posts
      .filter((p) => !(p.category === 'transaction' && p.tone !== 'bad' && signingWeeks.has(`${p.seasonNumber}:${p.week}`)))
      .map((p) => {
        const cat = FEED_CAT[p.category]
        return {
          id: `feed-${p.id}`, kind: 'feed', breaking: false,
          catKey: cat.key, catLabel: cat.label, icon: cat.icon, tone: p.tone,
          title: p.text, seasonNumber: p.seasonNumber, week: p.week
        }
      })
    return [...newsEntries, ...feedEntries].sort((a, b) => {
      if (a.seasonNumber !== b.seasonNumber) return b.seasonNumber - a.seasonNumber
      if (a.week !== b.week) return b.week - a.week
      if (a.breaking !== b.breaking) return a.breaking ? -1 : 1
      if (a.kind !== b.kind) return a.kind === 'news' ? -1 : 1
      return 0
    })
  }, [news, feed])

  const filtered = useMemo(() => allEntries.filter((e) => matchesFilter(e, filter)), [allEntries, filter])
  if (!snapshot || !news || !feed) return null

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-accent)' }}>ESPN</span>
          <span className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>Central de notícias e bastidores</span>
        </div>
        <div className="mt-2 h-1 rounded" style={{ background: 'var(--color-accent)' }} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className="rounded-md px-3 py-1 text-xs font-bold"
            style={{ background: filter === f.key ? 'var(--color-accent)' : 'var(--color-surface)', color: filter === f.key ? '#1a0f00' : 'var(--color-text-secondary)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Sem novidades ainda. Avance a temporada.</div>
      ) : (
        <>
          <HeroCard e={filtered[0]} />
          <div className="flex flex-col gap-2">
            {filtered.slice(1).map((e) => <ArticleCard key={e.id} e={e} />)}
          </div>
        </>
      )}
    </div>
  )
}

function CatBadge({ e, big }: { e: EspnEntry; big?: boolean }): React.JSX.Element {
  return (
    <span className={`rounded px-2 py-0.5 font-black ${big ? 'text-xs' : 'text-[10px]'}`}
      style={{ background: e.breaking ? 'var(--color-accent)' : 'var(--color-surface-hover)', color: e.breaking ? '#1a0f00' : 'var(--color-text-secondary)' }}>
      {e.breaking ? 'BREAKING' : `${e.icon} ${e.catLabel.toUpperCase()}`}
    </span>
  )
}

function HeroCard({ e }: { e: EspnEntry }): React.JSX.Element {
  return (
    <div className="card mb-4 p-5" style={{ borderColor: e.breaking ? 'var(--color-accent)' : 'var(--color-border)', borderWidth: e.breaking ? 2 : 1 }}>
      <div className="mb-2 flex items-center gap-2">
        <CatBadge e={e} big />
        <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>S{e.seasonNumber} · Sem {e.week}</span>
      </div>
      <div className="text-2xl font-black leading-tight">{e.title}</div>
      {e.body && <div className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{e.body}</div>}
      <div className="mt-3 text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>ESPN · {e.catLabel}</div>
    </div>
  )
}

function ArticleCard({ e }: { e: EspnEntry }): React.JSX.Element {
  return (
    <div className="card p-4" style={e.breaking ? { borderColor: 'var(--color-accent)' } : undefined}>
      <div className="mb-1 flex items-center gap-2">
        <CatBadge e={e} />
        <span className="ml-auto text-[11px]" style={{ color: 'var(--color-text-muted)' }}>S{e.seasonNumber} · Sem {e.week}</span>
      </div>
      <div className="text-base font-bold leading-snug">{e.title}</div>
      {e.body && <div className="mt-0.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{e.body}</div>}
      {e.kind === 'feed' && e.tone && (
        <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <span style={{ color: TONE[e.tone] }}>●</span> {e.catLabel}
        </div>
      )}
    </div>
  )
}
