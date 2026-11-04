import { useEffect, useMemo, useState } from 'react'
import { invoke } from '../api/game-client'
import { ControlModeSelector } from '../components/ControlModeSelector'
import { PlayTile } from '../components/PlayTile'
import { playsBySide } from '@core/engine/playbook/plays'
import type { PlaybookHubView, PlaybookSummary } from '@shared/ipc/contract'
import type { Playbook, PlaybookPlay, PlaySide } from '@core/domain/playbook'

type TypeTab = 'offense' | 'defense' | 'special_teams'
const TYPE_LABEL: Record<TypeTab, string> = { offense: 'Ofensivo', defense: 'Defensivo', special_teams: 'Special Teams' }
const SIDE_OF: Record<TypeTab, PlaySide> = { offense: 'offense', defense: 'defense', special_teams: 'special_teams' }

const OFFENSE_SCHEMES = ['air_raid', 'west_coast', 'spread_option', 'power_run', 'vertical', 'pistol_rpo', 'smashmouth']
const DEFENSE_SCHEMES = ['4-3', '3-4', 'nickel', 'dime', 'tampa_2', '46_blitz']

function Bar({ value }: { value: number }): React.JSX.Element {
  const color = value >= 75 ? 'var(--color-positive)' : value >= 45 ? 'var(--color-accent)' : 'var(--color-warning)'
  return (
    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--color-bg-base)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  )
}

