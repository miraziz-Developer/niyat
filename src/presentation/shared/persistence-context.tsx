import { createContext, type ReactNode, useContext } from 'react'
import type { StateStore } from '../../application/ports/state-store'

const PersistenceContext = createContext<StateStore | null>(null)

export function PersistenceProvider({ store, children }: { store: StateStore; children: ReactNode }) {
  return <PersistenceContext value={store}>{children}</PersistenceContext>
}

export function useStateStore() {
  const store = useContext(PersistenceContext)
  if (!store) throw new Error('PersistenceProvider is required')
  return store
}