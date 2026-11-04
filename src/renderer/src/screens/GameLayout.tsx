import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/gameStore'
import { TopNav } from '../components/TopNav'
import { SurpriseEventOverlay } from '../components/SurpriseEventOverlay'
import { BreakingNewsModal } from '../components/BreakingNewsModal'

export function GameLayout(): React.JSX.Element | null {
  const snapshot = useGameStore((s) => s.snapshot)
  const error = useGameStore((s) => s.error)
  const clearError = useGameStore((s) => s.clearError)
  const navigate = useNavigate()

  useEffect(() => {
    if (!snapshot) navigate('/')
  }, [snapshot, navigate])

  if (!snapshot) return null

  return (
    <div className="flex h-full flex-col">
      <TopNav />
      {error && (
        <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-negative)' }}>
          <span>{error}</span>
          <button onClick={clearError} className="font-bold">✕</button>
        </div>
      )}
      <main className="flex-1 overflow-auto p-5">
        <Outlet />
      </main>
      {snapshot.pendingEvent && <SurpriseEventOverlay key={`${snapshot.save.seasonNumber}-${snapshot.save.week}`} />}
      <BreakingNewsModal />
    </div>
  )
}
