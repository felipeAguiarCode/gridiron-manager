import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../stores/gameStore'
import { Embers } from '../components/Embers'
import { PHASE_LABEL } from '../lib/format'
import bg1 from '../assets/bg1.png'
import artNova from '../assets/menu-rb3.png'
import artCarregar from '../assets/menu-battle1.png'
import artCriador from '../assets/menu-computer1.png'

const APP_VERSION = '0.1.0'
type View = 'menu' | 'load' | 'creator'

// campo de estádio noturno + scrim escuro por cima para legibilidade
const BG_STYLE: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(10,13,14,0.72), rgba(10,13,14,0.90)), url(${bg1})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center'
}

export function MainMenuScreen(): React.JSX.Element {
  const [view, setView] = useState<View>('menu')
  const saves = useGameStore((s) => s.saves)
  const refreshSaves = useGameStore((s) => s.refreshSaves)
  const loadCareer = useGameStore((s) => s.loadCareer)
  const deleteCareer = useGameStore((s) => s.deleteCareer)
  const navigate = useNavigate()

  useEffect(() => {
    refreshSaves()
  }, [refreshSaves])

  const onLoad = async (slug: string): Promise<void> => {
    await loadCareer(slug)
    navigate('/game')
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center gap-10 p-10" style={BG_STYLE}>
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight" style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}>
          GRIDIRON <span style={{ color: 'var(--color-accent)' }}>MANAGER</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Manager de Futebol Americano — NFL · NCAA · CFL · UFL
        </p>
      </header>

      {view === 'menu' && (
        <div className="grid w-full max-w-5xl grid-cols-1 gap-5 md:grid-cols-[1.15fr_1fr] md:grid-rows-2" style={{ minHeight: 520 }}>
          <MenuBox big className="md:row-span-2" img={artNova} imgClass="left-1/2 -translate-x-1/2 bottom-0 w-[132%] max-w-none" title="Nova Carreira" subtitle="Liga, franquia e head coach" tag="Começar" delay="0s" onClick={() => navigate('/new-career')} />
          <MenuBox img={artCarregar} imgClass="right-0 w-full" title="Carregar" subtitle={`${saves.length} save(s)`} tag="Salvos" delay="1.6s" onClick={() => setView('load')} />
          <MenuBox img={artCriador} imgClass="right-0 w-full" title="Criador" subtitle="Sobre o jogo" tag="Sobre" delay="3.2s" onClick={() => setView('creator')} />
        </div>
      )}

      {view === 'load' && (
        <div className="w-full max-w-2xl">
          <BackBtn onClick={() => setView('menu')} />
          <div className="mt-3 flex flex-col gap-2">
            {saves.length === 0 && <div className="card p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum save. Comece uma Nova Carreira.</div>}
            {saves.map((s) => (
              <div key={s.slug} className="card flex items-center justify-between p-4">
                <div>
                  <div className="font-bold">{s.saveName}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {s.teamName} · {PHASE_LABEL[s.phase]} S{s.seasonNumber} Sem {s.week} · HC {s.coachName}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-neon rounded-md px-4 py-1.5 text-sm font-bold" onClick={() => onLoad(s.slug)}>Carregar</button>
                  <button className="rounded-md px-3 py-1.5 text-sm" style={{ color: 'var(--color-negative)' }} onClick={() => deleteCareer(s.slug)}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'creator' && (
        <div className="card w-full max-w-lg p-6">
          <BackBtn onClick={() => setView('menu')} />
          <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Gridiron Manager — um manager de futebol americano com simulação por drives/downs,
            cards estilo Ultimate Team, salary cap e quatro ligas. Escudos minimalistas, RNG determinístico.
          </p>
        </div>
      )}

      <footer className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        v{APP_VERSION} · escudos minimalistas · determinístico
      </footer>

      {/* brasas leves subindo pela tela */}
      <Embers />
    </div>
  )
}

interface MenuBoxProps {
  title: string
  subtitle: string
  tag: string
  img: string
  imgClass?: string
  big?: boolean
  className?: string
  delay?: string
  onClick: () => void
}

function MenuBox({ title, subtitle, tag, img, imgClass, big, className, delay, onClick }: MenuBoxProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl text-left transition-transform duration-200 will-change-transform hover:scale-[1.02] ${big ? '' : 'min-h-[248px]'} ${className ?? ''}`}
      style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 55%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: 'var(--shadow-card)'
      }}
    >
      {/* arte do jogador sangrando na base/direita — levemente apagada, acende no hover */}
      <img
        src={img}
        alt=""
        className={`pointer-events-none absolute bottom-0 object-contain brightness-[0.68] drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)] transition duration-300 group-hover:brightness-100 ${imgClass ?? 'right-0 h-full'}`}
      />
      {/* scrim superior p/ legibilidade do texto no canto superior esquerdo */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2/5" style={{ background: 'linear-gradient(to bottom, rgba(8,11,12,0.9) 0%, rgba(8,11,12,0.4) 45%, transparent 100%)' }} />
      {/* reflexo de vidro varrendo periodicamente */}
      <span className="sheen" style={{ animationDelay: delay }} />
      {/* contorno de degradê animado — só no hover */}
      <span className="grad-border pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="relative flex h-full flex-col items-start justify-start p-5">
        <div className="section-title mb-1" style={{ color: 'var(--color-accent)' }}>{tag}</div>
        <div className={`font-extrabold leading-tight ${big ? 'text-4xl' : 'text-3xl'}`} style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>{title}</div>
        <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</div>
      </div>
    </button>
  )
}

function BackBtn({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button onClick={onClick} className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>‹ Voltar</button>
  )
}
