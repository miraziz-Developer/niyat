import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { circles, initialRequests, people, starterIntent } from './infrastructure/demo/demo-data'
import { NiyatApi } from './infrastructure/http/niyat-api'
import { browserStateStore } from './infrastructure/persistence/browser-storage'
import App from './presentation/App'
import { NetworkProvider } from './presentation/shared/network-context'
import { PersistenceProvider } from './presentation/shared/persistence-context'
import './presentation/styles/global.css'

// Composition root: server mode talks to the API, otherwise the app stays a local-first demo.
const network = import.meta.env.VITE_API_MODE === 'server' ? new NiyatApi() : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistenceProvider store={browserStateStore}>
      <NetworkProvider client={network}>
        <App data={{ circles, initialRequests, people, starterIntent }} />
      </NetworkProvider>
    </PersistenceProvider>
  </StrictMode>,
)
