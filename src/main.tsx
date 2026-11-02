import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/theme/fonts'
import './ui/theme/tokens.css'
import { enregistrerServiceWorker } from './pwa/enregistrer'
import { App } from './ui/App'
import { installerAppui } from './ui/mouvement/appui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

installerAppui()
enregistrerServiceWorker()
