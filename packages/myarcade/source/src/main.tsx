import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App.tsx'
import { ArcadeProvider } from './arcade.tsx'
import './styles.css'

// A hash address: the gateway has no deep links, and the local page and the website live at different paths.
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <ArcadeProvider>
      <App />
    </ArcadeProvider>
  </HashRouter>,
)