export function PlaybookHubScreen(): React.JSX.Element | null {
  const [hub, setHub] = useState<PlaybookHubView | null>(null)
  const [type, setType] = useState<TypeTab>('offense')
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [viewing, setViewing] = useState<Playbook | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScheme, setNewScheme] = useState('west_coast')
  const [jsonBox, setJsonBox] = useState('')
  const [showJson, setShowJson] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = (): void => { invoke('playbook:hub').then(setHub).catch((e) => setErr(String(e))) }
  useEffect(() => { load() }, [])

  const run = async (p: Promise<PlaybookHubView>): Promise<void> => {
    try { setHub(await p); setErr(null) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const list = useMemo(() => {
    if (!hub) return []
    return type === 'offense' ? hub.offensive : type === 'defense' ? hub.defensive : hub.specialTeams
  }, [hub, type])

  if (!hub) return <div className="p-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>{err ?? 'Carregando playbooks...'}</div>

  const openEditor = async (id: string): Promise<void> => {
    const pb = await invoke('playbook:get', { playbookId: id })
    setEditing(pb)
  }
  const openGallery = async (id: string): Promise<void> => {
    const pb = await invoke('playbook:get', { playbookId: id })
    setViewing(pb)
  }
  const createPb = async (): Promise<void> => {
    if (!newName.trim()) return
    await run(invoke('playbook:create', { name: newName.trim(), type, baseScheme: newScheme }))
    setCreating(false); setNewName('')
  }
  const exportPb = async (id: string): Promise<void> => {
    const { json } = await invoke('playbook:export', { playbookId: id })
    setJsonBox(json); setShowJson(true)
  }
  const importPb = async (): Promise<void> => {
    if (!jsonBox.trim()) return
    await run(invoke('playbook:import', { json: jsonBox }))
    setShowJson(false); setJsonBox('')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="section-title" style={{ color: 'var(--color-accent)' }}>Playbooks</div>
          <div className="text-2xl font-black">Identidade Tática</div>
        </div>
        <button className="rounded-md px-3 py-2 text-xs font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={() => { setShowJson((v) => !v); setJsonBox('') }}>Importar/Exportar JSON</button>
      </div>

      <div className="card mb-4 p-4">
        <div className="section-title mb-2">Controle da Partida</div>
        <ControlModeSelector />
      </div>

      {showJson && (
        <div className="card mb-4 p-4">
          <div className="section-title mb-2">JSON do Playbook</div>
          <textarea value={jsonBox} onChange={(e) => setJsonBox(e.target.value)} rows={6} className="w-full rounded-md p-2 text-xs" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }} placeholder="Cole aqui o JSON de um playbook para importar, ou exporte um playbook existente." />
          <div className="mt-2 flex gap-2">
            <button className="btn-neon rounded-md px-4 py-1.5 text-sm font-bold" onClick={importPb}>Importar</button>
            {jsonBox && <button className="rounded-md px-4 py-1.5 text-sm font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={() => navigator.clipboard?.writeText(jsonBox)}>Copiar</button>}
          </div>
        </div>
      )}

      {/* abas de tipo */}
      <div className="mb-3 flex gap-2">
        {(['offense', 'defense', 'special_teams'] as TypeTab[]).map((t) => (
          <button key={t} onClick={() => { setType(t); setEditing(null) }} className="rounded-md px-4 py-1.5 text-sm font-bold" style={{ background: type === t ? 'var(--color-accent)' : 'var(--color-surface)', color: type === t ? '#1a0f00' : 'var(--color-text-secondary)' }}>
            {TYPE_LABEL[t]}
          </button>
        ))}
        <button onClick={() => setCreating((v) => !v)} className="ml-auto rounded-md px-3 py-1.5 text-sm font-bold" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-accent)' }}>+ Criar {TYPE_LABEL[type]}</button>
      </div>

      {creating && (
        <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1">
            <div className="mb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Nome</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }} placeholder="Ex.: Kings Balanced Offense" />
          </div>
          <div>
            <div className="mb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Scheme base</div>
            <select value={newScheme} onChange={(e) => setNewScheme(e.target.value)} className="rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
              {(type === 'offense' ? OFFENSE_SCHEMES : type === 'defense' ? DEFENSE_SCHEMES : ['special_teams']).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn-neon rounded-md px-4 py-2 text-sm font-bold" onClick={createPb}>Criar</button>
        </div>
      )}

      {err && <div className="mb-3 rounded-md p-2 text-sm" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-negative)' }}>{err}</div>}

      {/* lista de playbooks */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((pb) => (
          <PlaybookCard
            key={pb.id}
            pb={pb}
            onActivate={() => run(invoke('playbook:setActive', { type, playbookId: pb.id }))}
            onClone={() => run(invoke('playbook:clone', { playbookId: pb.id, name: `${pb.name} (cópia)` }))}
            onView={() => openGallery(pb.id)}
            onEdit={() => openEditor(pb.id)}
            onExport={() => exportPb(pb.id)}
          />
        ))}
      </div>

      {editing && (
        <PlaybookEditor
          playbook={editing}
          side={SIDE_OF[type]}
          onClose={() => setEditing(null)}
          onRename={async (name) => { await run(invoke('playbook:rename', { playbookId: editing.id, name })); setEditing({ ...editing, name }) }}
          onSetPlays={async (playIds) => {
            await run(invoke('playbook:update', { playbookId: editing.id, playIds }))
            const pb = await invoke('playbook:get', { playbookId: editing.id })
            setEditing(pb)
          }}
        />
      )}

      {viewing && <PlayGalleryModal playbook={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function PlaybookCard({ pb, onActivate, onClone, onView, onEdit, onExport }: {
  pb: PlaybookSummary; onActivate: () => void; onClone: () => void; onView: () => void; onEdit: () => void; onExport: () => void
}): React.JSX.Element {
  return (
    <div className="card p-4" style={pb.active ? { border: '1px solid var(--color-accent)' } : undefined}>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-base font-black">{pb.name}</div>
        {pb.active
          ? <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'var(--color-accent)', color: '#1a0f00' }}>Ativo</span>
          : pb.isCustom ? <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>Custom</span> : null}
      </div>
      <div className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{pb.baseScheme} · {pb.playCount} jogadas</div>
      <div className="mb-1 flex justify-between text-[10px]"><span style={{ color: 'var(--color-text-muted)' }}>Familiaridade</span><span className="font-bold">{pb.familiarity}%</span></div>
      <Bar value={pb.familiarity} />
      <div className="mt-2 flex flex-wrap gap-1">
        {pb.tags.map((t) => <span key={t} className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>{t.replace(/_/g, ' ')}</span>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!pb.active && <button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-accent)', color: '#1a0f00' }} onClick={onActivate}>Ativar</button>}
        <button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-hover)', color: 'var(--color-accent)' }} onClick={onView}>Jogadas</button>
        <button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={onClone}>Clonar</button>
        {pb.isCustom && <button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={onEdit}>Editar</button>}
        <button className="rounded px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={onExport}>Exportar</button>
      </div>
    </div>
  )
}

function PlayGalleryModal({ playbook, onClose }: { playbook: Playbook; onClose: () => void }): React.JSX.Element {
  const byCat = useMemo(() => {
    const groups = new Map<string, PlaybookPlay[]>()
    for (const p of playbook.plays) {
      const arr = groups.get(p.category) ?? []
      arr.push(p)
      groups.set(p.category, arr)
    }
    return [...groups.entries()]
  }, [playbook.plays])

  return (
    <div className="event-backdrop fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(6,10,12,0.92)' }}>
      <div className="card flex max-h-[90vh] w-full max-w-5xl flex-col p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="section-title" style={{ color: 'var(--color-accent)' }}>Jogadas</div>
            <div className="text-xl font-black">{playbook.name} · {playbook.plays.length} jogadas</div>
          </div>
          <button className="rounded-md px-4 py-2 text-sm font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={onClose}>Fechar</button>
        </div>
        <div className="flex-1 overflow-auto">
          {byCat.map(([cat, plays]) => (
            <div key={cat} className="mb-5">
              <div className="section-title mb-2">{cat.replace(/_/g, ' ')}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {plays.map((p) => (
                  <PlayTile key={p.id} play={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlaybookEditor({ playbook, side, onClose, onRename, onSetPlays }: {
  playbook: Playbook; side: PlaySide; onClose: () => void
  onRename: (name: string) => void; onSetPlays: (playIds: string[]) => void
}): React.JSX.Element {
  const [name, setName] = useState(playbook.name)
  const library = useMemo(() => playsBySide(side), [side])
  const selected = useMemo(() => new Set(playbook.plays.map((p) => p.id)), [playbook.plays])

  const toggle = (play: PlaybookPlay): void => {
    const next = new Set(selected)
    if (next.has(play.id)) next.delete(play.id)
    else next.add(play.id)
    onSetPlays([...next])
  }

  const byCat = useMemo(() => {
    const groups = new Map<string, PlaybookPlay[]>()
    for (const p of library) {
      const arr = groups.get(p.category) ?? []
      arr.push(p)
      groups.set(p.category, arr)
    }
    return [...groups.entries()]
  }, [library])

  return (
    <div className="event-backdrop fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(6,10,12,0.9)' }}>
      <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col p-5">
        <div className="mb-3 flex items-center gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== playbook.name && onRename(name.trim())} className="flex-1 rounded-md px-2 py-1.5 text-lg font-black" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{playbook.plays.length} jogadas</span>
          <button className="rounded-md px-4 py-2 text-sm font-bold" style={{ background: 'var(--color-surface-hover)' }} onClick={onClose}>Fechar</button>
        </div>
        <div className="flex-1 overflow-auto">
          {byCat.map(([cat, plays]) => (
            <div key={cat} className="mb-4">
              <div className="section-title mb-2">{cat.replace(/_/g, ' ')}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {plays.map((p) => {
                  const on = selected.has(p.id)
                  return (
                    <PlayTile
                      key={p.id}
                      play={p}
                      onClick={() => toggle(p)}
                      state={on ? 'selected' : 'unselected'}
                      badge={<span className="text-sm font-black" style={{ color: on ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{on ? '✓' : '+'}</span>}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
