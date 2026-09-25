import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { circles, initialRequests, people, starterIntent } from './infrastructure/demo/demo-data'
import { browserStateStore } from './infrastructure/persistence/browser-storage'
import App from './presentation/App'
import { PersistenceProvider } from './presentation/shared/persistence-context'
import './presentation/styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistenceProvider store={browserStateStore}>
      <App data={{ circles, initialRequests, people, starterIntent }} />
    </PersistenceProvider>
  </StrictMode>,
)