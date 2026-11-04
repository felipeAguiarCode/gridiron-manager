import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { registerIpcHandlers } from './ipc/router'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Sequência de screenshots dirigindo o app via IPC real (dev tooling, flag --shot). */
async function runShots(): Promise<void> {
  registerIpcHandlers()
  const win = new BrowserWindow({
    width: 1440, height: 900, show: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  })
  win.webContents.on('console-message', (_e, _lvl, msg) => console.log('[renderer]', msg))
  await win.loadFile(join(__dirname, '../renderer/index.html'))
  const dir = process.env.SHOT_DIR || join(app.getAppPath(), '.shots')
  mkdirSync(dir, { recursive: true })
  const shot = async (name: string): Promise<void> => {
    const img = await win.webContents.capturePage()
    writeFileSync(join(dir, name), img.toPNG())
  }
  const js = (code: string): Promise<unknown> => win.webContents.executeJavaScript(code)

  const clickText = (t: string): string => `[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(t)}))?.click()`
  await delay(900); await shot('01-menu.png')
  await js(`location.hash='#/new-career'`); await delay(600); await shot('01a-leagues.png')
  // NCAA (42 programas): franchise + prova de que o schedule de 42 times monta
  await js(clickText('NCAA')); await delay(1700); await shot('01c-ncaa-franchise.png')
  await js(`(async()=>{ const s=window.gameStore.getState(); await s.createCareer({saveName:'ShotNCAA', league:'ncaa', teamId:'ncaa-army', coachName:'Coach Shot', coachArchetype:'offensive_guru'}); location.hash='#/game/competition'; })()`)
  await delay(1800)
  // rola até a divisão "Group of 5" (última) p/ mostrar Army + Navy
  await js(`(()=>{ const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+80 && getComputedStyle(e).overflowY!=='visible'); els.sort((a,b)=>b.scrollHeight-a.scrollHeight); if(els[0]) els[0].scrollTop=els[0].scrollHeight; window.scrollTo(0,document.body.scrollHeight); })()`)
  await delay(500); await shot('01d-ncaa-standings.png')
  await js(`location.hash='#/new-career'`); await delay(700)
  await js(clickText('NFL')); await delay(1700); await shot('01b-franchise.png')
  // cria carreira e avança até um acontecimento surpresa aparecer
  await js(`(async()=>{ const s = window.gameStore.getState(); await s.createCareer({saveName:'Shot', league:'nfl', teamId:'nfl-gb', coachName:'Coach Shot', coachArchetype:'offensive_guru'}); let g=0; while(g++<12){ const r=await s.advanceWeek(); window.__gid = r&&r.userGameId ? r.userGameId : window.__gid; if(window.gameStore.getState().snapshot?.pendingEvent) break; } location.hash='#/game'; })()`)
  await delay(2000); await shot('01b-event.png')
  // resolve o evento e avança mais algumas semanas
  await js(`(async()=>{ const s=window.gameStore.getState(); if(s.snapshot?.pendingEvent) await s.chooseEvent(0); for(let i=0;i<5;i++){ if(window.gameStore.getState().snapshot?.pendingEvent){ await s.chooseEvent(0); i--; continue; } const r=await s.advanceWeek(); window.__gid=r&&r.userGameId?r.userGameId:window.__gid; } while(window.gameStore.getState().snapshot?.pendingEvent){ await s.chooseEvent(0); } location.hash='#/game'; })()`)
  await delay(2000); await shot('02-home.png')
  await js(`location.hash='#/game/office'`); await delay(900); await shot('02b-office-tecnico.png')
  await js(`location.hash='#/game/roster'`); await delay(1200)
  await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Depth Chart'); if(b) b.click();})()`)
  await delay(900); await shot('03-depthchart.png')
  // Campo 3D (Mode 7): formação de ataque e troca de unidade via seta
  await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Campo 3D'); if(b) b.click();})()`)
  await delay(1000); await shot('03b-field-offense.png')
  await js(clickText('›')); await delay(900); await shot('03c-field-defense.png')
  await js(clickText('›')); await delay(900); await shot('03d-field-special.png')
  await js(`location.hash='#/game/competition'`); await delay(600); await shot('04-standings.png')
  await js(`if(window.__gid) location.hash='#/game-day/'+window.__gid`)
  await delay(1500); await shot('05-gameday-pre.png')
  await js(clickText('Kickoff')); await delay(400); await js(clickText('4x')); await delay(2500); await shot('06-gameday-live.png')
  // celebração de TD/fumble surge automaticamente durante o replay — espera e captura
  await js(`(async()=>{ const has=()=>document.body.innerText.includes('TOUCHDOWN!')||document.body.innerText.includes('FUMBLE!'); for(let i=0;i<400;i++){ if(has()) return true; await new Promise(r=>setTimeout(r,80)); } return false; })()`)
  await delay(350); await shot('06a-celebration.png')
  await js(clickText('OK'))
  await js(clickText('Pular')); await delay(1400); await shot('07-gameday-post.png')
  await js(`location.hash='#/game/market'`); await delay(1000); await shot('08b-market-live.png')
  await js(clickText('Negociar')); await delay(1000); await shot('08c-negotiation.png')
  await js(clickText('Sair')); await delay(300)
  // contratação completa via IPC (libera cap + oferta generosa) → dispara breaking news
  await js(`(async()=>{ const inv=async(c,p)=>{const r=await window.api.invoke(c,p);return r.ok?r.data:Promise.reject(r);}; const mkt=await inv('market:get'); const exp=[...mkt.roster].sort((a,b)=>b.capHit-a.capHit)[0]; if(exp) await inv('market:release',{playerId:exp.id}); const pulse=await inv('market:pulse'); const ch=[...pulse.listings].sort((a,b)=>a.player.capHit-b.player.capHit)[0]; if(ch){ let v=await inv('negotiation:start',{playerId:ch.player.id}); const e=v.session.expectation; v=await inv('negotiation:submitOffer',{years:e.years,salaryPerYear:Math.round(e.salaryPerYear*1.3),rolePromise:e.role}); if(v.session&&v.session.status==='accepted'){ await inv('negotiation:finalize'); } } await window.gameStore.getState().refreshSnapshot(); })()`)
  await delay(1400); await shot('08d-breaking.png')
  await js(clickText('Entendido')); await delay(400)
  await js(`location.hash='#/game/espn'`); await delay(700); await shot('08e-espn.png')
  await js(`location.hash='#/game/market'`); await delay(500)
  await js(clickText('Free Agency')); await delay(500); await shot('08-market-fa.png')
  await js(clickText('Trade Block')); await delay(600); await shot('08f-tradeblock.png')
  await js(clickText('Lendas')); await delay(600); await shot('08g-legends.png')
  await js(clickText('Trocas')); await delay(800); await shot('09-market-trade.png')
  await js(`location.hash='#/game/scouts'`); await delay(900); await shot('10-scouts.png')

  // ===== Máquina de fases da offseason (§10B): simula a temporada até 'finished' e caminha pela offseason
  await js(`(async()=>{ const s=window.gameStore.getState(); let g=0; while(g++<45){ const snap=window.gameStore.getState().snapshot; if(snap && snap.save.phase==='finished') break; if(snap && snap.pendingEvent){ await s.chooseEvent(0); continue; } await s.advanceWeek(); } location.hash='#/game/calendar'; })()`)
  await delay(1500); await shot('11a-finished.png')
  await js(clickText('Iniciar Offseason')); await delay(1000); await shot('11b-offseason.png')
  await js(clickText('Ir ao Draft')); await delay(700)
  await js(`location.hash='#/game/draft'`); await delay(900)
  await js(clickText('Escutar')); await delay(300); await js(clickText('Mirar')); await delay(300); await shot('11c-draft.png')
  await js(clickText('Executar Draft Night')); await delay(1600); await shot('11d-draft-results.png')
  await js(clickText('Fechar')); await delay(300)
  await js(`location.hash='#/game/calendar'`); await delay(600)
  await js(clickText('Free Agency')); await delay(1000); await shot('11e-freeagency.png')
  await js(clickText('Abrir Pré-Temporada')); await delay(700)
  await js(`location.hash='#/game/preseason'`); await delay(700)
  await js(clickText('Coesão da O-Line')); await delay(300)
  await js(clickText('Rodar Training Camp')); await delay(900); await shot('11f-preseason.png')
  await js(`location.hash='#/game/calendar'`); await delay(500)
  await js(clickText('Começar Temporada')); await delay(1200); await shot('11g-newseason.png')
  await js(`location.hash='#/game/espn'`); await delay(900); await shot('11-espn.png')
  await js(`location.hash='#/game/editor'`); await delay(1000); await shot('12-editor.png')

  // ===== §8B: Playbooks & Play Calling — jogo interativo (Key Moments) =====
  await js(`(async()=>{
    const s=window.gameStore.getState();
    await s.createCareer({saveName:'ShotPlay', league:'nfl', teamId:'nfl-kc', coachName:'Coach PC', coachArchetype:'offensive_guru'});
    await window.api.invoke('settings:setControlMode', { mode:'full_coach_control' });
    await s.refreshSnapshot();
    let gid=null, g=0;
    while(g++<6){ const r=await s.advanceWeek(); if(r&&r.userGameId){ gid=r.userGameId; if(r.interactivePending) break; } if(window.gameStore.getState().snapshot?.pendingEvent){ await s.chooseEvent(0); } }
    window.__pcgid=gid; if(gid) location.hash='#/game-day/'+gid;
  })()`)
  await delay(2000); await shot('13a-playcall-pre.png')
  await js(clickText('Kickoff')); await delay(300); await js(clickText('4x')); await delay(6000); await shot('13b-playcall-overlay.png')
  // aceita a recomendação do coordenador (banner "Chamar")
  await js(clickText('Chamar')); await delay(4000); await shot('13c-playcall-after.png')
  // próxima decisão (ofensiva/defensiva conforme a posse)
  await js(clickText('Chamar')); await delay(4000); await shot('13d-playcall-next.png')
  // Playbook hub + editor
  await js(`location.hash='#/game/playbooks'`); await delay(1200); await shot('14a-playbook-hub.png')
  await js(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Clonar'); if(b) b.click(); })()`); await delay(1000)
  await js(`(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Editar'); if(b) b.click(); })()`); await delay(1000); await shot('14b-playbook-editor.png')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0f10',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.argv.includes('--shot')) {
    try {
      await runShots()
      app.exit(0)
    } catch (err) {
      console.error('[shot] FALHOU:', err)
      app.exit(1)
    }
    return
  }

  if (process.argv.includes('--smoke')) {
    try {
      const { runSmoke } = await import('./smoke')
      await runSmoke()
      app.exit(0)
    } catch (err) {
      console.error('[smoke] FALHOU:', err)
      app.exit(1)
    }
    return
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
