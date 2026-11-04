import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/poppins/800.css'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useGameStore } from './stores/gameStore'
import './theme/theme.css'

// expõe o store para automação/depuração (screenshots headless, dev tools)
;(window as unknown as { gameStore: typeof useGameStore }).gameStore = useGameStore

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
